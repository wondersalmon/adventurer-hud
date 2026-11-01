import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
const config = {
  id: "adventurer-hud",
  title: "Adventurer HUD",
  repository: "https://github.com/wondersalmon/adventurer-hud",
  archive: "adventurer-hud.zip"
};
export function parseVersion(version) {
  if (
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.[1-9]\d*)?$/.test(
      version ?? ""
    )
  )
    throw new Error("Use a stable version or a beta.N version.");
  return { version, tag: `v${version}`, beta: version.includes("-") };
}

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
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
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
  parseVersion(tag.slice(1));
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
  const compatibility = {};
  for (const key of ["minimum", "verified", "maximum"]) {
    const value = manifest.compatibility?.[key];
    if (
      key === "maximum" &&
      (value === undefined || value === null || value === "")
    )
      continue;
    if (typeof value !== "string" || !/^\d+(?:\.\d+)*$/.test(value))
      throw new Error(
        `module.json compatibility.${key} must contain a Foundry version before publication.`
      );
    compatibility[key] = value;
  }
  const repository = manifest.url.replace(/\/$/, "");
  if (repository !== config.repository || manifest.id !== config.id)
    throw new Error("Unexpected package ID or repository URL in module.json.");
  const release = `${repository}/releases/download/${tag}`;
  const manifestUrl = `${release}/module.json`;
  const downloadUrl = `${release}/${config.archive}`;
  const context = { fetchImpl, sleep, now };
  const remote = await request(manifestUrl, { method: "GET" }, context, true);
  if (!remote.ok)
    throw new Error(
      `Release asset unavailable: ${manifestUrl} (${remote.status}).`
    );
  if (
    remote.body?.id !== manifest.id ||
    remote.body?.version !== version ||
    remote.body?.download !== downloadUrl ||
    ["minimum", "verified", "maximum"].some(
      key => remote.body?.compatibility?.[key] !== compatibility[key]
    )
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
    log(`Foundry already has ${config.title} ${version}.`);
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
    log(`Published ${config.title} ${version} to Foundry.`);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  publishFoundryRelease({
    tag: process.env.RELEASE_TAG,
    token: process.env.FOUNDRY_RELEASE_TOKEN ?? process.env.RAT_RELEASE_TOKEN
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
