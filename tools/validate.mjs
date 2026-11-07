import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { listFiles } from "./files.mjs";
import { releaseAssetUrls } from "./release-channel.mjs";
import { verifyReleaseDocumentation } from "./release-documentation.mjs";
import {
  collectReleaseFiles,
  readReleaseDocuments
} from "./release-package.mjs";
import {
  readLocalizationCatalogs,
  localeForLanguage
} from "./localization.mjs";
import { HUD_LANGUAGE_NAMES } from "../scripts/settings-schema.js";

const root = process.cwd();
const readJson = async file =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));

const manifest = await readJson("module.json");
const packageJson = await readJson("package.json");
const catalogs = await readLocalizationCatalogs(manifest);
assert.deepEqual(
  manifest.languages,
  Object.entries(HUD_LANGUAGE_NAMES).map(([lang, name]) => ({
    lang,
    name,
    path: `lang/${lang}.json`
  }))
);
const english = localeForLanguage(catalogs, "en");
const keys = Object.keys(english).sort();
const placeholders = value =>
  [...value.matchAll(/\{([^{}]+)\}/g)].map(([, name]) => name).sort();
assert.ok(keys.length, "Empty English catalog");
for (const { lang, translations } of catalogs) {
  assert.deepEqual(
    Object.keys(translations).sort(),
    keys,
    `${lang}: localization keys differ`
  );
  for (const [key, value] of Object.entries(translations)) {
    assert.equal(typeof value, "string", `${lang}: ${key} must be a string`);
    assert.ok(value.trim(), `${lang}: ${key} must not be empty`);
    assert.deepEqual(
      placeholders(value),
      placeholders(english[key]),
      `${lang}: ${key} placeholders differ`
    );
    const parts = key.split(".");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join(".");
      assert.ok(
        !Object.hasOwn(translations, parent),
        `${lang}: localization key is also a parent: ${parent}`
      );
    }
  }
}

assert.equal(manifest.id, "adventurer-hud");
assert.equal(manifest.type, "module");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.url, "https://github.com/wondersalmon/adventurer-hud");
const releaseUrls = releaseAssetUrls(manifest.url, packageJson.version);
assert.equal(manifest.manifest, releaseUrls.manifest);
assert.equal(manifest.download, releaseUrls.download);
for (const key of ["readme", "changelog", "bugs", "license"])
  assert.ok(manifest[key], `Missing manifest ${key}`);
assert.deepEqual(manifest.styles, [
  "styles/dialogs.css",
  "styles/adventurer-hud.css",
  "styles/combat.css",
  "styles/companions.css",
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
  assert.ok(english[key], `Missing English localization key: ${key}`);
}

const packaged = await collectReleaseFiles(root);
const documents = await readReleaseDocuments(root, packaged);
verifyReleaseDocumentation(new Set(packaged), documents);

console.log("Validation passed.");
