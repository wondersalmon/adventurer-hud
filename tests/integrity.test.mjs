import assert from "node:assert/strict";
import test from "node:test";
import {
  checkIntegrity,
  inspectSavedData,
  repairSavedData
} from "../scripts/integrity.js";
import { SETTINGS } from "../scripts/settings-schema.js";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

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
  assert.equal(menus.get("integrity").restricted, false);
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

test("integrity distinguishes repairable data from missing files and system APIs", async () => {
  installSettings({ values: { showSearch: "broken" } });
  foundry.utils = { getRoute: value => value };
  foundry.applications.api.DialogV2 = class {};
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
