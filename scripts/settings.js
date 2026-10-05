import { PLAYER_WINDOW_DEFAULTS } from "./hud/window/geometry.js";
export { openSettings, openGmSettings } from "./settings-navigation.js";
import { MODULE_ID } from "./module-id.js";
import {
  getSettingDefinitions,
  notifyChange,
  SETTINGS
} from "./settings-access.js";
import { registerSettingsMenus } from "./settings-applications.js";
export * from "./settings-access.js";
export {
  getWindowGeometry,
  saveWindowGeometry,
  flushWindowGeometry
} from "./window-geometry.js";
export {
  localizeSettingsRows,
  moveSettingsMenusToBottom
} from "./settings-applications.js";

export function registerSettings() {
  for (const [key, definition] of Object.entries(getSettingDefinitions())) {
    game.settings.register(MODULE_ID, key, {
      name: `ADVENTURER_HUD.Settings.${key}.Name`,
      hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
      scope: "user",
      config: definition.placement === "basic",
      type: definition.type,
      ...(definition.choices ? { choices: definition.choices } : {}),
      ...(definition.range ? { range: definition.range } : {}),
      default: definition.default,
      onChange: notifyChange(key)
    });
  }

  for (const key of [
    SETTINGS.windowGeometry,
    SETTINGS.gmWindowGeometry,
    SETTINGS.windowModeSizes
  ]) {
    game.settings.register(MODULE_ID, key, {
      name: "Adventurer HUD window geometry",
      hint: "",
      scope: "client",
      config: false,
      type: Object,
      default:
        key === SETTINGS.windowGeometry ? { ...PLAYER_WINDOW_DEFAULTS } : {}
    });
  }

  game.settings.register(MODULE_ID, SETTINGS.panelStates, {
    name: "Adventurer HUD panel states",
    hint: "",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.proficientSkillsOnly, {
    name: "Adventurer HUD trained skills filter",
    hint: "",
    scope: "user",
    config: false,
    type: Boolean,
    default: true,
    onChange: notifyChange(SETTINGS.proficientSkillsOnly)
  });

  game.settings.register(MODULE_ID, SETTINGS.repairBackup, {
    name: "Adventurer HUD repair backup",
    hint: "",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });
  registerSettingsMenus();
}
