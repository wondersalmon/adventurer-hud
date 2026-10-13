import assert from "node:assert/strict";
import test from "node:test";
import {
  checkIntegrity,
  inspectSavedData,
  repairSavedData,
  canRepairIssue
} from "../scripts/integrity.js";
import { SETTINGS } from "../scripts/settings-schema.js";
import { SettingsSaveError } from "../scripts/settings-access.js";
import { escapeHTML } from "./helpers/rendering.mjs";
import { createPanelPreferences } from "../scripts/hud/panel-preferences.js";
import { createHudState } from "../scripts/hud/state.js";
import { hudElementHidden } from "../scripts/hud/window/hud-layout-model.js";
import { createIntegrityApplication } from "../scripts/integrity-ui.js";
import {
  installSettings as installSettingsBase,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

test("check results distinguish healthy, repairable and manual failures", async () => {
  installSettings({ isGM: true, values: { language: "auto" } });
  const App = createIntegrityApplication();
  const app = new App();
  assert.equal((await app._prepareContext()).summarySeverity, "pending");
  app.report = { issues: [] };
  let context = await app._prepareContext();
  assert.equal(context.summarySeverity, "success");
  assert.ok(context.checks.every(check => check.severity === "success"));
  app.report.issues = [
    {
      code: "SavedData",
      key: "showSearch",
      detail: "showSearch",
      repairable: true
    }
  ];
  context = await app._prepareContext();
  assert.equal(context.summarySeverity, "warning");
  assert.equal(context.issues[0].severity, "warning");
  app.report.issues.push({
    code: "File",
    detail: "lang/ru.json",
    repairable: false
  });
  context = await app._prepareContext();
  assert.equal(context.summarySeverity, "error");
  assert.equal(context.issues[1].severity, "error");
  assert.equal(
    context.checks.find(check => check.label.endsWith("CheckFiles")).severity,
    "error"
  );
});

function installSettings(options) {
  const result = installSettingsBase(options);
  foundry.utils = { escapeHTML, saveDataToFile() {} };
  return result;
}

test("repair availability matches player permissions", async () => {
  const { current } = installSettings({
    values: { gmRosterColumnRatio: "broken" }
  });
  const issues = inspectSavedData(Object.fromEntries(current));
  assert.ok(issues.some(issue => issue.repairable));
  assert.equal(issues.some(canRepairIssue), false);
  assert.equal(await repairSavedData(), 0);
});

test("repair migrates the old dock without changing expansion category IDs or existing footer choices", async () => {
  const layouts = {
    "regular:dock": { order: ["effects", "hints"], hidden: ["effects"] },
    "regular:footer": { order: ["hints"], hidden: [] },
    "combat:expanded": {
      order: ["weapons", "activation:epic", "custom-category"],
      hidden: []
    }
  };
  const { current } = installSettings({
    values: { panelStates: { "Actor.hero": { hudLayouts: layouts } } }
  });
  const issues = inspectSavedData(Object.fromEntries(current));
  assert.ok(issues.some(canRepairIssue));
  assert.equal(
    issues.some(issue => issue.code === "Layout"),
    false
  );
  assert.ok(
    current.get(SETTINGS.panelStates)["Actor.hero"].hudLayouts["regular:dock"]
  );
  await repairSavedData(issues.filter(canRepairIssue));
  const repaired = current.get(SETTINGS.panelStates)["Actor.hero"].hudLayouts;
  assert.equal(repaired["regular:dock"], undefined);
  assert.deepEqual(repaired["regular:footer"], {
    order: ["hints", "effects"],
    hidden: ["effects"]
  });
  assert.deepEqual(repaired["combat:expanded"], layouts["combat:expanded"]);
  assert.deepEqual(
    current.get(SETTINGS.repairBackup).values.panelStates["Actor.hero"]
      .hudLayouts,
    layouts
  );
});

test("layout repair resolves duplicate placements and preserves unknown data without hiding current blocks", async () => {
  const { current } = installSettings({
    isGM: true,
    values: {
      panelStates: {
        "gm:layout": {
          hudLayouts: {
            "combat:info": { order: ["identity"], hidden: [] },
            "combat:actions": {
              order: ["identity", "tab:activation:custom"],
              hidden: []
            },
            "future:lane": { order: ["future-block"], hidden: ["search"] }
          }
        }
      }
    }
  });
  const issues = inspectSavedData(Object.fromEntries(current));
  assert.ok(issues.some(issue => issue.code === "Layout" && !issue.repairable));
  assert.ok(
    issues.some(issue =>
      issue.changes?.some(change => change.path.includes("combat:actions"))
    )
  );
  await repairSavedData();
  const layouts = current.get(SETTINGS.panelStates)["gm:layout"].hudLayouts;
  assert.deepEqual(layouts["combat:actions"].order, ["tab:activation:custom"]);
  assert.deepEqual(layouts["future:lane"].hidden, ["search"]);
  assert.equal(
    hudElementHidden(createHudState({ hudLayouts: layouts }), "search"),
    false
  );
});

test("a changed repair plan performs no writes and cancellation leaves data intact", async () => {
  const { current, writes } = installSettings({
    values: { showSearch: "broken" }
  });
  const issues = inspectSavedData(Object.fromEntries(current));
  current.set(SETTINGS.showSearch, false);
  await assert.rejects(
    repairSavedData(issues.filter(canRepairIssue)),
    /repair-plan-changed/
  );
  assert.deepEqual(writes, []);
  current.set(SETTINGS.showSearch, "broken");
  const Application = createIntegrityApplication();
  foundry.applications.api.DialogV2 = { confirm: async () => false };
  await Application.DEFAULT_OPTIONS.actions.repair.call({
    busy: false,
    report: { issues },
    render: async () => {},
    t: key => key
  });
  assert.deepEqual(writes, []);
});

test("download before-repair backup contains the original values without repairing them", async () => {
  const { current } = installSettings({ values: { showSearch: "broken" } });
  await repairSavedData();
  let downloaded;
  foundry.utils.saveDataToFile = text => (downloaded = JSON.parse(text));
  const Application = createIntegrityApplication();
  await Application.DEFAULT_OPTIONS.actions.backuprepair.call({
    t: key => key
  });
  assert.equal(downloaded.settings.showSearch, "broken");
  assert.equal(current.get(SETTINGS.showSearch), true);
});

test("repair removes malformed known panel fields while preserving unknown fields and valid layouts", async () => {
  const layout = { "regular:info": { order: ["identity"], hidden: [] } };
  const { current } = installSettings({
    values: {
      panelStates: {
        "Actor.a": {
          showPassiveFeatures: "broken",
          allFeatures: "broken",
          hudLayouts: null,
          itemLayouts: false,
          futureField: 3
        },
        "Actor.b": {
          hudLayouts: layout,
          showPassiveFeatures: true,
          allFeatures: true
        }
      }
    }
  });
  await repairSavedData();
  assert.deepEqual(current.get(SETTINGS.panelStates), {
    "Actor.a": { futureField: 3 },
    "Actor.b": {
      hudLayouts: layout,
      showPassiveFeatures: true,
      allFeatures: true
    }
  });
  assert.equal(await repairSavedData(), 0);
});

test("repair rolls back rejected writes and retains the original backup", async t => {
  const { current } = installSettings({
    values: { showSearch: "broken", showFavorites: "broken" }
  });
  const original = game.settings.set;
  t.mock.method(game.settings, "set", async (moduleId, key, value) => {
    await original(moduleId, key, value);
    if (key === SETTINGS.showSearch && value === true)
      throw new Error("write failed after mutation");
  });
  await assert.rejects(
    repairSavedData(),
    error =>
      error instanceof SettingsSaveError &&
      error.rollbackFailedKeys.length === 0
  );
  assert.equal(current.get(SETTINGS.showFavorites), "broken");
  assert.equal(current.get(SETTINGS.showSearch), "broken");
  assert.equal(current.get(SETTINGS.repairBackup).values.showSearch, "broken");
});

test("troubleshooting reports incomplete repair rollback and unlocks its controls", async t => {
  const { current, notifications } = installSettings({
    values: { showSearch: "broken" }
  });
  const original = game.settings.set;
  t.mock.method(game.settings, "set", async (moduleId, key, value) => {
    if (key === SETTINGS.showSearch && value === "broken")
      throw new Error("rollback failed");
    await original(moduleId, key, value);
    if (key === SETTINGS.showSearch)
      throw new Error("write failed after mutation");
  });
  const Application = createIntegrityApplication();
  const app = {
    busy: false,
    report: { issues: inspectSavedData(Object.fromEntries(current)) },
    render: async () => {},
    t: key => key
  };
  foundry.applications.api.DialogV2 = class {
    static async confirm() {
      return true;
    }
  };
  await Application.DEFAULT_OPTIONS.actions.repair.call(app);
  assert.equal(app.busy, false);
  assert.equal(app.failure, true);
  assert.equal(current.get(SETTINGS.showSearch), true);
  assert.equal(current.get(SETTINGS.repairBackup).values.showSearch, "broken");
  assert.deepEqual(notifications, [["warn", "Integrity.RepairPartial"]]);
});

test("repair drains pending panel saves and reloads active sessions from repaired storage", async () => {
  const { current } = installSettings({
    values: { panelStates: { "Actor.bad": { showPassiveFeatures: "broken" } } }
  });
  const preferences = createPanelPreferences({
    actorUuid: "Actor.live",
    gmActive: false
  });
  const state = createHudState({ favoritesExpanded: false });
  let refreshed = 0;
  const unsubscribe = preferences.subscribe(state, () => refreshed++);
  try {
    const pending = preferences.save(state);
    await repairSavedData();
    await pending;
    assert.equal(
      current.get(SETTINGS.panelStates)["Actor.live"].favoritesExpanded,
      false
    );
    assert.deepEqual(current.get(SETTINGS.panelStates)["Actor.bad"], {});
    assert.equal(state.favoritesExpanded, false);
    assert.equal(refreshed, 1);
  } finally {
    unsubscribe();
  }
});

test("repair backs up and corrects only invalid data, preserving valid preferences and panels", async () => {
  const { current, writes, registrations, menus } = installSettings({
    values: {
      fontSize: "large",
      showFavorites: false,
      showSearch: "broken",
      panelStates: {
        "Actor.a": {
          favoritesExpanded: false,
          currentView: "obsolete",
          resourcesExpanded: true,
          futureField: 3
        },
        "Actor.b": { currentView: "spells" }
      },
      windowGeometry: { left: 12, top: 10, width: 100, height: 240 }
    }
  });
  assert.equal(registrations.has("manageResources"), false);
  assert.equal(menus.get("troubleshooting").restricted, false);
  assert.equal(await repairSavedData(), 3);
  assert.equal(writes[0][0], SETTINGS.repairBackup);
  assert.equal(current.get(SETTINGS.repairBackup).values.showSearch, "broken");
  assert.equal(current.get(SETTINGS.showSearch), true);
  assert.equal(current.get(SETTINGS.fontSize), "large");
  assert.equal(current.get(SETTINGS.showFavorites), false);
  assert.deepEqual(current.get(SETTINGS.panelStates), {
    "Actor.a": { favoritesExpanded: false, futureField: 3 },
    "Actor.b": { currentView: "spells" }
  });
  assert.equal(current.get(SETTINGS.windowGeometry).width, 270);
  assert.equal(inspectSavedData(Object.fromEntries(current)).length, 0);
  assert.equal(await repairSavedData(), 0);
});

test("a failed backup prevents repair mutations", async () => {
  const { writes } = installSettings({ values: { showSearch: "broken" } });
  const original = game.settings.set;
  game.settings.set = (moduleId, key, value) =>
    key === SETTINGS.repairBackup
      ? Promise.reject(Error("storage failed"))
      : original(moduleId, key, value);
  await assert.rejects(repairSavedData(), /storage failed/);
  assert.equal(writes.length, 0);
});

test("repair exports original data before writing and rejects changes during download", async () => {
  const { current, writes } = installSettings({
    values: { showSearch: "broken" }
  });
  const repairs = inspectSavedData(Object.fromEntries(current)).filter(
    canRepairIssue
  );
  let exported;
  await assert.rejects(
    repairSavedData(repairs, {
      beforeRepair: async backup => {
        exported = backup;
        assert.equal(current.get(SETTINGS.showSearch), "broken");
        assert.deepEqual(
          writes.map(([key]) => key),
          [SETTINGS.repairBackup]
        );
        // Another settings window changes the value while downloading.
        current.set(SETTINGS.showSearch, false);
      }
    }),
    /repair-plan-changed/
  );
  assert.equal(exported.module, "adventurer-hud");
  assert.equal(exported.format, 1);
  assert.equal(exported.settings.showSearch, "broken");
  assert.equal(current.get(SETTINGS.showSearch), false);
  assert.deepEqual(
    writes.map(([key]) => key),
    [SETTINGS.repairBackup]
  );
});

test("repair UI automatically downloads originals and stops if downloading fails", async () => {
  const { current, writes } = installSettings({
    values: { showSearch: "broken" }
  });
  const Application = createIntegrityApplication();
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  let downloaded;
  foundry.utils.saveDataToFile = async (text, type, filename) => {
    downloaded = JSON.parse(text);
    assert.equal(type, "application/json");
    assert.equal(filename, "adventurer-hud-before-repair.json");
    assert.equal(current.get(SETTINGS.showSearch), "broken");
    throw new Error("download failed");
  };
  const app = {
    busy: false,
    report: { issues: inspectSavedData(Object.fromEntries(current)) },
    render: async () => {},
    t: key => key
  };
  await Application.DEFAULT_OPTIONS.actions.repair.call(app);
  assert.equal(downloaded.settings.showSearch, "broken");
  assert.equal(current.get(SETTINGS.showSearch), "broken");
  assert.equal(current.get(SETTINGS.repairBackup).values.showSearch, "broken");
  assert.deepEqual(
    writes.map(([key]) => key),
    [SETTINGS.repairBackup]
  );
  assert.equal(app.failure, true);
  assert.equal(app.busy, false);
});

test("repair deduplicates selections and recognizes the released currency layout alias", async () => {
  const layouts = {
    "combat:info": { order: ["weight"], hidden: ["currency"] }
  };
  const { current } = installSettings({
    isGM: true,
    values: {
      cardDetailFields: ["damage", "damage"],
      gmCardDetailFields: ["range", "range"],
      hiddenEffects: ["status:prone", "status:prone"],
      panelStates: { "Actor.a": { hudLayouts: layouts } }
    }
  });
  const issues = inspectSavedData(Object.fromEntries(current));
  assert.equal(
    issues.some(issue => issue.code === "Layout"),
    false
  );
  assert.equal(await repairSavedData(), 3);
  assert.deepEqual(current.get(SETTINGS.cardDetailFields), ["damage"]);
  assert.deepEqual(current.get(SETTINGS.gmCardDetailFields), ["range"]);
  assert.deepEqual(current.get(SETTINGS.hiddenEffects), ["status:prone"]);
  assert.deepEqual(
    current.get(SETTINGS.panelStates)["Actor.a"].hudLayouts,
    layouts
  );
});

test("integrity follows static and lazy local imports, ignores JSDoc types and reports minimum versions", async t => {
  installSettings();
  foundry.utils.getRoute = value => value;
  foundry.utils.isNewerVersion = (minimum, installed) =>
    Number(minimum) > Number(installed);
  game.version = "13";
  game.system.version = "5";
  const files = new Map([
    [
      "module.json",
      JSON.stringify({
        id: "adventurer-hud",
        esmodules: ["scripts/entry.js"],
        styles: [],
        compatibility: { minimum: "14" },
        relationships: {
          systems: [{ id: "dnd5e", compatibility: { minimum: "6" } }]
        }
      })
    ],
    [
      "scripts/entry.js",
      'import { value } from "./shared.js";\nconst load = () => import("./hud/lazy.js");'
    ],
    [
      "scripts/shared.js",
      '/** @type {import("../types/hud.d.ts").HudState} */\nexport const value = 1;'
    ],
    [
      "scripts/hud/lazy.js",
      'export { value } from "../shared.js";\nimport "./missing.js";'
    ],
    [
      "lang/ru.json",
      '{"ADVENTURER_HUD.Appearance":"Внешний вид","ADVENTURER_HUD.Appearance.Hint":"Описание"}'
    ]
  ]);
  const requested = [];
  t.mock.method(globalThis, "fetch", async route => {
    const path = route.replace("modules/adventurer-hud/", "");
    requested.push(path);
    return {
      ok: path !== "scripts/hud/missing.js",
      text: async () =>
        files.get(path) ??
        (path.endsWith(".json") ? '{"key":"value"}' : "fixture")
    };
  });
  const report = await checkIntegrity();
  assert.deepEqual(
    report.issues
      .filter(issue => issue.code === "File")
      .map(issue => issue.detail),
    ["lang/ru.json", "scripts/hud/missing.js"]
  );
  assert.equal(
    requested.filter(path => path === "scripts/shared.js").length,
    1
  );
  assert.equal(
    requested.some(path => path.includes("hud.d.ts")),
    false
  );
  assert.ok(requested.includes("docs/layout-guide.ru.md"));
  assert.equal(
    report.issues.filter(issue => issue.code === "Compatibility").length,
    2
  );
});

test("integrity distinguishes repairable data from missing files and system APIs", async () => {
  installSettings({ values: { showSearch: "broken" } });
  foundry.utils = { getRoute: value => value };
  foundry.applications.api.DialogV2 = class {
    static confirm() {}
    static prompt() {}
    static wait() {}
  };
  foundry.applications.handlebars = { renderTemplate() {} };
  foundry.dice = { Roll: class {} };
  globalThis.fromUuid = async () => null;
  foundry.applications.ux = {
    TextEditor: { implementation: { enrichHTML() {} } }
  };
  game.dnd5e = { documents: { Trait: { getBaseItem() {} } } };
  game.modules = new Map([["adventurer-hud", { api: { open() {} } }]]);
  globalThis.fetch = async path => ({
    ok: !path.endsWith("styles/missing.css"),
    text: async () =>
      path.endsWith("module.json")
        ? JSON.stringify({
            id: "adventurer-hud",
            esmodules: ["scripts/adventurer-hud.js"],
            styles: ["styles/missing.css"]
          })
        : path.endsWith(".json")
          ? '{"key":"value"}'
          : "export const fixture = true;"
  });
  const report = await checkIntegrity();
  assert.ok(
    report.issues.some(
      issue => issue.key === SETTINGS.showSearch && issue.repairable
    )
  );
  assert.ok(
    report.issues.some(issue => issue.code === "File" && !issue.repairable)
  );
  assert.equal(
    report.issues.some(issue => issue.code === "Api"),
    false
  );
  delete game.dnd5e.documents.Trait;
  assert.ok(
    (await checkIntegrity()).issues.some(issue => issue.code === "Api")
  );
});
