import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishFoundryRelease } from "../tools/publish-foundry.mjs";

const manifest = JSON.parse(await readFile("module.json", "utf8"));
const token = "fvttp_test-token";
const tag = "v" + manifest.version;
const versioned = manifest.url + "/releases/download/" + tag;
const runPublication = async (post, { asset } = {}) => {
  const requests = [],
    delays = [],
    messages = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, ...options });
    assert.equal(options.signal instanceof AbortSignal, true);
    if (options.method === "POST")
      return post(
        requests.filter(row => row.method === "POST").length,
        options
      );
    const override = asset?.(url, options);
    if (override) return override;
    if (url === versioned + "/module.json")
      return Response.json({
        ...manifest,
        download: versioned + "/adventurer-hud.zip"
      });
    if (url === versioned + "/adventurer-hud.zip" && options.method === "HEAD")
      return new Response(null);
    throw new Error("Unexpected request: " + url);
  };
  let error;
  try {
    await publishFoundryRelease({
      tag,
      token,
      fetchImpl,
      sleep: async delay => {
        delays.push(delay);
      },
      now: () => 0,
      log: message => messages.push(message)
    });
  } catch (failure) {
    error = failure;
  }
  return { requests, delays, messages, error };
};

test("release workflow invokes the tested publisher with scoped secret and same-tag concurrency", async () => {
  const source = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(
    source,
    /run: node \.release-tools\/tools\/publish-foundry\.mjs/
  );
  assert.match(source, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(
    source,
    /FOUNDRY_RELEASE_TOKEN: \$\{\{ secrets\.FOUNDRY_RELEASE_TOKEN \}\}/
  );
  assert.match(
    source,
    /group: foundry-release-\$\{\{ inputs\.tag \|\| github\.ref_name \}\}/
  );
  assert.match(source, /cancel-in-progress: false/);
});

test("publisher sends exact versioned assets and compatibility to Foundry", async () => {
  const result = await runPublication(() =>
    Response.json({ status: "success" })
  );
  assert.equal(result.error, undefined);
  const post = result.requests.find(row => row.method === "POST");
  assert.equal(post.headers.Authorization, token);
  const payload = JSON.parse(post.body);
  assert.equal(payload.id, manifest.id);
  assert.equal(payload.release.version, manifest.version);
  assert.equal(payload.release.manifest, versioned + "/module.json");
  assert.deepEqual(payload.release.compatibility, manifest.compatibility);
});

test("publisher accepts an already registered version without further requests", async () => {
  const result = await runPublication(() =>
    Response.json(
      { errors: { __all__: [{ code: "unique_together" }] } },
      { status: 400 }
    )
  );
  assert.equal(result.error, undefined);
  assert.match(result.messages[0], /already has Adventurer HUD/);
  assert.equal(result.delays.length, 0);
});

test("publisher respects seconds and HTTP date Retry-After values", async () => {
  for (const value of ["3", "Thu, 01 Jan 1970 00:00:03 GMT"]) {
    const result = await runPublication(attempt =>
      attempt === 1
        ? new Response("Busy", {
            status: 429,
            headers: { "Retry-After": value }
          })
        : Response.json({ status: "success" })
    );
    assert.equal(result.error, undefined);
    assert.deepEqual(result.delays, [3000]);
    assert.equal(
      result.requests.filter(row => row.method === "POST").length,
      2
    );
  }
});

test("publisher retries transient HTML and network/timeout failures", async () => {
  for (const failure of [
    () => new Response("<html>Unavailable</html>", { status: 503 }),
    () => {
      throw new TypeError("fetch failed");
    },
    () => {
      throw new DOMException("timed out", "TimeoutError");
    }
  ]) {
    const result = await runPublication(attempt =>
      attempt === 1 ? failure() : Response.json({ status: "success" })
    );
    assert.equal(result.error, undefined);
    assert.deepEqual(result.delays, [1000]);
  }
});

test("publisher has bounded retries and rejects excessive server delays", async () => {
  const result = await runPublication(
    () => new Response("Unavailable", { status: 503 })
  );
  assert.match(
    result.error.message,
    /Foundry publication failed \(503\).*Non-JSON/
  );
  assert.deepEqual(result.delays, [1000, 2000, 4000, 8000]);
  assert.equal(result.requests.filter(row => row.method === "POST").length, 5);
  const delayed = await runPublication(
    () =>
      new Response("Busy", { status: 429, headers: { "Retry-After": "3600" } })
  );
  assert.match(delayed.error.message, /retry delay exceeds/);
  assert.deepEqual(delayed.delays, []);
});

test("publisher does not retry validation/auth failures or expose its token", async () => {
  for (const status of [400, 401, 403]) {
    const result = await runPublication(() =>
      Response.json({ errors: { detail: token } }, { status })
    );
    assert.equal(
      result.error.message.includes("failed (" + status + ")"),
      true
    );
    assert.equal(result.error.message.includes(token), false);
    assert.equal(
      result.requests.filter(row => row.method === "POST").length,
      1
    );
    assert.deepEqual(result.delays, []);
  }
});

test("publisher waits for assets but never publishes a mismatched manifest", async () => {
  let attempts = 0;
  const available = await runPublication(
    () => Response.json({ status: "success" }),
    {
      asset: url =>
        url.endsWith("module.json") && ++attempts === 1
          ? new Response("Not yet available", { status: 404 })
          : null
    }
  );
  assert.equal(available.error, undefined);
  assert.deepEqual(available.delays, [1000]);
  const mismatched = await runPublication(
    () => {
      throw new Error("Must not publish");
    },
    {
      asset: url =>
        url.endsWith("module.json")
          ? Response.json({ ...manifest, version: "wrong" })
          : null
    }
  );
  assert.match(mismatched.error.message, /does not match/);
  assert.equal(
    mismatched.requests.some(row => row.method === "POST"),
    false
  );
});

test("publisher rejects invalid tag/token before accessing the network", async () => {
  for (const options of [
    { tag: "main", token },
    { tag, token: "invalid" },
    { tag: "v999.0.0", token }
  ]) {
    await assert.rejects(
      publishFoundryRelease({
        ...options,
        fetchImpl: () => {
          assert.fail("No network allowed");
        }
      }),
      /tag|TOKEN|versions differ/
    );
  }
});
