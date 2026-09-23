import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { listFiles } from "../tools/files.mjs";
import { createModuleTranslator } from "../scripts/localization.js";

test("module language choice overrides Foundry only for module strings", async () => {
  const i18n = {
    lang: "en",
    localize: key => `Foundry:${key}`,
    format: (key, data) => `Foundry:${key}:${data.actor}`
  };
  const ru = await createModuleTranslator({
    language: "ru",
    i18n,
    fetchCatalog: async () => ({
      "ADVENTURER_HUD.Window.Title": "Окно {actor}"
    })
  });
  assert.equal(ru.language, "ru");
  assert.equal(ru.t("Window.Title"), "Окно {actor}");
  assert.equal(ru.tf("Window.Title", { actor: "Рук" }), "Окно Рук");
  assert.equal(i18n.lang, "en");

  const automatic = await createModuleTranslator({ language: "auto", i18n });
  assert.equal(
    automatic.t("Window.Title"),
    "Foundry:ADVENTURER_HUD.Window.Title"
  );
});

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
  const files = await listFiles("scripts", file => file.endsWith(".js"));

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
      const key = `ADVENTURER_HUD.${match[1]}`;
      assert.ok(russian[key], `${file} references missing key ${key}`);
      assert.ok(english[key], `${file} references missing key ${key}`);
    }
  }
});
