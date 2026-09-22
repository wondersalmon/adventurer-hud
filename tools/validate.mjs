import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async file =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const manifest = await readJson("module.json");
const packageJson = await readJson("package.json");
const russian = await readJson("lang/ru.json");

assert.equal(manifest.id, "adventurer-hud");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.compatibility.minimum, "14");
assert.ok(manifest.esmodules.includes("scripts/adventurer-hud.js"));
assert.ok(manifest.styles.includes("styles/adventurer-hud.css"));

for (const file of [
  ...manifest.esmodules,
  ...manifest.styles,
  "templates/rolls-hud.hbs"
]) {
  await access(path.join(root, file));
}

const sourceFiles = [
  "scripts/rolls-hud.js",
  "scripts/adventurer-hud.js",
  "scripts/hud/components.js",
  "scripts/hud/regular.js",
  "scripts/hud/combat.js",
  "scripts/hud/death-saves.js"
];
const referencedKeys = new Set();

for (const file of sourceFiles) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
    referencedKeys.add(`ADVENTURER_HUD.${match[1]}`);
  }
}

for (const key of referencedKeys) {
  assert.ok(russian[key], `Missing Russian localization key: ${key}`);
}

console.log("Validation passed.");
