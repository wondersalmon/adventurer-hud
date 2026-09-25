import { getSetting, SETTINGS } from "../settings.js";

export function readHudVisibility(adapter) {
  const { capabilities } = adapter;
  return {
    abilityChecks: capabilities.abilityChecks,
    initiative: capabilities.combat,
    inventory: capabilities.inventory,
    itemDetails: getSetting(SETTINGS.showItemDetails),
    showActionTypes: getSetting(SETTINGS.showActionTypes),
    modeNavigation: getSetting(SETTINGS.showModeNavigation),
    search: getSetting(SETTINGS.showSearch),
    activityPicker:
      capabilities.activityChoice && getSetting(SETTINGS.showActivityPicker),
    favorites: getSetting(SETTINGS.showFavorites),
    combatResources: capabilities.resources,
    combatStats: capabilities.combat,
    combatWeapons: capabilities.weapons,
    conditions: capabilities.conditions,
    combatSpells: capabilities.spells,
    combatActions: capabilities.actions,
    combatBonusActions: capabilities.bonusActions,
    combatReactions: capabilities.reactions,
    combatSpecial: capabilities.specialActions,
    savingThrows: capabilities.savingThrows,
    shortcuts: true,
    skills: capabilities.skills,
    tools: capabilities.tools
  };
}
