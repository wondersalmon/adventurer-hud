import { MODULE_ID } from "./module-id.js";
import { getSettingDefinitions, SETTINGS } from "./settings-schema.js";
import { panelStateForActor } from "./hud/panel-state.js";
import { createTaskQueue } from "./task-queue.js";
import { dnd5eAdapter } from "./dnd5e/index.js";
import { saveChangedSettings } from "./settings-access.js";
import { flushWindowGeometry } from "./window-geometry.js";
import { replacePanelPreferences } from "./hud/panel-preferences.js";
import { HUD_LAYOUT_BLOCKS } from "./hud/window/hud-layout-model.js";

const queue = createTaskQueue();
const isRecord = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obsoletePanelKeys = new Set([
  "companionTab",
  "resourcesExpanded",
  "favoriteOrder",
  "openActivityItemId",
  "searchQuery",
  "forcedMode"
]);

export const canRepairIssue = issue =>
  Boolean(
    issue.repairable &&
    (game.user?.isGM ||
      (!getSettingDefinitions()[issue.key]?.gmOnly &&
        issue.key !== SETTINGS.gmWindowGeometry))
  );

function changedFields(before, after, path = "", result = []) {
  if (same(before, after)) return result;
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after)
    ])) {
      if (result.length >= 100) break;
      changedFields(
        before[key],
        after[key],
        path ? `${path}.${key}` : key,
        result
      );
    }
  } else
    result.push({
      path: path || "value",
      before: before ?? null,
      after: after ?? null,
      legacy: obsoletePanelKeys.has(path.split(".").at(-1))
    });
  return result;
}

function inspectHudLayoutMeaning(layouts, uuid, issues) {
  const blocks = new Set(HUD_LAYOUT_BLOCKS.map(([key]) => key));
  for (const [scope, preference] of Object.entries(layouts ?? {})) {
    // The former dock lane is now the footer; preserve its supported choices.
    if (/^(regular|combat):dock$/.test(scope)) {
      const footer = scope.replace(/:dock$/, ":footer");
      const current = layouts[footer] ?? { order: [], hidden: [] };
      layouts[footer] = {
        order: [...new Set([...current.order, ...preference.order])],
        hidden: [...new Set([...current.hidden, ...preference.hidden])]
      };
      delete layouts[scope];
    }
  }
  for (const [scope, preference] of Object.entries(layouts ?? {})) {
    if (
      !/^(regular|combat|preparation):(info|actions|extra|footer|tabs|expanded)$/.test(
        scope
      )
    ) {
      issues.push({
        code: "Layout",
        detail: `${uuid}.hudLayouts.${scope}`,
        repairable: false
      });
      continue;
    }
    // Expansion stores category IDs, including system-defined activation types.
    if (scope === "combat:expanded") continue;
    if (
      preference.order
        .concat(preference.hidden)
        .some(key => !blocks.has(key) && !key.startsWith("tab:"))
    )
      issues.push({
        code: "Layout",
        detail: `${uuid}.hudLayouts.${scope}`,
        repairable: false
      });
  }
  for (const mode of ["regular", "combat", "preparation"]) {
    const seen = new Set();
    for (const lane of ["info", "actions", "extra", "footer"]) {
      const preference = layouts?.[`${mode}:${lane}`];
      if (!preference) continue;
      preference.order = preference.order.filter(key => {
        if (seen.has(key) && (blocks.has(key) || key.startsWith("tab:")))
          return false;
        seen.add(key);
        return true;
      });
    }
  }
}

export function inspectSavedData(values) {
  const issues = [];
  const suggest = (key, next) => {
    if (!same(values[key], next))
      issues.push({
        code: "SavedData",
        detail: key,
        repairable: true,
        key,
        next,
        changes: changedFields(values[key], next)
      });
  };
  for (const [key, definition] of Object.entries(getSettingDefinitions())) {
    const value = values[key];
    const valid =
      definition.type === Boolean
        ? typeof value === "boolean"
        : definition.type === Number
          ? typeof value === "number" &&
            Number.isFinite(value) &&
            (!definition.range ||
              (value >= definition.range.min && value <= definition.range.max))
          : typeof value === "string" &&
            (!definition.choices || Object.hasOwn(definition.choices, value));
    if (!valid) suggest(key, definition.default);
  }
  if (typeof values[SETTINGS.proficientSkillsOnly] !== "boolean")
    suggest(SETTINGS.proficientSkillsOnly, true);
  const panels = values[SETTINGS.panelStates];
  if (!isRecord(panels)) suggest(SETTINGS.panelStates, {});
  else {
    const cleaned = {};
    for (const [uuid, saved] of Object.entries(panels)) {
      if (!isRecord(saved)) continue;
      const valid = panelStateForActor(panels, uuid);
      inspectHudLayoutMeaning(valid.hudLayouts, uuid, issues);
      const next = Object.fromEntries(
        Object.entries(saved).filter(([key]) => !obsoletePanelKeys.has(key))
      );
      const known = [
        "conditionsExpanded",
        "favoritesExpanded",
        "preparedSpellsOnly",
        "combatCategory",
        "inventoryCategory",
        "currentView",
        "companionsExpanded",
        "showPassiveFeatures",
        "itemLayouts",
        "hudLayouts"
      ];
      for (const key of known)
        if (Object.hasOwn(saved, key) && !Object.hasOwn(valid, key))
          delete next[key];
      cleaned[uuid] = { ...next, ...valid };
    }
    suggest(SETTINGS.panelStates, cleaned);
  }
  for (const geometryKey of [
    SETTINGS.windowGeometry,
    SETTINGS.gmWindowGeometry
  ]) {
    const geometry = values[geometryKey];
    if (!isRecord(geometry)) suggest(geometryKey, {});
    else {
      const next = { ...geometry };
      for (const key of ["left", "top", "width", "height"]) {
        if (!Object.hasOwn(next, key)) continue;
        if (typeof next[key] !== "number" || !Number.isFinite(next[key]))
          delete next[key];
        else if (key === "width") next[key] = Math.max(270, next[key]);
        else if (key === "height") next[key] = Math.max(180, next[key]);
      }
      suggest(geometryKey, next);
    }
  }
  const sizes = values[SETTINGS.windowModeSizes];
  if (!isRecord(sizes)) suggest(SETTINGS.windowModeSizes, {});
  else {
    const next = { ...sizes };
    for (const mode of ["regular", "combat"]) {
      if (!Object.hasOwn(next, mode)) continue;
      if (!isRecord(next[mode])) {
        delete next[mode];
        continue;
      }
      next[mode] = { ...next[mode] };
      for (const key of ["width", "height"]) {
        if (!Object.hasOwn(next[mode], key)) continue;
        const value = next[mode][key];
        if (typeof value !== "number" || !Number.isFinite(value))
          delete next[mode][key];
        else next[mode][key] = Math.max(key === "width" ? 270 : 350, value);
      }
    }
    suggest(SETTINGS.windowModeSizes, next);
  }
  return issues;
}

function readSavedData() {
  const keys = [
    ...Object.keys(getSettingDefinitions()),
    SETTINGS.proficientSkillsOnly,
    SETTINGS.panelStates,
    SETTINGS.windowGeometry,
    SETTINGS.windowModeSizes,
    SETTINGS.gmWindowGeometry
  ];
  const values = {};
  const issues = [];
  for (const key of keys) {
    try {
      values[key] = game.settings.get(MODULE_ID, key);
    } catch {
      issues.push({ code: "Registration", detail: key, repairable: false });
    }
  }
  const missing = new Set(issues.map(issue => issue.detail));
  return {
    values,
    issues: [
      ...issues,
      ...inspectSavedData(values).filter(issue => !missing.has(issue.key))
    ]
  };
}

async function checkFiles() {
  const issues = [];
  const read = async path => {
    const response = await fetch(
      foundry.utils.getRoute(`modules/${MODULE_ID}/${path}`),
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(path);
    const text = await response.text();
    if (!text.trim() || /^\s*(<!doctype|<html)/i.test(text))
      throw new Error(path);
    return text;
  };
  try {
    const manifest = JSON.parse(await read("module.json"));
    if (
      manifest.id !== MODULE_ID ||
      !Array.isArray(manifest.esmodules) ||
      !Array.isArray(manifest.styles)
    )
      throw new Error("module.json");
    const paths = [
      ...manifest.esmodules,
      ...manifest.styles,
      "lang/en.json",
      "lang/ru.json",
      "templates/settings.hbs",
      "templates/reset-settings.hbs",
      "templates/integrity.hbs"
    ];
    const results = await Promise.allSettled(
      paths.map(async path => {
        if (
          typeof path !== "string" ||
          path.includes("..") ||
          !/^[\w./-]+$/.test(path)
        )
          throw new Error("module.json");
        const source = await read(path);
        if (path.endsWith(".json")) {
          const catalog = JSON.parse(source);
          if (
            !isRecord(catalog) ||
            !Object.keys(catalog).length ||
            Object.values(catalog).some(value => typeof value !== "string")
          )
            throw new Error(path);
        }
      })
    );
    results.forEach((result, index) => {
      if (result.status === "rejected")
        issues.push({ code: "File", detail: paths[index], repairable: false });
    });
  } catch {
    issues.push({ code: "File", detail: "module.json", repairable: false });
  }
  return issues;
}

export async function checkIntegrity() {
  const { issues } = readSavedData();
  if (game.system.id !== "dnd5e")
    issues.push({ code: "System", detail: "D&D 5e", repairable: false });
  const apis = [
    ["Adventurer HUD.open", game.modules?.get(MODULE_ID)?.api?.open],
    ["DialogV2", foundry.applications?.api?.DialogV2],
    [
      "TextEditor.enrichHTML",
      foundry.applications?.ux?.TextEditor?.implementation?.enrichHTML
    ],
    ["Trait.getBaseItem", game.dnd5e?.documents?.Trait?.getBaseItem]
  ];
  for (const name of [
    "combatStats",
    "itemActivities",
    "itemDamageFormula",
    "itemUsesData",
    "spellPreparation",
    "getTools",
    "useItem",
    "useActivity"
  ]) {
    apis.push([`Adventurer HUD.${name}`, dnd5eAdapter[name]]);
  }
  for (const [name, api] of apis)
    if (typeof api !== "function")
      issues.push({ code: "Api", detail: name, repairable: false });
  return {
    checkedAt: new Date().toISOString(),
    issues: [...issues, ...(await checkFiles())]
  };
}

export function repairSavedData(expectedRepairs) {
  return queue(async () => {
    await flushWindowGeometry();
    return replacePanelPreferences(async () => {
      // Re-read before writing: do not apply suggestions from an outdated report.
      const { values, issues } = readSavedData();
      const repairs = issues.filter(canRepairIssue);
      if (
        expectedRepairs &&
        !same(
          expectedRepairs.map(({ key, next, changes }) => ({
            key,
            next,
            changes
          })),
          repairs.map(({ key, next, changes }) => ({ key, next, changes }))
        )
      )
        throw new Error("repair-plan-changed");
      if (!repairs.length) return 0;
      await game.settings.set(MODULE_ID, SETTINGS.repairBackup, {
        createdAt: new Date().toISOString(),
        values: structuredClone(values)
      });
      await saveChangedSettings(
        repairs.map(({ key, next }) => [key, next]),
        { rollbackOnError: true }
      );
      return repairs.length;
    });
  });
}
