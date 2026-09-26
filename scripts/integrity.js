import { MODULE_ID } from "./module-id.js";
import { getSettingDefinitions, SETTINGS } from "./settings-schema.js";
import { panelStateForActor } from "./hud/panel-state.js";
import { createTaskQueue } from "./task-queue.js";
import { dnd5eAdapter } from "./dnd5e/index.js";

const queue = createTaskQueue();
const isRecord = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obsoletePanelKeys = new Set([
  "resourcesExpanded",
  "favoriteOrder",
  "openActivityItemId",
  "searchQuery",
  "forcedMode"
]);

export function inspectSavedData(values) {
  const issues = [];
  const suggest = (key, next) => {
    if (!same(values[key], next))
      issues.push({
        code: "SavedData",
        detail: key,
        repairable: true,
        key,
        next
      });
  };
  for (const [key, definition] of Object.entries(getSettingDefinitions())) {
    const value = values[key];
    const valid =
      definition.type === Boolean
        ? typeof value === "boolean"
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
      const next = Object.fromEntries(
        Object.entries(saved).filter(([key]) => !obsoletePanelKeys.has(key))
      );
      const known = [
        "abilitiesExpanded",
        "combatAbilitiesExpanded",
        "conditionsExpanded",
        "actionMenuOpen",
        "favoritesExpanded",
        "preparedSpellsOnly",
        "combatCategory",
        "inventoryCategory",
        "currentView"
      ];
      for (const key of known)
        if (Object.hasOwn(saved, key) && !Object.hasOwn(valid, key))
          delete next[key];
      cleaned[uuid] = { ...next, ...valid };
    }
    suggest(SETTINGS.panelStates, cleaned);
  }
  const geometry = values[SETTINGS.windowGeometry];
  if (!isRecord(geometry)) suggest(SETTINGS.windowGeometry, {});
  else {
    const next = { ...geometry };
    for (const key of ["left", "top", "width", "height"]) {
      if (!Object.hasOwn(next, key)) continue;
      if (typeof next[key] !== "number" || !Number.isFinite(next[key]))
        delete next[key];
      else if (key === "width") next[key] = Math.max(270, next[key]);
      else if (key === "height") next[key] = Math.max(180, next[key]);
    }
    suggest(SETTINGS.windowGeometry, next);
  }
  return issues;
}

function readSavedData() {
  const keys = [
    ...Object.keys(getSettingDefinitions()),
    SETTINGS.proficientSkillsOnly,
    SETTINGS.panelStates,
    SETTINGS.windowGeometry
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
    "statusDescriptions",
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

export function repairSavedData() {
  return queue(async () => {
    // Re-read before writing: do not apply suggestions from an outdated report.
    const { values, issues } = readSavedData();
    const repairs = issues.filter(issue => issue.repairable);
    if (!repairs.length) return 0;
    await game.settings.set(MODULE_ID, SETTINGS.repairBackup, {
      createdAt: new Date().toISOString(),
      values
    });
    for (const { key, next } of repairs)
      await game.settings.set(MODULE_ID, key, next);
    Hooks.callAll(
      "adventurerHudSettingsChanged",
      new Map(repairs.map(issue => [issue.key, issue.next]))
    );
    return repairs.length;
  });
}
