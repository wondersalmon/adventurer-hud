import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async file => JSON.parse(await readFile(file, "utf8"));

test("manifest and package versions match", async () => {
  const manifest = await readJson("module.json");
  const packageJson = await readJson("package.json");

  assert.equal(manifest.id, "adventurer-hud");
  assert.equal(manifest.type, "module");
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.url, "https://github.com/wondersalmon/adventurer-hud");
  assert.match(manifest.manifest, /releases\/latest\/download\/module\.json$/);
  assert.match(
    manifest.download,
    new RegExp(
      `releases/download/v${packageJson.version}/adventurer-hud\\.zip$`
    )
  );
  assert.ok(manifest.readme);
  assert.ok(manifest.changelog);
  assert.ok(manifest.bugs);
  assert.ok(manifest.license);
  assert.ok(Array.isArray(manifest.media) && manifest.media.length > 0);
  assert.ok(manifest.media.every(entry => entry.type && entry.url));
});

test("manifest targets Foundry 14 and dnd5e 5.3+", async () => {
  const manifest = await readJson("module.json");
  const dnd5e = manifest.relationships.systems.find(
    system => system.id === "dnd5e"
  );

  assert.equal(manifest.compatibility.minimum, "14");
  assert.equal(dnd5e.compatibility.minimum, "5.3.0");
});

test("manifest loads split HUD styles in cascade order", async () => {
  const manifest = await readJson("module.json");
  assert.deepEqual(manifest.styles, [
    "styles/dialogs.css",
    "styles/adventurer-hud.css",
    "styles/combat.css",
    "styles/shared.css",
    "styles/death.css",
    "styles/responsive.css"
  ]);
});
