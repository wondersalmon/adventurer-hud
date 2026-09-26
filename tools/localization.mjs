import { readFile } from "node:fs/promises";

export async function readLocalizationCatalogs(manifest) {
  return Promise.all(
    manifest.languages.map(async entry => ({
      ...entry,
      translations: JSON.parse(await readFile(entry.path, "utf8"))
    }))
  );
}

export function localeForLanguage(catalogs, language) {
  return Object.assign(
    {},
    ...catalogs
      .filter(entry => entry.lang === language)
      .map(entry => entry.translations)
  );
}
