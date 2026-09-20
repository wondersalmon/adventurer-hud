import { MODULE_ID } from "./module-id.js";

export const SETTINGS = Object.freeze({
  adaptiveLayout: "adaptiveLayout",
  automaticCombatMode: "automaticCombatMode",
  autoUpdateActor: "autoUpdateActor",
  keepOpen: "keepOpen",
  fontSize: "fontSize",
  showAbilityChecks: "showAbilityChecks",
  showDeathSaves: "showDeathSaves",
  showInitiative: "showInitiative",
  showItemDetails: "showItemDetails",
  showModeNavigation: "showModeNavigation",
  showCombatResources: "showCombatResources",
  showCombatWeapons: "showCombatWeapons",
  showCombatSpells: "showCombatSpells",
  showCombatActions: "showCombatActions",
  showCombatBonusActions: "showCombatBonusActions",
  showCombatReactions: "showCombatReactions",
  showCombatSpecial: "showCombatSpecial",
  showSavingThrows: "showSavingThrows",
  showShortcuts: "showShortcuts",
  showSkills: "showSkills",
  showTools: "showTools",
  windowGeometry: "windowGeometry",
  migrationVersion: "migrationVersion"
});

const notifyChange = key => value =>
  Hooks.callAll("adventurerHudSettingChanged", key, value);

const registerBoolean = (key, defaultValue = true) => {
  game.settings.register(MODULE_ID, key, {
    name: `ADVENTURER_HUD.Settings.${key}.Name`,
    hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
    scope: "user",
    config: true,
    type: Boolean,
    default: defaultValue,
    onChange: notifyChange(key)
  });
};

const registerChoice = (key, choices, defaultValue) => {
  game.settings.register(MODULE_ID, key, {
    name: `ADVENTURER_HUD.Settings.${key}.Name`,
    hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
    scope: "user",
    config: true,
    type: String,
    choices,
    default: defaultValue,
    onChange: notifyChange(key)
  });
};

export function registerSettings() {
  registerBoolean(SETTINGS.adaptiveLayout, true);
  registerChoice(
    SETTINGS.fontSize,
    {
      small: "ADVENTURER_HUD.Settings.fontSize.Small",
      normal: "ADVENTURER_HUD.Settings.fontSize.Normal",
      large: "ADVENTURER_HUD.Settings.fontSize.Large",
      extraLarge: "ADVENTURER_HUD.Settings.fontSize.ExtraLarge"
    },
    "large"
  );
  registerBoolean(SETTINGS.keepOpen, false);
  registerBoolean(SETTINGS.autoUpdateActor, true);
  registerBoolean(SETTINGS.automaticCombatMode, true);
  registerBoolean(SETTINGS.showInitiative);
  registerBoolean(SETTINGS.showItemDetails);
  registerBoolean(SETTINGS.showModeNavigation);
  registerBoolean(SETTINGS.showCombatResources);
  registerBoolean(SETTINGS.showCombatWeapons);
  registerBoolean(SETTINGS.showCombatSpells);
  registerBoolean(SETTINGS.showCombatActions);
  registerBoolean(SETTINGS.showCombatBonusActions);
  registerBoolean(SETTINGS.showCombatReactions);
  registerBoolean(SETTINGS.showCombatSpecial);
  registerBoolean(SETTINGS.showAbilityChecks);
  registerBoolean(SETTINGS.showSavingThrows);
  registerBoolean(SETTINGS.showSkills);
  registerBoolean(SETTINGS.showTools);
  registerBoolean(SETTINGS.showDeathSaves);
  registerBoolean(SETTINGS.showShortcuts);

  game.settings.register(MODULE_ID, SETTINGS.windowGeometry, {
    name: "Adventurer HUD window geometry",
    hint: "",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.migrationVersion, {
    name: "Adventurer HUD migration version",
    hint: "",
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });
}

export const getSetting = key => game.settings.get(MODULE_ID, key);

export const setSetting = (key, value) =>
  game.settings.set(MODULE_ID, key, value);

export const getWindowGeometry = () =>
  getSetting(SETTINGS.windowGeometry) ?? {};

let geometryTimer = null;
let pendingGeometry = null;

export function saveWindowGeometry(geometry, { immediate = false } = {}) {
  pendingGeometry = geometry;

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  if (immediate) {
    const value = pendingGeometry;
    pendingGeometry = null;
    return setSetting(SETTINGS.windowGeometry, value);
  }

  geometryTimer = setTimeout(() => {
    geometryTimer = null;
    const value = pendingGeometry;
    pendingGeometry = null;
    void setSetting(SETTINGS.windowGeometry, value);
  }, 150);
}

export async function flushWindowGeometry() {
  if (!pendingGeometry) {
    return;
  }

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  const value = pendingGeometry;
  pendingGeometry = null;
  await setSetting(SETTINGS.windowGeometry, value);
}

export async function migrateLegacySettings() {
  const version = getSetting(SETTINGS.migrationVersion);

  if (version >= 1) {
    return;
  }

  const suffix = [game.world?.id ?? "world", game.user.id].join(":");

  try {
    const rawGeometry = localStorage.getItem(`ws-rolls-hud-position:${suffix}`);

    if (rawGeometry) {
      await setSetting(SETTINGS.windowGeometry, JSON.parse(rawGeometry));
    }

    const rawKeepOpen = localStorage.getItem(
      `ws-rolls-hud-keep-open:${suffix}`
    );

    if (rawKeepOpen !== null) {
      await setSetting(SETTINGS.keepOpen, rawKeepOpen === "true");
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to migrate legacy settings`, error);
  }

  await setSetting(SETTINGS.migrationVersion, 1);
}
