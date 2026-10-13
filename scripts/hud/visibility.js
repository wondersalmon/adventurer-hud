import { cardDetailFields } from "../settings-schema.js";
import { getSetting, SETTINGS } from "../settings-access.js";

export function readHudVisibility() {
  return {
    statusFilter: getSetting(SETTINGS.statusFilter),
    hiddenEffects: getSetting(SETTINGS.hiddenEffects),
    spellPreparation: getSetting(SETTINGS.showSpellPreparation),
    playerFooter: getSetting(SETTINGS.playerFooter),
    itemDetails: getSetting(SETTINGS.showItemDetails),
    cardDetailFields: cardDetailFields(
      getSetting(SETTINGS.cardDetails),
      getSetting(SETTINGS.cardDetailFields)
    ),
    showActionTypes: getSetting(SETTINGS.showActionTypes),
    combatSkills: getSetting(SETTINGS.showCombatSkills),
    armorClass: getSetting(SETTINGS.showArmorClass),
    initiative: getSetting(SETTINGS.showInitiative),
    speed: getSetting(SETTINGS.showSpeed),
    actorLevel: getSetting(SETTINGS.showActorLevel),
    actorClasses: getSetting(SETTINGS.showActorClasses),
    modeNavigation: getSetting(SETTINGS.showModeNavigation),
    shortcuts: getSetting(SETTINGS.showShortcuts),
    search: getSetting(SETTINGS.showSearch),
    inventorySummary: getSetting(SETTINGS.showInventorySummary),
    activityPicker: getSetting(SETTINGS.showActivityPicker),
    favorites: getSetting(SETTINGS.showFavorites),
    hideItemOpenButton: getSetting(SETTINGS.hideItemOpenButton),
    companions: getSetting(SETTINGS.showCompanions)
  };
}
