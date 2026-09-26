import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "./helpers/files.mjs";

import { createModuleTranslator } from "../scripts/localization.js";
import {
  readLocalizationCatalogs,
  localeForLanguage
} from "../tools/localization.mjs";

const readManifest = () => readJson("module.json");

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

test("automatic language delegates to Foundry without fetching HUD catalogs", async () => {
  const translator = await createModuleTranslator({
    language: "auto",
    i18n: {
      lang: "ru",
      localize: key => key,
      format: (_key, data) => data.actor
    },
    fetchCatalog: () => {
      throw new Error("Automatic localization must use Foundry");
    }
  });
  assert.equal(translator.language, "ru");
  assert.equal(translator.tf("Window.Title", { actor: "Рук" }), "Рук");
});

test("both catalogs contain all D&D translations", async () => {
  const manifest = await readManifest();
  assert.deepEqual(manifest.languages.map(entry => entry.path).sort(), [
    "lang/en.json",
    "lang/ru.json"
  ]);
  const catalogs = await readLocalizationCatalogs(manifest);
  for (const language of ["en", "ru"]) {
    const catalog = localeForLanguage(catalogs, language);
    const translator = await createModuleTranslator({
      language,
      i18n: { localize: key => key },
      fetchCatalog: async lang => localeForLanguage(catalogs, lang)
    });
    for (const [key, value] of Object.entries(catalog))
      assert.equal(translator.t(key.slice("ADVENTURER_HUD.".length)), value);
  }
});

test("catalogs are cached per language and fetcher", async () => {
  const calls = [];
  const fetchCatalog = async language => {
    calls.push(language);
    return { "ADVENTURER_HUD.Example": language };
  };
  const options = {
    language: "ru",
    i18n: { localize: key => key },
    fetchCatalog
  };
  await createModuleTranslator(options);
  const again = await createModuleTranslator(options);
  assert.equal(again.t("Example"), "ru");
  assert.deepEqual(calls.sort(), ["en", "ru"]);
  const other = await createModuleTranslator({
    ...options,
    fetchCatalog: async () => ({ "ADVENTURER_HUD.Example": "different" })
  });
  assert.equal(other.t("Example"), "different");
});

test("failed catalog loads fall back to English and can retry", async t => {
  t.mock.method(console, "warn", () => {});
  let missing = true;
  const options = {
    language: "ru",
    i18n: { localize: key => key },
    fetchCatalog: async language => {
      if (language === "ru" && missing) throw new Error("offline");
      return { "ADVENTURER_HUD.Example": language };
    }
  };
  assert.equal((await createModuleTranslator(options)).t("Example"), "en");
  missing = false;
  assert.equal((await createModuleTranslator(options)).t("Example"), "ru");
});
