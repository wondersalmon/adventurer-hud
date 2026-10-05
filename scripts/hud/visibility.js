import { getSetting, SETTINGS } from "../settings-access.js";

export function readHudVisibility() {
  return {
    playerFooter: getSetting(SETTINGS.playerFooter),
    itemDetails: getSetting(SETTINGS.showItemDetails),
    showActionTypes: getSetting(SETTINGS.showActionTypes),
    combatSkills: getSetting(SETTINGS.showCombatSkills),
    modeNavigation: getSetting(SETTINGS.showModeNavigation),
    shortcuts: getSetting(SETTINGS.showShortcuts),
    search: getSetting(SETTINGS.showSearch),
    activityPicker: getSetting(SETTINGS.showActivityPicker),
    favorites: getSetting(SETTINGS.showFavorites),
    companions: getSetting(SETTINGS.showCompanions)
  };
}
