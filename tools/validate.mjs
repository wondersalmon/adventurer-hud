import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { listFiles } from "./files.mjs";

const root = process.cwd();
const readJson = async file =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const manifest = await readJson("module.json");
const packageJson = await readJson("package.json");
const russian = await readJson("lang/ru.json");
const english = await readJson("lang/en.json");

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

const sourceFiles = await listFiles(
  path.join(root, "scripts"),
  file => path.extname(file) === ".js"
);
const referencedKeys = new Set();

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
    referencedKeys.add(`ADVENTURER_HUD.${match[1]}`);
  }
}

for (const key of referencedKeys) {
  assert.ok(russian[key], `Missing Russian localization key: ${key}`);
  assert.ok(english[key], `Missing English localization key: ${key}`);
}

console.log("Validation passed.");
