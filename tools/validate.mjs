import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async file =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const manifest = await readJson("module.json");
const packageJson = await readJson("package.json");
const russian = await readJson("lang/ru.json");

assert.equal(manifest.id, "simple-rolls");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.compatibility.minimum, "14");
assert.ok(manifest.esmodules.includes("scripts/simple-rolls.js"));
assert.ok(manifest.styles.includes("styles/simple-rolls.css"));

for (const file of [
  ...manifest.esmodules,
  ...manifest.styles,
  "templates/rolls-hud.hbs"
]) {
  await access(path.join(root, file));
}

const sourceFiles = ["scripts/rolls-hud.js", "scripts/simple-rolls.js"];
const referencedKeys = new Set();

for (const file of sourceFiles) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
    referencedKeys.add(`SIMPLE_ROLLS.${match[1]}`);
  }
}

for (const key of referencedKeys) {
  assert.ok(russian[key], `Missing Russian localization key: ${key}`);
}

console.log("Validation passed.");
