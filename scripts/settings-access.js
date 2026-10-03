// @ts-check
import { MODULE_ID } from "./module-id.js";
import { createTaskQueue } from "./task-queue.js";
import { reportFailure } from "./diagnostics.js";
import {
  getSettingDefinitions,
  getSettingDefaults,
  SETTINGS
} from "./settings-schema.js";
export {
  getSettingDefinitions,
  getSettingDefaults,
  SETTINGS,
  SETTING_DEFAULTS,
  SETTING_DEFINITIONS
} from "./settings-schema.js";
/** @type {Set<string> | null} */
let pendingSettingKeys = null;
const queueSettingsSave = createTaskQueue();

/** @param {string} key */
export const notifyChange = key => value => {
  if (pendingSettingKeys?.has(key)) return;
  Hooks.callAll("adventurerHudSettingChanged", key, value);
};

/** @param {Iterable<[string, unknown]>} entries */
export function saveChangedSettings(entries) {
  return queueSettingsSave(async () => {
    const changes = new Map();
    pendingSettingKeys = new Set();
    try {
      for (const [key, value] of entries) {
        if (getSettingDefinitions()[key]?.gmOnly && !game.user?.isGM) continue;
        if (Object.is(getSetting(key), value)) continue;
        pendingSettingKeys.add(key);
        await setSetting(key, value);
        changes.set(key, value);
      }
    } catch (error) {
      reportFailure("settings.save", error);
      throw error;
    } finally {
      pendingSettingKeys = null;
      if (changes.size) {
        Hooks.callAll("adventurerHudSettingsChanged", changes);
      }
    }
  });
}

/** @param {string} key */
export const settingRefreshStrategy = key =>
  key === SETTINGS.proficientSkillsOnly
    ? "content"
    : (getSettingDefinitions()[key]?.refresh ?? "none");

export async function resetSettings({ gmOnly = false } = {}) {
  if (gmOnly && !game.user?.isGM) return;
  await saveChangedSettings([
    ...Object.entries(getSettingDefaults()).filter(
      ([key]) => Boolean(getSettingDefinitions()[key].gmOnly) === gmOnly
    ),
    ...(gmOnly
      ? []
      : [
          /** @type {[string, unknown]} */ ([
            SETTINGS.proficientSkillsOnly,
            true
          ])
        ])
  ]);
}

/** @param {string} key */
export const getSetting = key => game.settings.get(MODULE_ID, key);

/** @param {string} key @param {unknown} value */
export const setSetting = (key, value) =>
  getSettingDefinitions()[key]?.gmOnly && !game.user?.isGM
    ? Promise.resolve()
    : game.settings.set(MODULE_ID, key, value);
