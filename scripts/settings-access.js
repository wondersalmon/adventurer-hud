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

export class SettingsSaveError extends Error {
  /** @param {unknown} cause @param {string[]} rollbackFailedKeys */
  constructor(cause, rollbackFailedKeys) {
    super("settings-save-failed", { cause });
    this.rollbackFailedKeys = rollbackFailedKeys;
  }
}

/** @param {Iterable<[string, unknown]>} entries @param {{rollbackOnError?: boolean}} options */
export function saveChangedSettings(entries, { rollbackOnError = false } = {}) {
  return queueSettingsSave(async () => {
    const changes = new Map();
    /** @type {Map<string, {previous: unknown, requested: unknown}>} */
    const attempted = new Map();
    const equal = (left, right) =>
      Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
    pendingSettingKeys = new Set();
    try {
      for (const [key, value] of entries) {
        if (getSettingDefinitions()[key]?.gmOnly && !game.user?.isGM) continue;
        if (Object.is(getSetting(key), value)) continue;
        pendingSettingKeys.add(key);
        if (rollbackOnError && !attempted.has(key))
          attempted.set(key, {
            previous: structuredClone(getSetting(key)),
            requested: value
          });
        await setSetting(key, value);
        changes.set(key, value);
      }
    } catch (error) {
      if (rollbackOnError) {
        const failed = [];
        for (const [key, { previous, requested }] of [...attempted].reverse()) {
          try {
            const current = getSetting(key);
            if (equal(current, previous)) {
              changes.delete(key);
              continue;
            }
            // Preserve a newer change made outside our serialized save queue.
            if (!equal(current, requested)) {
              failed.push(key);
              continue;
            }
            await setSetting(key, previous);
            changes.delete(key);
          } catch {
            failed.push(key);
          }
        }
        const remaining = failed.filter(key => {
          try {
            const current = getSetting(key);
            if (equal(current, attempted.get(key)?.previous)) {
              changes.delete(key);
              return false;
            }
            changes.set(key, current);
          } catch {
            /* Preserve the last known change if storage cannot be read. */
          }
          return true;
        });
        throw new SettingsSaveError(error, remaining);
      }
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
