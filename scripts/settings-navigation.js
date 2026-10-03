import { MODULE_ID } from "./module-id.js";

export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({ force: true });

  const category = sheet.element?.querySelector(
    `[data-category="${MODULE_ID}"], [data-tab="${MODULE_ID}"]`
  );
  if (category) {
    category.click();
  } else {
    sheet.search?.(game.i18n.localize("ADVENTURER_HUD.Title"));
  }
  return sheet;
}

export function openGmSettings() {
  if (!game.user?.isGM) return;
  return import("./settings-applications.js").then(settings =>
    settings.openGmSettings()
  );
}
