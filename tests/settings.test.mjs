import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_SETTINGS,
  isSettingSupported,
  migrateLegacySettings,
  moveSettingsMenusToBottom,
  registerSettings,
  resetSettings,
  SETTING_DEFAULTS,
  SETTING_GROUPS,
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

test("manual mode navigation defaults to hidden and migrations are per user", () => {
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
  assert.equal(registrations.get(SETTINGS.migrationVersion)?.scope, "user");
  assert.equal(registrations.get(SETTINGS.fontSize)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.default, false);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.config, true);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.default, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.config, true);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.default, true);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.fontSize)?.choices ?? {}),
    ["small", "medium", "large", "extraLarge"]
  );
  assert.equal(registrations.get(SETTINGS.fontSize)?.default, "medium");
  assert.equal(registrations.get(SETTINGS.showShortcuts)?.config, false);
  assert.equal(menus.get("configure")?.restricted, false);
  assert.equal(menus.get("reset")?.restricted, false);
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.fontSize));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.autoUpdateActor));
  assert.ok(BASIC_SETTINGS.includes(SETTINGS.showTokenControl));
  assert.ok(!BASIC_SETTINGS.includes(SETTINGS.showShortcuts));
  assert.ok(SETTING_GROUPS.advanced.includes(SETTINGS.showModeNavigation));
  assert.ok(SETTING_GROUPS.combat.includes(SETTINGS.showCombatResources));

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
  assert.equal(isSettingSupported(SETTINGS.showInventory, "dnd5e"), true);
  assert.equal(isSettingSupported(SETTINGS.showDeathSaves, "unknown"), false);
  assert.equal(isSettingSupported(SETTINGS.fontSize, "unknown"), true);
});

test("migration preserves navigation and moves legacy spell visibility", async () => {
  const writes = [];

  globalThis.game = {
    settings: {
      get(_moduleId, key) {
        if (key === SETTINGS.migrationVersion) return 1;
        if (key === SETTINGS.showModeNavigation) return true;
        if (key === SETTINGS.showCombatSpells) return false;
        return null;
      },
      async set(_moduleId, key, value) {
        writes.push([key, value]);
        return value;
      }
    }
  };

  await migrateLegacySettings();

  assert.deepEqual(writes, [
    [SETTINGS.showSpells, false],
    [SETTINGS.migrationVersion, 4]
  ]);
});

test("font size migration preserves the previous visual scale", async () => {
  const writes = [];

  globalThis.game = {
    settings: {
      get(_moduleId, key) {
        if (key === SETTINGS.migrationVersion) return 3;
        if (key === SETTINGS.fontSize) return "large";
        return null;
      },
      async set(_moduleId, key, value) {
        writes.push([key, value]);
        return value;
      }
    }
  };

  await migrateLegacySettings();

  assert.deepEqual(writes, [
    [SETTINGS.fontSize, "medium"],
    [SETTINGS.migrationVersion, 4]
  ]);
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
