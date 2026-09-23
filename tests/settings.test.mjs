import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_SETTINGS,
  isSettingSupported,
  moveResetSettingsMenuToBottom,
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

test("manual mode navigation and optional controls default to hidden", () => {
  const registrations = new Map();
  const menus = new Map();

  globalThis.Hooks = { callAll() {} };
  installFoundryApplicationStub();
  globalThis.game = {
    settings: {
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
  assert.equal(registrations.get(SETTINGS.pinWindow)?.config, true);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.default, false);
  assert.equal(registrations.get(SETTINGS.closeAfterRoll)?.config, true);
  assert.equal(registrations.get(SETTINGS.closeAfterRoll)?.default, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.config, true);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.default, false);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.fontSize)?.choices ?? {}),
    ["small", "medium", "large", "extraLarge"]
  );
  assert.equal(registrations.get(SETTINGS.fontSize)?.default, "medium");
  assert.equal(menus.has("configure"), false);
  assert.equal(menus.get("reset")?.restricted, false);
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.fontSize));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.autoUpdateActor));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.showTokenControl));
  assert.ok(SETTING_GROUPS.behavior.includes(SETTINGS.showModeNavigation));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.showModeNavigation));
  assert.deepEqual(SETTING_GROUPS.combat, [SETTINGS.showItemDetails]);
  assert.deepEqual(SETTING_GROUPS.regular, [SETTINGS.showDeathSaves]);

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

test("reset settings menu is moved below regular options", () => {
  const appended = [];
  const parent = { append: row => appended.push(row.id) };
  const rows = {
    "adventurer-hud.reset": { id: "reset", parentElement: parent }
  };
  const root = {
    querySelector(selector) {
      const id = Object.keys(rows).find(key => selector.includes(key));
      return id ? { closest: () => rows[id] } : null;
    }
  };

  moveResetSettingsMenuToBottom(root);

  assert.deepEqual(appended, ["reset"]);
});
