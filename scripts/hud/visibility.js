import { getSetting, SETTINGS } from "../settings.js";

export function readHudVisibility() {
  return {
    itemDetails: getSetting(SETTINGS.showItemDetails),
    showActionTypes: getSetting(SETTINGS.showActionTypes),
    combatSkills: getSetting(SETTINGS.showCombatSkills),
    modeNavigation: getSetting(SETTINGS.showModeNavigation),
    search: getSetting(SETTINGS.showSearch),
    activityPicker: getSetting(SETTINGS.showActivityPicker),
    favorites: getSetting(SETTINGS.showFavorites)
  };
}
