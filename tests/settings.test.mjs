import assert from "node:assert/strict";
import test from "node:test";

import {
  isSettingSupported,
  localizeSettingsRows,
  moveSettingsMenusToBottom,
  registerSettings,
  resetSettings,
  SETTING_DEFINITIONS,
  SETTING_DEFAULTS,
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
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.default, false);
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.scope, "user");
  assert.equal(registrations.get(SETTINGS.panelStates)?.config, false);
  assert.equal(registrations.get(SETTINGS.panelStates)?.scope, "user");
  assert.equal(registrations.get(SETTINGS.pinWindow)?.config, false);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.default, false);
  assert.equal(registrations.has("closeAfterRoll"), false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.config, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.default, false);
  assert.equal(registrations.get(SETTINGS.showVisualEffects)?.default, true);
  assert.equal(registrations.get(SETTINGS.showVisualEffects)?.config, false);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.fontSize)?.choices ?? {}),
    ["small", "medium", "large", "extraLarge"]
  );
  assert.equal(registrations.get(SETTINGS.fontSize)?.default, "medium");
  assert.equal(registrations.get(SETTINGS.language)?.default, "auto");
  assert.equal(registrations.get(SETTINGS.proficientSkillsOnly)?.default, true);
  assert.equal(registrations.get(SETTINGS.proficientSkillsOnly)?.config, false);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.language)?.choices ?? {}),
    ["auto", "en", "ru"]
  );
  assert.equal(SETTING_DEFINITIONS[SETTINGS.language].placement, "basic");
  assert.equal(menus.get("configure")?.restricted, false);
  assert.equal(menus.get("reset")?.restricted, false);
  assert.equal(SETTING_DEFINITIONS[SETTINGS.fontSize].placement, "basic");
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.autoUpdateActor].placement,
    "basic"
  );
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.showTokenControl].placement,
    "advanced"
  );
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.showModeNavigation].group,
    "behavior"
  );
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.showModeNavigation].placement,
    "basic"
  );
  const context = await new (menus.get("configure").type)()._prepareContext();
  assert.deepEqual(
    context.groups.map(group => group.label),
    [
      "ADVENTURER_HUD.Settings.Groups.quickAccess",
      "ADVENTURER_HUD.Settings.Groups.itemUse",
      "ADVENTURER_HUD.Settings.Groups.interface"
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

  const groupedKeys = Object.keys(SETTING_DEFINITIONS);
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
  const batches = [];
  const current = new Map(
    Object.entries(SETTING_DEFAULTS).map(([key, value]) => [key, !value])
  );
  current.set(SETTINGS.proficientSkillsOnly, false);
  globalThis.Hooks = {
    callAll(name, changes) {
      if (name === "adventurerHudSettingsChanged") batches.push(changes);
    }
  };
  installFoundryApplicationStub();
  const registrations = new Map();
  globalThis.game = {
    system: { id: "dnd5e" },
    settings: {
      get: (_moduleId, key) => current.get(key),
      register: (_moduleId, key, config) => registrations.set(key, config),
      registerMenu() {},
      async set(_moduleId, key, value) {
        writes.push([key, value]);
        current.set(key, value);
        registrations.get(key)?.onChange?.(value);
      }
    }
  };

  registerSettings();
  await resetSettings();

  assert.deepEqual(writes, [
    ...Object.entries(SETTING_DEFAULTS),
    [SETTINGS.proficientSkillsOnly, true]
  ]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].size, writes.length);
  await resetSettings();
  assert.equal(writes.length, batches[0].size);
  assert.equal(batches.length, 1);
});

test("additional settings save only changed controls", async () => {
  const registrations = new Map();
  const menus = new Map();
  const current = new Map(Object.entries(SETTING_DEFAULTS));
  const writes = [];
  const batches = [];
  globalThis.Hooks = {
    callAll(name, changes) {
      if (name === "adventurerHudSettingsChanged") batches.push(changes);
    }
  };
  installFoundryApplicationStub();
  globalThis.game = {
    system: { id: "dnd5e" },
    settings: {
      get: (_moduleId, key) => current.get(key),
      register: (_moduleId, key, config) => registrations.set(key, config),
      registerMenu: (_moduleId, key, config) => menus.set(key, config),
      async set(_moduleId, key, value) {
        writes.push([key, value]);
        current.set(key, value);
        registrations.get(key)?.onChange?.(value);
      }
    }
  };
  registerSettings();
  const handler = menus.get("configure").type.DEFAULT_OPTIONS.form.handler;
  const values = Object.fromEntries(current);
  values.showSearch = false;
  await handler(null, null, { object: values });
  assert.deepEqual(writes, [[SETTINGS.showSearch, false]]);
  assert.equal(batches.length, 1);
  assert.deepEqual([...batches[0]], [[SETTINGS.showSearch, false]]);
  await handler(null, null, { object: values });
  assert.equal(writes.length, 1);
  assert.equal(batches.length, 1);
});

test("system capabilities control system-specific settings", () => {
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
  assert.equal(settingRefreshStrategy(SETTINGS.showVisualEffects), "runtime");
  assert.equal(settingRefreshStrategy(SETTINGS.fontSize), "reopen");
  assert.equal(
    settingRefreshStrategy(SETTINGS.proficientSkillsOnly),
    "content"
  );
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

test("module settings rows use the selected module language", async () => {
  const previousGame = globalThis.game;
  const label = { textContent: "" };
  const hint = { textContent: "" };
  const row = {
    querySelector: selector =>
      selector === "label" ? label : selector === ".hint" ? hint : null
  };
  globalThis.game = {
    i18n: {
      lang: "en",
      localize: key => `translated:${key}`
    },
    settings: { get: () => "auto" }
  };

  try {
    await localizeSettingsRows({
      querySelector: selector =>
        selector.includes("adventurer-hud.showSearch")
          ? { closest: () => row }
          : null
    });
    assert.equal(
      label.textContent,
      "translated:ADVENTURER_HUD.Settings.showSearch.Name"
    );
    assert.equal(
      hint.textContent,
      "translated:ADVENTURER_HUD.Settings.showSearch.Hint"
    );
  } finally {
    globalThis.game = previousGame;
  }
});

test("additional and reset menu labels follow the module translator", async () => {
  const previousGame = globalThis.game;
  const menuRows = Object.fromEntries(
    ["configure", "reset"].map(key => {
      const buttonText = { nodeType: 3, textContent: "Old label" };
      const button = {
        nodeType: 1,
        childNodes: [{ nodeType: 1, childNodes: [buttonText] }]
      };
      const label = { textContent: "" };
      const hint = { textContent: "" };
      return [
        key,
        {
          label,
          hint,
          buttonText,
          querySelector: selector =>
            selector === "label, h4"
              ? label
              : selector === ".hint"
                ? hint
                : selector === "button"
                  ? button
                  : null
        }
      ];
    })
  );
  globalThis.game = {
    i18n: { lang: "en", localize: key => `translated:${key}` },
    settings: { get: () => "auto" }
  };
  try {
    await localizeSettingsRows({
      querySelector: selector => {
        const key = ["configure", "reset"].find(name =>
          selector.includes(`adventurer-hud.${name}`)
        );
        return key ? { closest: () => menuRows[key] } : null;
      }
    });
    assert.equal(
      menuRows.configure.label.textContent,
      "translated:ADVENTURER_HUD.Settings.Advanced.Name"
    );
    assert.equal(
      menuRows.configure.buttonText.textContent,
      "translated:ADVENTURER_HUD.Settings.Advanced.Label"
    );
    assert.equal(
      menuRows.reset.hint.textContent,
      "translated:ADVENTURER_HUD.Settings.Reset.Hint"
    );
  } finally {
    globalThis.game = previousGame;
  }
});
