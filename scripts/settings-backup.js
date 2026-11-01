// @ts-check
import { MODULE_ID } from "./module-id.js";
import {
  SETTINGS,
  getSettingDefinitions,
  normalizeHudTheme,
  normalizeFooterMode
} from "./settings-schema.js";
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
    key =>
      key !== SETTINGS.hudClosed &&
      getSettingDefinitions()[key].scope !== "world"
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
        .filter(
          key =>
            game.user?.isGM ||
            (!getSettingDefinitions()[key]?.gmOnly &&
              key !== SETTINGS.gmWindowGeometry)
        )
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
  for (const entry of entries)
    if (
      (entry[0] === SETTINGS.explorationFooterMode ||
        entry[0] === SETTINGS.combatFooterMode) &&
      entry[1] === "checks"
    )
      entry[1] = normalizeFooterMode(
        entry[1],
        entry[0] === SETTINGS.combatFooterMode
      );
  const importedKeys = new Set(entries.map(([key]) => key));
  if (
    importedKeys.has(SETTINGS.twoColumnWidth) &&
    !importedKeys.has(SETTINGS.twoColumnMode)
  )
    entries.push([
      SETTINGS.twoColumnMode,
      entries.find(([key]) => key === SETTINGS.twoColumnWidth)?.[1] === 450
        ? "auto"
        : "manual"
    ]);
  for (const [
    modeKey,
    oldKey,
    attackKey
  ] of /** @type {[string, string, string | null][]} */ ([
    [SETTINGS.cardDetails, SETTINGS.showItemDetails, null],
    [
      SETTINGS.gmCardDetails,
      SETTINGS.gmShowItemDetails,
      SETTINGS.gmShowAttackDetails
    ]
  ]))
    if (!importedKeys.has(modeKey) && importedKeys.has(oldKey)) {
      const values = Object.fromEntries(entries);
      entries.push([
        modeKey,
        values[oldKey]
          ? "all"
          : attackKey && !values[attackKey]
            ? "off"
            : "basic"
      ]);
    }
  const candidate = Object.fromEntries(keys.map(key => [key, getSetting(key)]));
  for (const [key, value] of entries) candidate[key] = value;
  candidate[SETTINGS.theme] = normalizeHudTheme(candidate[SETTINGS.theme]);
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
