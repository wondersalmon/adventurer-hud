import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Russian and English localization keys stay synchronized", async () => {
  const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));
  const english = JSON.parse(await readFile("lang/en.json", "utf8"));

  assert.deepEqual(Object.keys(english).sort(), Object.keys(russian).sort());
});

test("English is available as the complete module fallback locale", async () => {
  const manifest = JSON.parse(await readFile("module.json", "utf8"));
  const english = JSON.parse(await readFile("lang/en.json", "utf8"));
  const englishLanguage = manifest.languages.find(
    language => language.lang === "en"
  );

  assert.equal(englishLanguage?.path, "lang/en.json");
  assert.ok(Object.keys(english).length > 0);

  for (const [key, value] of Object.entries(english)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    assert.ok(value.trim(), `${key} must not be empty`);
  }
});

test("all directly referenced localization keys exist", async () => {
  const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));
  const english = JSON.parse(await readFile("lang/en.json", "utf8"));
  const files = [
    "scripts/rolls-hud.js",
    "scripts/adventurer-hud.js",
    "scripts/hud/components.js",
    "scripts/hud/regular.js",
    "scripts/hud/combat.js",
    "scripts/hud/death-saves.js"
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
      const key = `ADVENTURER_HUD.${match[1]}`;
      assert.ok(russian[key], `${file} references missing key ${key}`);
      assert.ok(english[key], `${file} references missing key ${key}`);
    }
  }
});
