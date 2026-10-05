// @ts-check
import { MODULE_ID } from "./module-id.js";
import { SETTINGS, getSettingDefinitions } from "./settings-schema.js";
import {
  getSetting,
  saveChangedSettings,
  SettingsSaveError
} from "./settings-access.js";
import { flushWindowGeometry } from "./window-geometry.js";
import { inspectSavedData } from "./integrity.js";
import {
  flushPanelPreferences,
  replacePanelPreferences
} from "./hud/panel-preferences.js";

const backupKeys = () => [
  ...Object.keys(getSettingDefinitions()).filter(
    key => key !== SETTINGS.hudClosed
  ),
  SETTINGS.proficientSkillsOnly,
  SETTINGS.windowGeometry,
  SETTINGS.gmWindowGeometry,
  SETTINGS.windowModeSizes,
  SETTINGS.panelStates
];

export async function settingsBackup() {
  await flushWindowGeometry();
  await flushPanelPreferences();
  return {
    module: MODULE_ID,
    format: 1,
    settings: Object.fromEntries(
      backupKeys()
        .filter(key => !getSettingDefinitions()[key]?.gmOnly || game.user?.isGM)
        .map(key => [key, getSetting(key)])
    )
  };
}

/** Validate the complete input before any settings are written.
 * @param {string} text
 * @returns {[string, unknown][]}
 */
export function settingsBackupEntries(text) {
  if (text.length > 2_000_000) throw new Error("backup-invalid");
  /** @type {unknown} */
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("backup-invalid");
  const data = /** @type {Record<string, unknown>} */ (parsed);
  /** @param {unknown} value @returns {boolean} */
  const safe = value =>
    !value ||
    typeof value !== "object" ||
    Object.entries(/** @type {Record<string, unknown>} */ (value)).every(
      ([key, child]) =>
        !["__proto__", "constructor", "prototype"].includes(key) && safe(child)
    );
  if (!safe(data)) throw new Error("backup-invalid");
  if (
    data?.module !== MODULE_ID ||
    data.format !== 1 ||
    !data.settings ||
    typeof data.settings !== "object" ||
    Array.isArray(data.settings)
  )
    throw new Error("backup-invalid");
  const keys = backupKeys();
  const entries = Object.entries(
    /** @type {Record<string, unknown>} */ (data.settings)
  ).filter(([key]) => keys.includes(key));
  if (!entries.length) throw new Error("backup-invalid");
  const candidate = Object.fromEntries(keys.map(key => [key, getSetting(key)]));
  for (const [key, value] of entries) candidate[key] = value;
  // Only supported legacy fields may change before strict validation.
  const panels = candidate[SETTINGS.panelStates];
  if (panels && typeof panels === "object" && !Array.isArray(panels)) {
    candidate[SETTINGS.panelStates] = Object.fromEntries(
      Object.entries(panels).map(([uuid, saved]) => {
        if (!saved || typeof saved !== "object" || Array.isArray(saved))
          return [uuid, saved];
        const next = { ...saved };
        if (["character", "companions"].includes(next.companionTab)) {
          if (typeof next.companionsExpanded !== "boolean")
            next.companionsExpanded = next.companionTab === "companions";
          delete next.companionTab;
        }
        if (next.combatCategory === "resources")
          next.combatCategory = "features";
        for (const [field, valid] of [
          ["resourcesExpanded", typeof next.resourcesExpanded === "boolean"],
          [
            "favoriteOrder",
            Array.isArray(next.favoriteOrder) &&
              next.favoriteOrder.every(value => typeof value === "string")
          ],
          [
            "openActivityItemId",
            next.openActivityItemId === null ||
              typeof next.openActivityItemId === "string"
          ],
          ["searchQuery", typeof next.searchQuery === "string"],
          [
            "forcedMode",
            next.forcedMode === null ||
              ["regular", "combat"].includes(next.forcedMode)
          ]
        ])
          if (valid) delete next[field];
        return [uuid, next];
      })
    );
  }
  const imported = new Set(entries.map(([key]) => key));
  if (inspectSavedData(candidate).some(issue => imported.has(issue.key)))
    throw new Error("backup-invalid");
  return entries
    .map(([key]) => /** @type {[string, unknown]} */ ([key, candidate[key]]))
    .filter(
      ([key]) =>
        game.user?.isGM ||
        (!getSettingDefinitions()[key]?.gmOnly &&
          key !== SETTINGS.gmWindowGeometry)
    );
}

/** @param {string} text */
export async function restoreSettingsBackup(text) {
  const entries = settingsBackupEntries(text);
  try {
    await flushWindowGeometry();
  } catch (error) {
    throw new SettingsSaveError(error, []);
  }
  await replacePanelPreferences(() =>
    saveChangedSettings(entries, { rollbackOnError: true })
  );
}
