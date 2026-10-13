import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const retryStatuses = new Set([429, 500, 502, 503, 504]);

async function request(url, options, context, asset = false) {
  const { fetchImpl, sleep, now } = context;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    let text;
    try {
      response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(15000)
      });
      text = options.method === "HEAD" ? "" : await response.text();
    } catch (error) {
      if (
        attempt === 4 ||
        (!(error instanceof TypeError) &&
          !["AbortError", "TimeoutError"].includes(error.name))
      )
        throw new Error(`Release request failed: ${url}`, { cause: error });
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (
      attempt < 4 &&
      (retryStatuses.has(response.status) || (asset && response.status === 404))
    ) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter == null ? NaN : Number(retryAfter);
      const requestedDelay = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter) - now();
      const delay = Math.max(
        1000 * 2 ** attempt,
        Number.isFinite(requestedDelay) ? requestedDelay : 0
      );
      if (delay > 60000)
        throw new Error(`Release retry delay exceeds 60 seconds: ${url}`);
      await sleep(delay);
      continue;
    }
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Error responses can be HTML; never include their arbitrary body in logs.
    }
    return { ok: response.ok, status: response.status, body };
  }
}

export async function publishFoundryRelease({
  tag,
  token,
  root = process.cwd(),
  fetchImpl = fetch,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
  now = Date.now,
  log = console.log
}) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag))
    throw new Error("Release tag must look like v1.2.0.");
  if (tag.includes("-"))
    throw new Error(
      "Prereleases are GitHub-only and must not be published to Foundry Packages."
    );
  if (!token?.startsWith("fvttp_"))
    throw new Error(
      "FOUNDRY_RELEASE_TOKEN GitHub Secret is missing or invalid."
    );
  const version = tag.slice(1);
  const manifest = JSON.parse(
    await readFile(path.join(root, "module.json"), "utf8")
  );
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
  );
  if (manifest.version !== version || packageJson.version !== version)
    throw new Error(
      "Release tag, module.json and package.json versions differ."
    );
  const repository = manifest.url.replace(/\/$/, "");
  if (repository !== "https://github.com/wondersalmon/adventurer-hud")
    throw new Error("Unexpected repository URL in module.json.");
  const release = `${repository}/releases/download/${tag}`;
  const manifestUrl = `${release}/module.json`;
  const downloadUrl = `${release}/adventurer-hud.zip`;
  const context = { fetchImpl, sleep, now };
  const remote = await request(manifestUrl, { method: "GET" }, context, true);
  if (!remote.ok)
    throw new Error(
      `Release asset unavailable: ${manifestUrl} (${remote.status}).`
    );
  if (
    remote.body?.id !== manifest.id ||
    remote.body?.version !== version ||
    remote.body?.download !== downloadUrl
  )
    throw new Error("Published GitHub manifest does not match this release.");
  const download = await request(
    downloadUrl,
    { method: "HEAD" },
    context,
    true
  );
  if (!download.ok)
    throw new Error(
      `Release asset unavailable: ${downloadUrl} (${download.status}).`
    );
  const compatibility = {
    minimum: String(manifest.compatibility.minimum),
    verified: String(manifest.compatibility.verified)
  };
  if (manifest.compatibility.maximum)
    compatibility.maximum = String(manifest.compatibility.maximum);
  const payload = {
    id: manifest.id,
    release: {
      version,
      manifest: manifestUrl,
      notes: `${repository}/releases/tag/${tag}`,
      compatibility
    }
  };
  const response = await request(
    "https://foundryvtt.com/_api/packages/release_version/",
    {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    context
  );
  if (
    response.status === 400 &&
    response.body?.errors?.__all__?.some(
      error => error.code === "unique_together"
    )
  ) {
    log(`Foundry already has Adventurer HUD ${version}.`);
  } else if (!response.ok || response.body?.status !== "success") {
    const detail = JSON.stringify(
      response.body?.errors ?? response.body ?? "Non-JSON response"
    )
      .replaceAll(token, "[redacted]")
      .slice(0, 1000);
    throw new Error(
      `Foundry publication failed (${response.status}): ${detail}`
    );
  } else {
    log(`Published Adventurer HUD ${version} to Foundry.`);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  publishFoundryRelease({
    tag: process.env.RELEASE_TAG,
    token: process.env.FOUNDRY_RELEASE_TOKEN
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
