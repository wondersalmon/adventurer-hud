import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async file => JSON.parse(await readFile(file, "utf8"));

test("manifest and package versions match", async () => {
  const manifest = await readJson("module.json");
  const packageJson = await readJson("package.json");

  assert.equal(manifest.id, "adventurer-hud");
  assert.equal(manifest.version, packageJson.version);
});

test("manifest targets Foundry 14 and dnd5e 5.3+", async () => {
  const manifest = await readJson("module.json");
  const dnd5e = manifest.relationships.systems.find(
    system => system.id === "dnd5e"
  );

  assert.equal(manifest.compatibility.minimum, "14");
  assert.equal(dnd5e.compatibility.minimum, "5.3.0");
});
