import { MODULE_ID } from "./module-id.js";

const catalogsByFetcher = new WeakMap();

const fetchModuleCatalog = async language => {
  const path = foundry.utils.getRoute(
    `modules/${MODULE_ID}/lang/${language}.json`
  );
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} translations`);
  return response.json();
};

function loadCatalog(fetchCatalog, language) {
  if (!catalogsByFetcher.has(fetchCatalog)) {
    catalogsByFetcher.set(fetchCatalog, new Map());
  }
  const catalogs = catalogsByFetcher.get(fetchCatalog);
  const key = language;
  if (!catalogs.has(key)) {
    const loading = Promise.resolve()
      .then(() => fetchCatalog(language))
      .catch(error => {
        catalogs.delete(key);
        throw error;
      });
    catalogs.set(key, loading);
  }
  return catalogs.get(key);
}

async function loadLocale(fetchCatalog, language) {
  try {
    return await loadCatalog(fetchCatalog, language);
  } catch (error) {
    console.warn("Adventurer HUD | translation load failed", error);
    return {};
  }
}

export async function createModuleTranslator({
  language,
  i18n,
  fetchCatalog = fetchModuleCatalog
}) {
  if (language !== "en" && language !== "ru") {
    return {
      language: i18n.lang,
      t: key => i18n.localize(`ADVENTURER_HUD.${key}`),
      tf: (key, data) => i18n.format(`ADVENTURER_HUD.${key}`, data)
    };
  }

  const [fallback, catalog = fallback] = await Promise.all(
    (language === "en" ? ["en"] : ["en", language]).map(lang =>
      loadLocale(fetchCatalog, lang)
    )
  );

  const t = key =>
    catalog[`ADVENTURER_HUD.${key}`] ??
    fallback[`ADVENTURER_HUD.${key}`] ??
    i18n.localize(`ADVENTURER_HUD.${key}`);
  const tf = (key, data = {}) =>
    t(key).replace(/\{([^{}]+)\}/g, (match, name) =>
      Object.hasOwn(data, name) ? String(data[name]) : match
    );

  return { language, t, tf };
}
