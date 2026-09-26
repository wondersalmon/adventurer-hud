import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { listFiles } from "./files.mjs";
import {
  readLocalizationCatalogs,
  localeForLanguage
} from "./localization.mjs";

const root = process.cwd();
const readJson = async file =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const manifest = await readJson("module.json");
const packageJson = await readJson("package.json");
const catalogs = await readLocalizationCatalogs(manifest);
{
  const russian = localeForLanguage(catalogs, "ru");
  const english = localeForLanguage(catalogs, "en");
  assert.ok(Object.keys(english).length, `Empty English catalog for languages`);
  for (const [key, value] of Object.entries(english)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    assert.ok(value.trim(), `${key} must not be empty`);
  }
  assert.deepEqual(
    Object.keys(russian).sort(),
    Object.keys(english).sort(),
    `Localization keys differ for languages`
  );
}
const russian = Object.assign(
  {},
  ...catalogs
    .filter(entry => entry.lang === "ru")
    .map(entry => entry.translations)
);
const english = Object.assign(
  {},
  ...catalogs
    .filter(entry => entry.lang === "en")
    .map(entry => entry.translations)
);

assert.equal(manifest.id, "adventurer-hud");
assert.equal(manifest.type, "module");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.url, "https://github.com/wondersalmon/adventurer-hud");
assert.match(manifest.manifest, /releases\/latest\/download\/module\.json$/);
assert.equal(
  manifest.download,
  `${manifest.url}/releases/download/v${packageJson.version}/adventurer-hud.zip`
);
for (const key of ["readme", "changelog", "bugs", "license"])
  assert.ok(manifest[key], `Missing manifest ${key}`);
assert.equal(
  manifest.languages.find(entry => entry.lang === "en" && !entry.system)?.path,
  "lang/en.json"
);
assert.deepEqual(manifest.styles, [
  "styles/dialogs.css",
  "styles/adventurer-hud.css",
  "styles/combat.css",
  "styles/shared.css",
  "styles/death.css",
  "styles/responsive.css"
]);
assert.equal(
  manifest.relationships.systems.find(system => system.id === "dnd5e")
    .compatibility.minimum,
  "5.3.0"
);
assert.deepEqual(
  manifest.relationships.systems.map(system => system.id),
  ["dnd5e"]
);
assert.ok(manifest.media?.length, "Missing manifest media");
const mediaPrefix =
  "https://raw.githubusercontent.com/wondersalmon/adventurer-hud/main/";
for (const media of manifest.media) {
  assert.ok(media.type && media.url);
  for (const url of [media.url, media.thumbnail].filter(Boolean)) {
    assert.ok(url.startsWith(mediaPrefix));
    await access(path.join(root, url.slice(mediaPrefix.length)));
  }
}
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
