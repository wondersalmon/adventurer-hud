import assert from "node:assert/strict";
import test from "node:test";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();

import {
  getSettingDefinitions,
  getSettingDefaults,
  localizeSettingsRows,
  moveSettingsMenusToBottom,
  resetSettings,
  SETTING_DEFINITIONS,
  SETTING_DEFAULTS,
  settingRefreshStrategy,
  SETTINGS
} from "../scripts/settings.js";

test("main and additional settings use task-based groups", async () => {
  const { registrations, menus } = installSettings();

  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.default, false);
  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.config, false);
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
  assert.equal(menus.has("reset"), false);
  assert.equal(menus.get("gm")?.restricted, true);
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
    "interface"
  );
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.showModeNavigation].placement,
    "advanced"
  );
  const context = await new (menus.get("configure").type)()._prepareContext();
  assert.deepEqual(
    [...registrations]
      .filter(([, definition]) => definition.config)
      .map(([key]) => key),
    [
      SETTINGS.language,
      SETTINGS.fontSize,
      SETTINGS.autoOpenHud,
      SETTINGS.autoUpdateActor
    ]
  );
  const visibleKeys = context.groups.flatMap(group =>
    group.settings.map(setting => setting.key)
  );
  assert.equal(visibleKeys.includes(SETTINGS.pinWindow), false);
  assert.equal(visibleKeys.includes(SETTINGS.showModeNavigation), true);
  assert.equal(new Set(visibleKeys).size, visibleKeys.length);
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

  const groupedKeys = Object.keys(getSettingDefinitions());
  const configurableKeys = [...registrations]
    .filter(([, definition]) =>
      definition.name.startsWith("ADVENTURER_HUD.Settings.")
    )
    .map(([key]) => key);
  assert.deepEqual(new Set(groupedKeys), new Set(configurableKeys));
});

test("reset restores configurable defaults", async () => {
  const batches = [];
  const values = Object.fromEntries(
    Object.entries(getSettingDefaults("dnd5e")).map(([key, value]) => [
      key,
      !value
    ])
  );
  values[SETTINGS.proficientSkillsOnly] = false;
  const { writes } = installSettings({
    values,
    onEvent: (name, changes) => {
      if (name === "adventurerHudSettingsChanged") batches.push(changes);
    }
  });
  await resetSettings();

  assert.deepEqual(writes, [
    ...Object.entries(getSettingDefaults("dnd5e")).filter(
      ([key]) => !getSettingDefinitions()[key].gmOnly
    ),
    [SETTINGS.proficientSkillsOnly, true]
  ]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].size, writes.length);
  await resetSettings();
  assert.equal(writes.length, batches[0].size);
  assert.equal(batches.length, 1);
});

test("additional settings serialize concurrent saves and write only changed controls", async () => {
  const batches = [];
  const { current, menus, writes } = installSettings({
    onEvent: (name, changes) => {
      if (name === "adventurerHudSettingsChanged") batches.push(changes);
    }
  });
  const handler = menus.get("configure").type.DEFAULT_OPTIONS.form.handler;
  const values = Object.fromEntries(current);
  values.showSearch = false;
  values.pinWindow = true;
  await Promise.all([
    handler(null, null, { object: values }),
    handler(null, null, { object: values })
  ]);
  assert.deepEqual(writes, [[SETTINGS.showSearch, false]]);
  assert.equal(batches.length, 1);
  assert.deepEqual([...batches[0]], [[SETTINGS.showSearch, false]]);
  await handler(null, null, { object: values });
  assert.equal(writes.length, 1);
  assert.equal(batches.length, 1);
});

test("footer reset requires confirmation, preserves saved data, and refreshes the form", async () => {
  const savedData = {
    [SETTINGS.panelStates]: { "Actor.hero": { currentView: "inventory" } },
    [SETTINGS.windowGeometry]: { width: 900, left: 20 }
  };
  const { current, menus, writes } = installSettings({
    values: {
      ...savedData,
      [SETTINGS.showSearch]: false,
      [SETTINGS.pinWindow]: true
    }
  });
  const SettingsApp = menus.get("configure").type;
  const app = await new SettingsApp().render();
  const searchValue = () =>
    app.context.groups
      .flatMap(group => group.settings)
      .find(setting => setting.key === SETTINGS.showSearch)?.value;
  assert.equal(searchValue(), false);
  let prevented = 0;
  const event = { preventDefault: () => prevented++ };
  const cancelled = await SettingsApp.DEFAULT_OPTIONS.actions.reset.call(
    app,
    event
  );
  assert.equal(cancelled.rendered, true);
  assert.deepEqual(writes, []);
  cancelled.constructor.DEFAULT_OPTIONS.actions.cancel.call(cancelled);
  assert.equal(cancelled.rendered, false);
  assert.equal(current.get(SETTINGS.pinWindow), true);
  assert.deepEqual(writes, []);

  const confirmation = await SettingsApp.DEFAULT_OPTIONS.actions.reset.call(
    app,
    event
  );
  await confirmation.constructor.DEFAULT_OPTIONS.form.handler.call(
    confirmation
  );
  assert.equal(prevented, 2);
  assert.equal(app.renderCount, 2);
  assert.equal(searchValue(), true);
  assert.equal(current.get(SETTINGS.pinWindow), false);
  assert.deepEqual(writes, [
    [SETTINGS.pinWindow, false],
    [SETTINGS.showSearch, true]
  ]);
  for (const [key, value] of Object.entries(savedData))
    assert.equal(current.get(key), value);
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

test("additional settings menu is moved below regular options", () => {
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

  assert.deepEqual(appended, ["configure"]);
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

test("additional menu labels follow the module translator", async () => {
  const previousGame = globalThis.game;
  const menuRows = Object.fromEntries(
    ["configure"].map(key => {
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
        const key = ["configure"].find(name =>
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
  } finally {
    globalThis.game = previousGame;
  }
});
