import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_SETTINGS,
  isSettingSupported,
  moveSettingsMenusToBottom,
  registerSettings,
  resetSettings,
  SETTING_DEFINITIONS,
  SETTING_DEFAULTS,
  SETTING_GROUPS,
  settingRefreshStrategy,
  SETTINGS
} from "../scripts/settings.js";

function installFoundryApplicationStub() {
  class ApplicationV2 {}
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: Base => class extends Base {}
      }
    }
  };
}

test("main and additional settings use task-based groups", async () => {
  const registrations = new Map();
  const menus = new Map();

  globalThis.Hooks = { callAll() {} };
  installFoundryApplicationStub();
  globalThis.game = {
    system: { id: "dnd5e" },
    i18n: { localize: key => key },
    settings: {
      settings: { get: id => registrations.get(id.split(".").at(-1)) },
      get: (_moduleId, key) => registrations.get(key)?.default,
      register(_moduleId, key, config) {
        registrations.set(key, config);
      },
      registerMenu(_moduleId, key, config) {
        menus.set(key, config);
      }
    }
  };

  registerSettings();

  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.default, false);
  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.config, true);
  assert.equal(registrations.get(SETTINGS.fontSize)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.default, false);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.config, false);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.default, false);
  assert.equal(registrations.get(SETTINGS.closeAfterRoll)?.config, true);
  assert.equal(registrations.get(SETTINGS.closeAfterRoll)?.default, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.config, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.default, false);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.fontSize)?.choices ?? {}),
    ["small", "medium", "large", "extraLarge"]
  );
  assert.equal(registrations.get(SETTINGS.fontSize)?.default, "medium");
  assert.equal(menus.get("configure")?.restricted, false);
  assert.equal(menus.get("reset")?.restricted, false);
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.fontSize));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.autoUpdateActor));
  assert.ok(!BASIC_SETTINGS.includes(SETTINGS.showTokenControl));
  assert.ok(SETTING_GROUPS.behavior.includes(SETTINGS.showModeNavigation));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.showModeNavigation));
  assert.deepEqual(SETTING_GROUPS.itemUse, [
    SETTINGS.showItemDetails,
    SETTINGS.groupActionTypes,
    SETTINGS.showActivityPicker
  ]);
  assert.deepEqual(SETTING_GROUPS.death, [SETTINGS.showDeathSaves]);
  const context = await new (menus.get("configure").type)()._prepareContext();
  assert.deepEqual(
    context.groups.map(group => group.label),
    [
      "ADVENTURER_HUD.Settings.Groups.quickAccess",
      "ADVENTURER_HUD.Settings.Groups.itemUse",
      "ADVENTURER_HUD.Settings.Groups.window",
      "ADVENTURER_HUD.Settings.Groups.death"
    ]
  );
  for (const key of [
    SETTINGS.showSearch,
    SETTINGS.showFavorites,
    SETTINGS.showActivityPicker
  ]) {
    assert.equal(registrations.get(key)?.config, false);
    assert.equal(registrations.get(key)?.default, true);
  }

  const groupedKeys = Object.values(SETTING_GROUPS).flat();
  const configurableKeys = [...registrations]
    .filter(([, definition]) =>
      definition.name.startsWith("ADVENTURER_HUD.Settings.")
    )
    .map(([key]) => key);
  assert.equal(new Set(groupedKeys).size, groupedKeys.length);
  assert.deepEqual(new Set(groupedKeys), new Set(configurableKeys));
});

test("reset restores configurable defaults", async () => {
  const writes = [];
  globalThis.game = {
    settings: {
      async set(_moduleId, key, value) {
        writes.push([key, value]);
      }
    }
  };

  await resetSettings();

  assert.deepEqual(writes, Object.entries(SETTING_DEFAULTS));
});

test("system capabilities control system-specific settings", () => {
  assert.equal(isSettingSupported(SETTINGS.showDeathSaves, "dnd5e"), true);
  assert.equal(isSettingSupported(SETTINGS.showDeathSaves, "unknown"), false);
  assert.equal(isSettingSupported(SETTINGS.showActivityPicker, "dnd5e"), true);
  assert.equal(
    isSettingSupported(SETTINGS.showActivityPicker, "unknown"),
    false
  );
  assert.equal(isSettingSupported(SETTINGS.fontSize, "unknown"), true);
});

test("setting metadata drives defaults, placement, and refresh behavior", () => {
  assert.deepEqual(
    new Set(Object.keys(SETTING_DEFINITIONS)),
    new Set(Object.keys(SETTING_DEFAULTS))
  );
  assert.equal(settingRefreshStrategy(SETTINGS.pinWindow), "runtime");
  assert.equal(settingRefreshStrategy(SETTINGS.showDeathSaves), "content");
  assert.equal(settingRefreshStrategy(SETTINGS.fontSize), "reopen");
  assert.equal(settingRefreshStrategy("unknown"), "none");
});

test("additional and reset settings menus are moved below regular options", () => {
  const appended = [];
  const parent = { append: row => appended.push(row.id) };
  const rows = {
    "adventurer-hud.configure": { id: "configure", parentElement: parent },
    "adventurer-hud.reset": { id: "reset", parentElement: parent }
  };
  const root = {
    querySelector(selector) {
      const id = Object.keys(rows).find(key => selector.includes(key));
      return id ? { closest: () => rows[id] } : null;
    }
  };

  moveSettingsMenusToBottom(root);

  assert.deepEqual(appended, ["configure", "reset"]);
});
