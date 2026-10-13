import { createTroubleshootingController } from "../scripts/settings-applications.js";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import {
  booleanSettingsEntries,
  prepareSettingsGroups
} from "../scripts/settings-form.js";
import {
  getGmSettingGroups,
  getConfigureSettingGroups,
  getSettingDefinitions,
  getSettingsViewDefinitions,
  HUD_ACCENT_PRESETS
} from "../scripts/settings-schema.js";
import {
  getSetting,
  setSetting,
  saveChangedSettings
} from "../scripts/settings-access.js";
import {
  settingsBackup,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
restoreGlobalsAfterEach();

test("embedded restore refreshes Configure before Save and retains its active tab", async () => {
  const f = installSettings({
    values: { theme: "dark", accentPreset: "teal", language: "auto" }
  });
  const { document } = installDom();
  const template = Handlebars.compile(
    await readFile(
      new URL("../templates/settings.hbs", import.meta.url),
      "utf8"
    )
  );
  Handlebars.registerHelper("checked", value => (value ? "checked" : ""));
  const App = f.menus.get("configure").type;
  const app = new App();
  app.element = document.createElement("form");
  document.body.append(app.element);
  foundry.applications.api.ApplicationV2.prototype.render = async function () {
    this.rendered = true;
    this.element.innerHTML = template(await this._prepareContext());
    this._onRender({}, {});
    return this;
  };
  foundry.applications.handlebars = {
    renderTemplate: async (_path, context) =>
      `<textarea data-diagnostic-comment>${context.diagnosticComment}</textarea>`
  };
  foundry.applications.api.DialogV2 = {
    prompt: async () =>
      JSON.stringify({
        module: "adventurer-hud",
        format: 1,
        settings: { theme: "light", accentPreset: "blue" }
      })
  };
  await app.render();
  app.selectSettingsTab("troubleshooting");
  await waitFor(() => app.integrityApp.viewElement.querySelector("textarea"));
  app.integrityApp.viewElement.querySelector("textarea").value =
    "Keep this diagnostic draft";
  await app.integrityApp.constructor.DEFAULT_OPTIONS.actions.restoresettings.call(
    app.integrityApp
  );
  assert.equal(app.activeSettingsTab, "troubleshooting");
  assert.equal(
    app.integrityApp.diagnosticComment,
    "Keep this diagnostic draft"
  );
  const value = name => app.element.querySelector(`[name="${name}"]`).value;
  assert.equal(value("theme"), "light");
  assert.equal(value("accentPreset"), "blue");
  await App.DEFAULT_OPTIONS.form.handler.call(app, null, app.element, {
    object: {
      theme: value("theme"),
      accentPreset: value("accentPreset"),
      statusFilter: value("statusFilter")
    }
  });
  assert.equal(getSetting("theme"), "light");
  assert.equal(getSetting("accentPreset"), "blue");
  app._onClose({});
});

test("large effect presets save other preferences and round-trip backups without computed exclusions", async () => {
  const f = installSettings();
  const { document } = installDom();
  const App = f.menus.get("configure").type;
  const app = new App();
  app.element = document.createElement("form");
  app.element.innerHTML =
    "<div data-hidden-effects-list>" +
    Array.from(
      { length: 201 },
      (_, i) =>
        `<input type="checkbox" name="hiddenEffects" value="effect:Custom${i}" checked>`
    ).join("") +
    "</div>";
  // linkedom has no checked property/pseudo-selector support; expose the checked controls as a real submitted list.
  const list = app.element.querySelector("[data-hidden-effects-list]");
  list.querySelectorAll = selector => {
    assert.equal(selector, "input:checked");
    return app.element.querySelectorAll("input");
  };
  for (const mode of ["conditions", "all"]) {
    await App.DEFAULT_OPTIONS.form.handler.call(app, null, app.element, {
      object: { statusFilter: mode, accentPreset: "blue" }
    });
    assert.equal(getSetting("statusFilter"), mode);
    assert.equal(getSetting("accentPreset"), "blue");
    assert.deepEqual(getSetting("hiddenEffects"), []);
    const backup = await settingsBackup();
    await restoreSettingsBackup(JSON.stringify(backup));
    assert.deepEqual((await settingsBackup()).settings.hiddenEffects, []);
  }
  const writes = f.writes.length;
  await assert.rejects(
    App.DEFAULT_OPTIONS.form.handler.call(app, null, app.element, {
      object: { statusFilter: "custom", accentPreset: "rose" }
    }),
    /Invalid hidden effects/
  );
  assert.equal(f.writes.length, writes);
  app.element.querySelector("input").remove();
  await App.DEFAULT_OPTIONS.form.handler.call(app, null, app.element, {
    object: { statusFilter: "custom", accentPreset: "rose" }
  });
  assert.equal(getSetting("hiddenEffects").length, 200);
  assert.equal(getSetting("accentPreset"), "rose");
  const backup = await settingsBackup();
  await restoreSettingsBackup(JSON.stringify(backup));
  assert.equal((await settingsBackup()).settings.hiddenEffects.length, 200);
});

test("cancelled repair does not reload the outer settings draft", async () => {
  installSettings({ values: { language: "auto" } });
  const controller = createTroubleshootingController();
  let reloads = 0;
  controller.settingsChanged = async () => reloads++;
  controller.report = {
    issues: [
      { key: "theme", code: "SavedData", detail: "theme", repairable: true }
    ]
  };
  foundry.utils = { escapeHTML: value => value };
  foundry.applications.api.DialogV2 = { confirm: async () => false };
  await controller.render();
  await controller.constructor.DEFAULT_OPTIONS.actions.repair.call(controller);
  assert.equal(reloads, 0);
  controller.close();
});

test("Configure translates its title before the native frame renders in either language", async () => {
  for (const language of ["en", "ru"]) {
    const f = installSettings({ values: { language: "auto" } });
    const strings = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    game.i18n.lang = language;
    game.i18n.localize = key => strings[key] ?? key;
    const base = foundry.applications.api.ApplicationV2.prototype;
    const nativeRender = base.render;
    let frameTitle;
    base.render = function (...args) {
      frameTitle = this.title;
      return nativeRender.apply(this, args);
    };
    await new (f.menus.get("configure").type)().render({ force: true });
    assert.equal(frameTitle, strings["ADVENTURER_HUD.Settings.Advanced.Name"]);
  }
});

test("removed saved themes use Foundry Dark without losing the accent or rejecting backups", async () => {
  for (const theme of ["modern", "immersive"]) {
    const f = installSettings({
      values: {
        theme,
        accentPreset: "rose",
        accentColor: "#336699",
        language: "auto"
      }
    });
    assert.deepEqual(Object.keys(getSettingDefinitions().theme.choices), [
      "auto",
      "light",
      "dark",
      "graphite",
      "pearl",
      "custom"
    ]);
    assert.equal(getSetting("theme"), "dark");
    const context = await new (f.menus.get(
      "configure"
    ).type)()._prepareContext();
    assert.equal(context.theme, "dark");
    const backup = await settingsBackup();
    assert.equal(backup.settings.theme, "dark");
    await restoreSettingsBackup(
      JSON.stringify({
        ...backup,
        settings: { theme, accentPreset: "rose", accentColor: "#336699" }
      })
    );
    assert.equal(getSetting("theme"), "dark");
    assert.equal(getSetting("accentPreset"), "rose");
    assert.equal(getSetting("accentColor"), "#336699");
  }
});

test("player Configure, storage writes and backups exclude all GM preferences", async () => {
  const f = installSettings({ values: { language: "auto" } });
  const keys = Object.keys(getSettingDefinitions()).filter(key =>
    key.startsWith("gm")
  );
  for (const key of keys)
    assert.equal(getSettingDefinitions()[key].gmOnly, true, key);
  keys.push("gmWindowGeometry");
  const before = new Map(keys.map(key => [key, getSetting(key)]));
  const App = f.menus.get("configure").type;
  const app = new App();
  assert.ok(
    !(await app._prepareContext()).groups.some(group => group.id === "gm")
  );
  await App.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
    object: Object.fromEntries(keys.map(key => [key, false]))
  });
  await saveChangedSettings(keys.map(key => [key, false]));
  for (const key of keys) await setSetting(key, false);
  const backup = await settingsBackup();
  for (const key of keys) {
    assert.equal(Object.hasOwn(backup.settings, key), false, key);
    assert.deepEqual(getSetting(key), before.get(key), key);
  }
  await restoreSettingsBackup(
    JSON.stringify({
      ...backup,
      settings: { ...backup.settings, ...Object.fromEntries(before) }
    })
  );
  assert.ok(f.writes.every(([key]) => !keys.includes(key)));
});

test("HUD settings opens Configure directly and reuses an open form without losing drafts", async () => {
  const f = installSettings();
  game.settings.sheet = {
    render() {
      assert.fail("HUD settings must open Configure directly");
    }
  };
  const { openSettings } = await import("../scripts/settings-navigation.js");
  const app = await openSettings();
  assert.ok(app instanceof f.menus.get("configure").type);
  assert.equal(app.renderCount, 1);
  app.draft = "unsaved preferences";
  let raised = 0;
  app.bringToFront = () => raised++;
  foundry.applications.instances = new Map([["settings", app]]);
  assert.equal(await openSettings(), app);
  assert.equal(app.renderCount, 1);
  assert.equal(app.draft, "unsaved preferences");
  assert.equal(raised, 1);
});

test("embedded Troubleshooting ignores a delayed render after its Configure host is closed", async () => {
  installSettings({ values: { language: "auto" } });
  const { document } = installDom();
  const host = document.createElement("div");
  document.body.append(host);
  const controller = createTroubleshootingController();
  let finishTemplate;
  foundry.applications.handlebars = {
    renderTemplate: async () =>
      new Promise(resolve => {
        finishTemplate = resolve;
      })
  };
  const attached = controller.attach(host);
  await waitFor(() => Boolean(finishTemplate));
  controller.detach();
  host.remove();
  finishTemplate('<button data-action="record">Record</button>');
  await attached;
  assert.equal(host.innerHTML, "");
  assert.equal(controller.unwatchDiagnostics, null);
  await controller.render({ force: true });
  assert.equal(controller.rendered, undefined);
});

test("effect filter presets and legacy individual exclusions produce consistent checklists", () => {
  const choices = [
    { value: "status:poisoned", standard: true },
    { value: "status:concentrating", standard: true },
    { value: "status:flying", standard: false },
    { value: "effect:Magical", standard: false }
  ];
  for (const [mode, selected, expectedMode, expectedHidden] of [
    ["all", [], "all", []],
    ["conditions", [], "conditions", ["status:flying", "effect:Magical"]],
    ["custom", ["status:poisoned"], "custom", ["status:poisoned"]],
    ["all", ["status:flying"], "custom", ["status:flying"]],
    [
      "conditions",
      ["status:poisoned"],
      "custom",
      ["status:poisoned", "status:flying", "effect:Magical"]
    ]
  ]) {
    const fields = prepareSettingsGroups({
      groups: { quickAccess: ["statusFilter", "hiddenEffects"] },
      readValue: key => (key === "statusFilter" ? mode : selected),
      hiddenEffectChoices: choices,
      t: key => key
    })[0].settings;
    assert.equal(fields[0].value, expectedMode);
    assert.deepEqual(
      fields[1].choices
        .filter(choice => choice.selected)
        .map(choice => choice.value),
      expectedHidden
    );
    assert.deepEqual(selected, fields[1].value);
  }
  assert.deepEqual(
    booleanSettingsEntries(
      { quickAccess: ["statusFilter"] },
      { statusFilter: "custom" }
    ),
    [["statusFilter", "custom"]]
  );
});

test("one personal accent preset updates both themes in the existing HUD and preserves the custom color", async () => {
  const f = await hudFixture({ values: { theme: "light" } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    const content = app.element.querySelector(".ws-shell");
    assert.equal(app.element.style.getPropertyValue("--ws-accent-light"), "");
    for (const [preset, accents] of Object.entries(HUD_ACCENT_PRESETS)) {
      await setSetting("accentPreset", preset);
      for (const theme of ["light", "dark"])
        assert.equal(
          app.element.style.getPropertyValue(`--ws-accent-${theme}`),
          preset === "standard" ? "" : accents[theme]
        );
    }
    await setSetting("accentColor", "#79551c");
    await setSetting("accentPreset", "custom");
    for (const theme of ["light", "dark"])
      assert.equal(
        app.element.style.getPropertyValue(`--ws-accent-${theme}`),
        "#79551c"
      );
    await setSetting("accentColor", "#336699");
    for (const theme of ["light", "dark"])
      assert.equal(
        app.element.style.getPropertyValue(`--ws-accent-${theme}`),
        "#336699"
      );
    assert.equal(__adventurerHud.app, app);
    assert.equal(app.element.querySelector(".ws-shell"), content);
    assert.equal(f.registrations.get("accentPreset").scope, "user");
    assert.equal(f.registrations.get("accentColor").scope, "user");
    for (const theme of ["auto", "dark", "light"]) {
      await setSetting("theme", theme);
      assert.equal(app.element.classList.contains("ws-theme-modern"), false);
      assert.equal(app.element.classList.contains("ws-theme-immersive"), false);
      assert.equal(
        app.element.classList.contains("ws-theme-dark"),
        theme === "dark"
      );
      assert.equal(__adventurerHud.app, app);
      assert.equal(app.element.querySelector(".ws-shell"), content);
    }
    const backup = await settingsBackup();
    assert.equal(backup.settings.accentPreset, "custom");
    assert.equal(backup.settings.accentColor, "#336699");
    await assert.rejects(
      restoreSettingsBackup(
        JSON.stringify({
          ...backup,
          settings: { ...backup.settings, accentColor: "red; background:black" }
        })
      ),
      /backup-invalid/
    );
    const SettingsApp = f.menus.get("configure").type;
    const settingsApp = new SettingsApp();
    await assert.rejects(
      SettingsApp.DEFAULT_OPTIONS.form.handler.call(settingsApp, null, null, {
        object: { accentColor: "invalid" }
      }),
      /Invalid accent color/
    );
    await assert.rejects(
      SettingsApp.DEFAULT_OPTIONS.form.handler.call(settingsApp, null, null, {
        object: { accentPreset: "unknown" }
      }),
      /Invalid accent preset/
    );
    await assert.rejects(
      restoreSettingsBackup(
        JSON.stringify({
          ...backup,
          settings: { ...backup.settings, accentPreset: "unknown" }
        })
      ),
      /backup-invalid/
    );
    await SettingsApp.DEFAULT_OPTIONS.form.handler.call(
      settingsApp,
      null,
      null,
      { object: { accentPreset: "standard" } }
    );
    assert.equal(app.element.style.getPropertyValue("--ws-accent-light"), "");
    assert.equal(app.element.style.getPropertyValue("--ws-accent-dark"), "");
    assert.equal(getSetting("accentColor"), "#336699");
    await setSetting("accentPreset", "custom");
    assert.equal(
      app.element.style.getPropertyValue("--ws-accent-dark"),
      "#336699"
    );
  } finally {
    await app.close();
  }
});

test("the personal condition filter hides custom HUD icons, preserves native effects and restores all icons", async () => {
  const f = await hudFixture({ values: { playerFooter: true } });
  CONFIG.DND5E.conditionTypes = { poisoned: "Poisoned" };
  CONFIG.statusEffects = [
    { id: "poisoned", name: "Poisoned" },
    { id: "thinking", name: "Thinking" },
    { id: "flying", name: "Flying", img: "icons/svg/wing.svg" },
    { id: "hovering", name: "Hovering" },
    { id: "concentrating", name: "Concentration" },
    { id: "bloodied", name: "Bloodied" }
  ];
  f.actor.statuses = new Set([
    "poisoned",
    "thinking",
    "flying",
    "hovering",
    "concentrating",
    "bloodied"
  ]);
  const effects = [
    {
      id: "thinking-effect",
      name: "Thinking",
      statuses: new Set(["thinking"])
    },
    {
      id: "magic-effect",
      name: "Magical",
      img: "icons/svg/aura.svg",
      statuses: new Set(),
      uuid: `${f.actor.uuid}.ActiveEffect.magic`
    }
  ];
  f.actor.effects = effects;
  const statusIds = [...f.actor.statuses];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    assert.equal(getSetting("statusFilter"), "all");
    assert.equal(f.registrations.get("statusFilter").scope, "user");
    assert.equal(
      app.element.querySelectorAll(".ws-player-footer .ws-status").length,
      7
    );
    await setSetting("statusFilter", "conditions");
    await waitFor(
      () => app.element.querySelectorAll(".ws-status").length === 3
    );
    for (const id of ["poisoned", "concentrating", "bloodied"])
      assert.ok(app.element.querySelector(`[data-status-id="${id}"]`));
    assert.equal(
      app.element.querySelector('[data-status-id="thinking"]'),
      null
    );
    assert.equal(f.actor.effects, effects);
    assert.deepEqual([...f.actor.statuses], statusIds);
    await setSetting("statusFilter", "all");
    await setSetting("hiddenEffects", ["status:thinking", "effect:Magical"]);
    await waitFor(
      () => app.element.querySelectorAll(".ws-status").length === 5
    );
    assert.ok(app.element.querySelector('[data-status-id="flying"]'));
    assert.ok(app.element.querySelector('[data-status-id="hovering"]'));
    assert.equal(app.element.querySelector('[aria-label="Magical"]'), null);
    const SettingsApp = f.menus.get("configure").type;
    const settingsApp = new SettingsApp();
    const context = await settingsApp._prepareContext();
    const selector = context.groups
      .flatMap(group => group.settings)
      .find(field => field.key === "hiddenEffects");
    assert.ok(
      selector.choices.some(
        choice =>
          choice.value === "effect:Magical" && choice.selected && !choice.img
      )
    );
    assert.ok(
      selector.choices.some(
        choice =>
          choice.value === "status:flying" &&
          !choice.selected &&
          choice.img === "icons/svg/wing.svg"
      )
    );
    const backup = await settingsBackup();
    assert.deepEqual(backup.settings.hiddenEffects, [
      "status:thinking",
      "effect:Magical"
    ]);
    await assert.rejects(
      restoreSettingsBackup(
        JSON.stringify({
          ...backup,
          settings: { ...backup.settings, hiddenEffects: ["invalid"] }
        })
      ),
      /backup-invalid/
    );
    await SettingsApp.DEFAULT_OPTIONS.form.handler.call(
      settingsApp,
      null,
      null,
      { object: { hiddenEffects: [] } }
    );
    await waitFor(
      () => app.element.querySelectorAll(".ws-status").length === 7
    );
    assert.equal(f.actor.effects, effects);
    assert.deepEqual([...f.actor.statuses], statusIds);
    assert.equal(__adventurerHud.app, app);
    assert.ok(app.element.querySelector('[aria-label="Magical"]'));
  } finally {
    await app.close();
  }
});

test("GM combined controls preserve saved preferences and search is a positive independent switch", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      gmFilterActions: false,
      gmAutoAdvance: true,
      gmFollowTurn: true,
      gmHideSearch: false,
      showSearch: false
    }
  });
  const App = f.menus.get("configure").type;
  const app = new App();
  const context = await app._prepareContext();
  const fields = context.groups.flatMap(group => group.settings);
  assert.equal(
    fields.find(field => field.key === "gmActionDisplay").value,
    "all"
  );
  assert.equal(
    fields.find(field => field.key === "gmSelectionMode").value,
    "turn"
  );
  assert.equal(fields.find(field => field.key === "gmHideSearch").value, true);
  await f.menus
    .get("configure")
    .type.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
      object: {
        gmActionDisplay: "items",
        gmSelectionMode: "manual",
        gmHideSearch: false
      }
    });
  assert.equal(f.current.get("gmFilterActions"), true);
  assert.equal(f.current.get("gmActionTypesOnly"), false);
  assert.equal(f.current.get("gmFollowTurn"), false);
  assert.equal(f.current.get("gmAutoAdvance"), false);
  assert.equal(f.current.get("gmHideSearch"), true);
  assert.equal(f.current.get("showSearch"), false);
  assert.throws(() =>
    booleanSettingsEntries(getGmSettingGroups(), { gmActionDisplay: "invalid" })
  );
});

test("troubleshooting moves debug control and confirms geometry reset", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      pinWindow: true,
      gmPinWindow: true,
      windowGeometry: { width: 900 },
      gmWindowGeometry: { width: 1200 }
    }
  });
  const advanced = await new (f.menus.get(
    "configure"
  ).type)()._prepareContext();
  assert.equal(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "debugWindowSize"),
    true
  );
  const companionMenu = f.menus.get("configure");
  assert.equal(companionMenu.restricted, false);
  assert.equal(
    advanced.groups.some(group =>
      group.settings.some(field => field.key === "showCompanions")
    ),
    true
  );
  const companionContext = await new companionMenu.type()._prepareContext();
  const companions = companionContext.groups.find(group =>
    group.settings.some(field => field.key === "showCompanions")
  );
  assert.deepEqual(
    companions.settings.map(field => field.key),
    [
      "showCompanions",
      "showCompanionEffects",
      "companionAutoFocus",
      "companionCameraPan",
      "familiarVision2024",
      "companionVisionAnyTurn",
      "companionVisionPan"
    ]
  );
  assert.equal(f.registrations.get("playerFooter").default, true);
  assert.equal(f.registrations.get("playerFooter").config, false);
  assert.ok(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "playerFooter")
  );
  assert.equal(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "playerColumnRatio"),
    false
  );
  f.current.set("showCompanions", false);
  const disabled = await new companionMenu.type()._prepareContext();
  for (const key of [
    "showCompanionEffects",
    "companionVisionPan",
    "companionAutoFocus"
  ])
    assert.equal(
      disabled.groups
        .flatMap(group => group.settings)
        .find(field => field.key === key).disabled,
      true
    );
  f.current.set("showCompanions", true);
  assert.equal(f.registrations.get("debugWindowSize").default, false);
  const App = createTroubleshootingController().constructor;
  const app = new App();
  assert.equal((await app._prepareContext()).debugWindowSize, undefined);
  f.current.set("debugWindowSize", true);
  app.rendered = true;
  await App.DEFAULT_OPTIONS.actions.close.call(app);
  assert.equal(f.current.get("debugWindowSize"), true);
  assert.equal(app.rendered, false);
  assert.equal(f.registrations.get("twoColumnWidth").config, false);
  assert.equal(f.registrations.get("twoColumnWidth").type, Number);
  assert.deepEqual(f.registrations.get("twoColumnWidth").range, {
    min: 450,
    max: 1200,
    step: 10
  });
  assert.equal(f.registrations.get("separateModeSizes").config, false);
  foundry.applications.api.DialogV2 = { confirm: async () => false };
  await App.DEFAULT_OPTIONS.actions.resetpositions.call(app);
  assert.equal(f.current.get("pinWindow"), true);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await App.DEFAULT_OPTIONS.actions.resetpositions.call(app);
  assert.deepEqual(f.current.get("windowGeometry"), {});
  assert.deepEqual(f.current.get("gmWindowGeometry"), {});
  assert.equal(f.current.get("pinWindow"), false);
  assert.equal(f.current.get("gmPinWindow"), false);
  game.user.isGM = false;
  assert.equal(App.DEFAULT_OPTIONS.actions.resetgm.call(app), undefined);
});

test("GM opens exact player combatant in the same panel and never removes its defeated token", async () => {
  const f = await hudFixture({
    isGM: true,
    values: { gmEnabled: true, showSearch: false, gmHideSearch: false }
  });
  canvas.scene = { id: "scene" };
  const player = {
    ...f.actor,
    uuid: "Scene.scene.Token.hero.Actor.hero",
    type: "character"
  };
  const monster = {
    ...f.actor,
    uuid: "Scene.scene.Token.npc.Actor.npc",
    type: "npc"
  };
  const ability = {
    id: "action",
    name: "Player action",
    type: "feat",
    system: {
      activities: [
        { id: "use", activation: { type: "action" }, type: "utility", use() {} }
      ]
    }
  };
  player.items = itemCollection([ability]);
  const npc = {
    id: "npc",
    sceneId: "scene",
    tokenId: "npc",
    actor: monster,
    token: {
      id: "npc",
      uuid: "Scene.scene.Token.npc",
      parent: canvas.scene,
      actor: monster
    },
    players: []
  };
  let deletions = 0;
  const pc = {
    id: "hero",
    sceneId: "scene",
    tokenId: "hero",
    actor: player,
    defeated: true,
    token: {
      id: "hero",
      uuid: "Scene.scene.Token.hero",
      parent: canvas.scene,
      actor: player,
      delete: async () => deletions++
    },
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    combatant: npc,
    turns: [npc, pc],
    combatants: itemCollection([npc, pc])
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  const app = __adventurerHud.app;
  assert.ok(
    app.element.querySelector(
      '[data-action="gmselect"][data-combatant-id="hero"]'
    )
  );
  await app.hudActions.gmselect(null, { dataset: { combatantId: "hero" } });
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, player);
  assert.match(
    app.element.querySelector(".ws-gm-action-column").textContent,
    /Player action/
  );
  assert.ok(app.element.querySelector('[data-action="searchitems"]'));
  assert.equal(app.element.querySelector('[data-action="gmremove"]'), null);
  await app.hudActions.gmremove();
  assert.equal(deletions, 0);
  f.current.set("gmAutoAdvance", true);
  f.current.set("gmFollowTurn", false);
  await app.hudActions.gmfollow();
  assert.equal(f.current.get("gmAutoAdvance"), false);
  assert.equal(f.current.get("gmFollowTurn"), true);
  assert.equal(__adventurerHud.actor, monster);
  await app.close();
});

test("players save companion settings through Configure without changing other settings", async () => {
  const f = installSettings({ values: { showSearch: false, gmEnabled: true } });
  const app = new (f.menus.get("configure").type)();
  const context = await app._prepareContext();
  assert.equal(
    context.groups.find(group => group.id === "companions").settings.length,
    7
  );
  for (const key of [
    "showCompanionHealth",
    "showCompanionPortraits",
    "showCompanionInitiative"
  ])
    assert.equal(f.registrations.has(key), false);
  await f.menus
    .get("configure")
    .type.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
      object: {
        showCompanions: true,
        showCompanionEffects: false,
        companionVisionAnyTurn: true,
        companionAutoFocus: false,
        companionVisionPan: false,
        gmEnabled: false
      }
    });
  assert.equal(f.current.get("companionVisionPan"), false);
  assert.equal(f.current.get("companionVisionAnyTurn"), true);
  assert.equal(f.current.get("companionAutoFocus"), false);
  assert.equal(f.current.get("showCompanionEffects"), false);
  assert.equal(f.current.get("showSearch"), false);
  assert.equal(f.current.get("gmEnabled"), true);
});

test("Configure covers every editable preference once and keeps world and GM controls out of player settings", () => {
  const definitions = getSettingDefinitions();
  const views = getSettingsViewDefinitions();
  const keys = Object.values(getConfigureSettingGroups(true)).flat();
  assert.equal(keys.length, new Set(keys).size);
  for (const [key, definition] of Object.entries(definitions)) {
    if (definition.placement !== "internal") assert.ok(keys.includes(key), key);
    else assert.ok(!keys.includes(key), key);
  }
  for (const key of Object.values(getConfigureSettingGroups(false)).flat())
    assert.equal(Boolean(views[key].gmOnly), false, key);
  const aliases = booleanSettingsEntries(getConfigureSettingGroups(true), {
    gmCardDetails: "all",
    gmActionDisplay: "items",
    gmSelectionMode: "turn"
  });
  for (const key of [
    "gmCardDetails",
    "gmFilterActions",
    "gmActionTypesOnly",
    "gmFollowTurn",
    "gmAutoAdvance"
  ])
    assert.ok(
      aliases.some(([field]) => field === key),
      key
    );
});
