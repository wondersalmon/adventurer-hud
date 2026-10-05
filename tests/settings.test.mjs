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

for (const immediate of [false, true]) {
  test(`window geometry writes preserve both modes with ${immediate ? "immediate" : "deferred"} saving`, async () => {
    const { saveWindowGeometry, flushWindowGeometry, getWindowGeometry } =
      await import("../scripts/settings.js");
    const { writes } = installSettings();
    const player = { left: 10, top: 20, width: 300, height: 500 };
    const gm = { left: 30, top: 40, width: 1000, height: 400 };
    saveWindowGeometry({ ...player, width: 280 });
    saveWindowGeometry(gm, { gmActive: true });
    await saveWindowGeometry(player, { immediate });
    await flushWindowGeometry();
    assert.deepEqual(getWindowGeometry(), player);
    assert.deepEqual(getWindowGeometry(true), gm);
    assert.equal(
      writes.filter(([key]) => key === SETTINGS.windowGeometry).length,
      1
    );
    assert.equal(
      writes.filter(([key]) => key === SETTINGS.gmWindowGeometry).length,
      1
    );
    const count = writes.length;
    await flushWindowGeometry();
    assert.equal(writes.length, count);
  });
}

test("separate mode sizes merge serialized writes and snapshot dimensions before deferred saving", async t => {
  const { saveWindowGeometry, flushWindowGeometry, getWindowGeometry } =
    await import("../scripts/window-geometry.js");
  const { current } = installSettings({
    values: {
      separateModeSizes: true,
      windowModeSizes: { future: { width: 500, height: 500 } }
    }
  });
  const originalSet = game.settings.set;
  let release;
  let started;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const waiting = new Promise(resolve => {
    started = resolve;
  });
  t.mock.method(game.settings, "set", async (module, key, value) => {
    if (key === SETTINGS.windowModeSizes) {
      started();
      await gate;
    }
    return originalSet(module, key, value);
  });
  const regular = { left: 10, top: 20, width: 320, height: 450 };
  const first = saveWindowGeometry(regular, {
    mode: "regular",
    immediate: true
  });
  regular.width = 999;
  await waiting;
  const second = saveWindowGeometry(
    { left: 50, top: 60, width: 800, height: 600 },
    { mode: "combat", immediate: true }
  );
  assert.equal(getWindowGeometry(false, "regular").width, 320);
  assert.equal(getWindowGeometry(false, "combat").width, 800);
  release();
  await Promise.all([first, second]);
  await flushWindowGeometry();
  assert.deepEqual(current.get(SETTINGS.windowModeSizes), {
    future: { width: 500, height: 500 },
    regular: { width: 320, height: 450 },
    combat: { width: 800, height: 600 }
  });
  assert.equal(getWindowGeometry(false, "regular").left, 50);
});

test("disabled mode sizing retains shared geometry and saved profiles", async () => {
  const { saveWindowGeometry, flushWindowGeometry, getWindowGeometry } =
    await import("../scripts/window-geometry.js");
  const profiles = {
    regular: { width: 320, height: 450 },
    combat: { width: 800, height: 600 }
  };
  const { current } = installSettings({
    values: { windowModeSizes: profiles }
  });
  const shared = { left: 20, top: 30, width: 500, height: 550 };
  saveWindowGeometry(shared, { mode: "combat" });
  await flushWindowGeometry();
  assert.deepEqual(getWindowGeometry(false, "regular"), shared);
  assert.deepEqual(current.get(SETTINGS.windowModeSizes), profiles);
});

test("main and additional settings use task-based groups", async () => {
  const { registrations, menus } = installSettings();

  for (const key of [SETTINGS.gmHideSearch, SETTINGS.gmActionTypesOnly]) {
    assert.equal(registrations.get(key).default, false);
    assert.equal(registrations.get(key).config, false);
    assert.equal(SETTING_DEFINITIONS[key].gmOnly, true);
    assert.equal(
      SETTING_DEFINITIONS[key].placement,
      key === SETTINGS.gmActionTypesOnly ? "internal" : "gm"
    );
    assert.equal(settingRefreshStrategy(key), "content");
  }

  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.default, false);
  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.config, false);
  assert.equal(registrations.get(SETTINGS.fontSize)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.config, false);
  assert.equal(registrations.get(SETTINGS.autoUpdateActor)?.default, true);
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.config, true);
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.default, false);
  assert.equal(registrations.get(SETTINGS.autoOpenHud)?.scope, "user");
  assert.equal(registrations.get(SETTINGS.panelStates)?.config, false);
  assert.equal(registrations.get(SETTINGS.panelStates)?.scope, "user");
  assert.equal(registrations.get(SETTINGS.pinWindow)?.config, false);
  assert.equal(registrations.get(SETTINGS.pinWindow)?.default, false);
  assert.equal(registrations.get(SETTINGS.gmPinWindow)?.default, false);
  assert.equal(registrations.get(SETTINGS.closeOnEscape)?.default, false);
  assert.equal(
    SETTING_DEFINITIONS[SETTINGS.closeOnEscape].placement,
    "advanced"
  );
  assert.equal(settingRefreshStrategy(SETTINGS.closeOnEscape), "runtime");
  assert.equal(registrations.has("lockWindowSize"), false);
  assert.equal(registrations.has("gmLockWindowSize"), false);
  assert.equal(registrations.has("closeAfterRoll"), false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.config, false);
  assert.equal(registrations.get(SETTINGS.showTokenControl)?.default, true);
  assert.equal(registrations.get(SETTINGS.showVisualEffects)?.default, true);
  assert.equal(registrations.get(SETTINGS.showVisualEffects)?.config, false);
  assert.deepEqual(
    Object.keys(registrations.get(SETTINGS.fontSize)?.choices ?? {}),
    ["small", "medium", "large", "extraLarge"]
  );
  assert.equal(registrations.get(SETTINGS.fontSize)?.default, "large");
  assert.equal(registrations.get(SETTINGS.language)?.default, "en");
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
    "advanced"
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
    "internal"
  );
  const context = await new (menus.get("configure").type)()._prepareContext();
  assert.deepEqual(
    [...registrations]
      .filter(([, definition]) => definition.config)
      .map(([key]) => key),
    [
      SETTINGS.language,
      SETTINGS.theme,
      SETTINGS.fontSize,
      SETTINGS.slidePanel,
      SETTINGS.openPlayerOnCombat,
      SETTINGS.autoOpenHud
    ]
  );
  const visibleKeys = context.groups.flatMap(group =>
    group.settings.map(setting => setting.key)
  );
  for (const key of [
    SETTINGS.slidePanel,
    SETTINGS.openPlayerOnCombat,
    SETTINGS.autoOpenHud
  ])
    assert.equal(visibleKeys.includes(key), false);
  assert.equal(registrations.get(SETTINGS.slidePanel)?.default, true);
  assert.equal(visibleKeys.includes(SETTINGS.pinWindow), false);
  assert.equal(visibleKeys.includes(SETTINGS.showModeNavigation), false);
  assert.equal(visibleKeys.includes(SETTINGS.showShortcuts), true);
  assert.equal(registrations.get(SETTINGS.showShortcuts)?.default, true);
  assert.equal(settingRefreshStrategy(SETTINGS.showShortcuts), "content");
  assert.equal(new Set(visibleKeys).size, visibleKeys.length);
  assert.deepEqual(
    context.groups.map(group => group.label),
    [
      "ADVENTURER_HUD.Settings.Groups.behavior",
      "ADVENTURER_HUD.Settings.Groups.windowLayout",
      "ADVENTURER_HUD.Settings.Groups.quickAccess",
      "ADVENTURER_HUD.Settings.Groups.itemUse",
      "ADVENTURER_HUD.Settings.Groups.interface"
    ]
  );
  for (const key of [
    SETTINGS.showSearch,
    SETTINGS.showFavorites,
    SETTINGS.showActivityPicker,
    SETTINGS.showCompanions,
    SETTINGS.showCompanionEffects
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
  values.showModeNavigation = true;
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

test("saving additional settings preserves mode buttons enabled from the header menu", async () => {
  const { current, menus, writes } = installSettings({
    values: { [SETTINGS.showModeNavigation]: true }
  });
  const context = await new (menus.get("configure").type)()._prepareContext();
  const submitted = Object.fromEntries(
    context.groups.flatMap(group =>
      group.settings.map(setting => [setting.key, setting.value])
    )
  );
  submitted[SETTINGS.showShortcuts] = false;
  await menus.get("configure").type.DEFAULT_OPTIONS.form.handler(null, null, {
    object: submitted
  });
  assert.equal(current.get(SETTINGS.showModeNavigation), true);
  assert.deepEqual(writes, [[SETTINGS.showShortcuts, false]]);
});

test("troubleshooting reset requires confirmation and preserves saved data", async () => {
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
  const cancelled = await menus
    .get("troubleshooting")
    .type.DEFAULT_OPTIONS.actions.resetsettings.call({});
  assert.equal(cancelled.rendered, true);
  assert.deepEqual(writes, []);
  cancelled.constructor.DEFAULT_OPTIONS.actions.cancel.call(cancelled);
  assert.equal(cancelled.rendered, false);
  assert.equal(current.get(SETTINGS.pinWindow), true);
  assert.deepEqual(writes, []);

  const confirmation = await menus
    .get("troubleshooting")
    .type.DEFAULT_OPTIONS.actions.resetsettings.call({});
  await confirmation.constructor.DEFAULT_OPTIONS.form.handler.call(
    confirmation
  );
  assert.equal(app.renderCount, 1);
  assert.equal(current.get(SETTINGS.showSearch), true);
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
