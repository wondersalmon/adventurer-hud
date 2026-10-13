import { MODULE_ID } from "./module-id.js";
import {
  getSettingDefinitions,
  SETTINGS,
  normalizeHudTheme,
  validCardDetailFields,
  validHiddenEffects
} from "./settings-schema.js";
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
  // Released layouts may still hide coins through this supported alias.
  blocks.add("currency");
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
    const value =
      key === SETTINGS.theme ? normalizeHudTheme(values[key]) : values[key];
    const valid =
      key === SETTINGS.hiddenEffects
        ? validHiddenEffects(value)
        : [SETTINGS.cardDetailFields, SETTINGS.gmCardDetailFields].includes(key)
          ? validCardDetailFields(value)
          : definition.type === Boolean
            ? typeof value === "boolean"
            : definition.type === Number
              ? typeof value === "number" &&
                Number.isFinite(value) &&
                (!definition.range ||
                  (value >= definition.range.min &&
                    value <= definition.range.max))
              : typeof value === "string" &&
                (!definition.choices ||
                  Object.hasOwn(definition.choices, value)) &&
                (!definition.color || /^#[0-9a-f]{6}$/i.test(value));
    if (!valid) suggest(key, definition.default);
    else if (Array.isArray(value)) suggest(key, [...new Set(value)]);
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
        "unpreparedSpellsOnly",
        "spellSource",
        "combatCategory",
        "inventoryCategory",
        "currentView",
        "companionsExpanded",
        "showPassiveFeatures",
        "allFeatures",
        "itemLayouts",
        "hudLayouts",
        "collapsedFeatureGroups"
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
  const visited = new Set();
  const deadline = AbortSignal.timeout(30000);
  const read = async path => {
    if (
      typeof path !== "string" ||
      path.includes("..") ||
      path.startsWith("/") ||
      !/^[\w./-]+$/.test(path)
    )
      throw new Error("module.json");
    const response = await fetch(
      foundry.utils.getRoute(`modules/${MODULE_ID}/${path}`),
      {
        cache: "no-store",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)])
      }
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
      !manifest.esmodules.length ||
      !Array.isArray(manifest.styles)
    )
      throw new Error("module.json");
    const paths = [
      ...manifest.esmodules,
      ...manifest.styles,
      "lang/en.json",
      "lang/ru.json",
      "templates/rolls-hud.hbs",
      "templates/settings.hbs",
      "templates/reset-settings.hbs",
      "templates/integrity.hbs",
      "CHANGELOG.md",
      "CHANGELOG.ru.md",
      ...["player", "gm", "companions", "layout"].flatMap(guide => [
        `docs/${guide}-guide.md`,
        `docs/${guide}-guide.ru.md`
      ])
    ];
    // Follow local static and literal lazy imports without executing module code.
    // Imports in JSDoc/comments are types, not installed runtime dependencies.
    while (paths.length) {
      const batch = [];
      while (paths.length && batch.length < 8) {
        const path = paths.shift();
        if (visited.has(path)) continue;
        visited.add(path);
        batch.push(path);
      }
      await Promise.all(
        batch.map(async path => {
          try {
            const source = await read(path);
            if (path.endsWith(".json")) {
              const catalog = JSON.parse(source);
              if (
                !isRecord(catalog) ||
                !Object.keys(catalog).length ||
                Object.values(catalog).some(value => typeof value !== "string")
              )
                throw new Error(path);
              for (const key of Object.keys(catalog)) {
                const parts = key.split(".");
                for (let index = 1; index < parts.length; index++)
                  if (Object.hasOwn(catalog, parts.slice(0, index).join(".")))
                    throw new Error(path);
              }
            }
            if (!path.endsWith(".js")) return;
            const imports = source.replace(/\/\*[\s\S]*?\*\//g, "");
            for (const match of imports.matchAll(
              /(?:^|\n)\s*(?:import|export)\s+(?:[\w$*,{}\s]+\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
            )) {
              const specifier = match[1] ?? match[2];
              if (!specifier.startsWith(".")) continue;
              const parent = new URL(path, "https://hud.invalid/");
              const imported = new URL(specifier, parent);
              if (
                !imported.pathname.startsWith("/scripts/") ||
                !imported.pathname.endsWith(".js") ||
                imported.search ||
                imported.hash
              )
                throw new Error(path);
              const dependency = imported.pathname.slice(1);
              if (!visited.has(dependency)) paths.push(dependency);
            }
          } catch {
            issues.push({ code: "File", detail: path, repairable: false });
          }
        })
      );
      if (visited.size > 512) throw new Error("module.json");
    }
    const system = manifest.relationships?.systems?.find(
      entry => entry.id === game.system.id
    );
    for (const [name, installed, minimum] of [
      ["Foundry", game.version, manifest.compatibility?.minimum],
      ["D&D 5e", game.system.version, system?.compatibility?.minimum]
    ])
      if (
        installed &&
        minimum &&
        foundry.utils.isNewerVersion?.(minimum, installed)
      )
        issues.push({
          code: "Compatibility",
          detail: `${name}: ${installed} < ${minimum}`,
          repairable: false
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
    ["ApplicationV2", foundry.applications?.api?.ApplicationV2],
    [
      "HandlebarsApplicationMixin",
      foundry.applications?.api?.HandlebarsApplicationMixin
    ],
    ["DialogV2.confirm", foundry.applications?.api?.DialogV2?.confirm],
    ["DialogV2.prompt", foundry.applications?.api?.DialogV2?.prompt],
    ["DialogV2.wait", foundry.applications?.api?.DialogV2?.wait],
    [
      "renderTemplate",
      foundry.applications?.handlebars?.renderTemplate ??
        globalThis.renderTemplate
    ],
    ["Roll", foundry.dice?.Roll ?? globalThis.Roll],
    ["fromUuid", globalThis.fromUuid],
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
    "useActivity",
    "inventorySummary",
    "spellSlotPoolData",
    "setSpellSlotValue",
    "familiarSourceItem",
    "useFamiliarSenses",
    "npcResource",
    "npcTraits",
    "movementSummary"
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

export function repairSavedData(expectedRepairs, { beforeRepair } = {}) {
  return queue(async () => {
    await flushWindowGeometry();
    return replacePanelPreferences(async () => {
      // Re-read before writing: do not apply suggestions from an outdated report.
      const { values, issues } = readSavedData();
      const repairs = issues.filter(canRepairIssue);
      const plan = entries =>
        entries.map(({ key, next, changes }) => ({ key, next, changes }));
      if (expectedRepairs && !same(plan(expectedRepairs), plan(repairs)))
        throw new Error("repair-plan-changed");
      if (!repairs.length) return 0;
      await game.settings.set(MODULE_ID, SETTINGS.repairBackup, {
        createdAt: new Date().toISOString(),
        values: structuredClone(values)
      });
      // Export the same fresh snapshot after confirmation and before mutations.
      await beforeRepair?.({
        module: MODULE_ID,
        format: 1,
        settings: structuredClone(values)
      });
      if (
        !same(
          plan(repairs),
          plan(readSavedData().issues.filter(canRepairIssue))
        )
      )
        throw new Error("repair-plan-changed");
      await saveChangedSettings(
        repairs.map(({ key, next }) => [key, next]),
        { rollbackOnError: true }
      );
      return repairs.length;
    });
  });
}
