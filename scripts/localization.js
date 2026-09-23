import { MODULE_ID } from "./module-id.js";

const catalogs = new Map();

export async function createModuleTranslator({
  language,
  i18n,
  fetchCatalog = async lang => {
    const path = foundry.utils.getRoute(
      `modules/${MODULE_ID}/lang/${lang}.json`
    );
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${lang} translations`);
    return response.json();
  }
}) {
  if (language !== "en" && language !== "ru") {
    return {
      language: i18n.lang,
      t: key => i18n.localize(`ADVENTURER_HUD.${key}`),
      tf: (key, data) => i18n.format(`ADVENTURER_HUD.${key}`, data)
    };
  }

  if (!catalogs.has(language)) {
    catalogs.set(
      language,
      Promise.resolve().then(() => fetchCatalog(language))
    );
  }

  let catalog;
  try {
    catalog = await catalogs.get(language);
  } catch (error) {
    catalogs.delete(language);
    console.warn("Adventurer HUD | translation load failed", error);
    return createModuleTranslator({ language: "auto", i18n });
  }

  const t = key =>
    catalog[`ADVENTURER_HUD.${key}`] ?? i18n.localize(`ADVENTURER_HUD.${key}`);
  const tf = (key, data = {}) =>
    t(key).replace(/\{([^{}]+)\}/g, (match, name) =>
      Object.hasOwn(data, name) ? String(data[name]) : match
    );

  return { language, t, tf };
}
