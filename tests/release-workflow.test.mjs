import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(".github/workflows/release.yml", "utf8");
const manifest = JSON.parse(await readFile("module.json", "utf8"));
const block = workflow.match(
  /          node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n          NODE/
);
assert.ok(block, "Foundry publication script must be present in the workflow");
const publicationScript = block[1]
  .split(/\r?\n/)
  .map(line => line.replace(/^          /, ""))
  .join("\n");

const runPublication = result => {
  const prelude = `
    globalThis.fetch = async (url, options = {}) => {
      const version = ${JSON.stringify(manifest.version)};
      const repo = ${JSON.stringify(manifest.url)};
      const tag = "v" + version;
      if (url === repo + "/releases/download/" + tag + "/module.json") {
        return { ok: true, json: async () => ({
          id: ${JSON.stringify(manifest.id)},
          version,
          download: repo + "/releases/download/" + tag + "/adventurer-hud.zip"
        }) };
      }
      if (url === repo + "/releases/download/" + tag + "/adventurer-hud.zip" && options.method === "HEAD") {
        return { ok: true };
      }
      if (url === "https://foundryvtt.com/_api/packages/release_version/" && options.method === "POST") {
        console.log("PUBLISH_PAYLOAD:" + options.body);
        return { ok: ${result.status === 200}, status: ${result.status}, json: async () => (${JSON.stringify(result.body)}) };
      }
      throw new Error("Unexpected network request: " + url);
    };
  `;
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", prelude + publicationScript],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_TAG: `v${manifest.version}`,
        FOUNDRY_RELEASE_TOKEN: "fvttp_test-token"
      }
    }
  );
};

test("release workflow sends the versioned GitHub assets to Foundry", () => {
  const result = runPublication({ status: 200, body: { status: "success" } });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout
    .split("\n")
    .find(value => value.startsWith("PUBLISH_PAYLOAD:"));
  assert.ok(line);
  const payload = JSON.parse(line.slice("PUBLISH_PAYLOAD:".length));
  assert.equal(payload.id, manifest.id);
  assert.equal(payload.release.version, manifest.version);
  assert.equal(
    payload.release.manifest,
    `${manifest.url}/releases/download/v${manifest.version}/module.json`
  );
  assert.deepEqual(payload.release.compatibility, manifest.compatibility);
});

test("release workflow accepts an already published Foundry version", () => {
  const result = runPublication({
    status: 400,
    body: { errors: { __all__: [{ code: "unique_together" }] } }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already has Adventurer HUD/);
});
