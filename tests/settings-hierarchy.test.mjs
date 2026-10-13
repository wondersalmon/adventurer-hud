import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

async function form(isGM = false, values = {}) {
  const f = installSettings({ isGM, values });
  const { document } = installDom();
  const engine = Handlebars.create();
  engine.registerHelper("checked", value => (value ? "checked" : ""));
  const template = engine.compile(
    await readFile(
      new URL("../templates/settings.hbs", import.meta.url),
      "utf8"
    )
  );
  const App = f.menus.get("configure").type;
  const app = new App();
  app.element = document.createElement("form");
  document.body.append(app.element);
  app.element.innerHTML = template(await app._prepareContext());
  // linkedom leaves the native checkbox property unset after HTML parsing.
  for (const input of app.element.querySelectorAll('input[type="checkbox"]'))
    input.checked = input.hasAttribute("checked");
  for (const select of app.element.querySelectorAll("select"))
    Object.defineProperty(select, "value", {
      configurable: true,
      get() {
        return (
          [...this.options].find(option => option.hasAttribute("selected"))
            ?.value ??
          this.options[0]?.value ??
          ""
        );
      },
      set(value) {
        for (const option of this.options)
          option.toggleAttribute("selected", option.value === value);
      }
    });
  app._onRender({}, {});
  return { f, app, root: app.element };
}

test("settings parents reveal their children, search selection opens the parent and GM cards stay isolated", async () => {
  for (const isGM of [false, true]) {
    const { app, root } = await form(isGM);
    const tab = id => root.querySelector(`[data-settings-tab="${id}"]`);
    for (const id of ["behavior", "companions", "windowLayout"])
      assert.equal(tab(id).hasAttribute("aria-expanded"), false);
    assert.equal(tab("effects").hidden, true);
    app.selectSettingsTab("quickAccess");
    assert.equal(app.activeSettingsTab, "panelSections");
    assert.equal(tab("effects").hidden, false);
    assert.equal(tab("cardDetails").hidden, false);
    app.selectSettingsTab("appearance");
    assert.equal(app.activeSettingsTab, "appearanceTheme");
    assert.equal(tab("effects").hidden, true);
    assert.equal(tab("appearanceAnimations").hidden, false);
    app.selectSettingsTab("appearanceAnimations");
    assert.equal(
      root
        .querySelector("[data-appearance-preview]")
        .closest("[data-settings-panel]").dataset.settingsPanel,
      "appearanceAnimations"
    );
    app.selectSettingsTab("cardDetails");
    assert.equal(tab("quickAccess").getAttribute("aria-expanded"), "true");
    assert.equal(tab("appearanceAnimations").hidden, true);
    assert.equal(Boolean(tab("gmCards")), isGM);
    if (isGM) {
      app.selectSettingsTab("gm");
      assert.equal(app.activeSettingsTab, "gmWindow");
      app.selectSettingsTab("gmCards");
      assert.equal(tab("gm").getAttribute("aria-expanded"), "true");
      assert.equal(
        root
          .querySelector('[name="gmCardDetails"]')
          .closest("[data-settings-panel]").dataset.settingsPanel,
        "gmCards"
      );
    }
    assert.equal(tab("feedback"), null);
    assert.ok(tab("changelog"));
    assert.ok(tab("troubleshooting"));
    app._onClose({});
  }
});

test("settings have no default dots or per-setting reset arrows", async () => {
  const { app, root } = await form(true);
  assert.equal(root.querySelector("[data-reset-setting]"), null);
  assert.equal(root.querySelector(".ws-setting-default-marker"), null);
  app._onClose({});
});

test("font-size input immediately updates both appearance samples after selecting Custom", async () => {
  const { app, root } = await form();
  const slider = root.querySelector('[name="fontSizePx"]');
  slider.value = "17";
  app.dependencyListener({ target: slider });
  assert.equal(root.querySelector('[name="fontSize"]').value, "custom");
  for (const selector of [
    "[data-theme-preview]",
    "[data-appearance-preview]"
  ]) {
    const sample = root.querySelector(selector);
    assert.equal(sample.classList.contains("ws-font-custom"), true, selector);
    assert.equal(
      sample.style.getPropertyValue("--ws-custom-type-scale"),
      "1.7",
      selector
    );
  }
  app._onClose({});
});

test("keyboard navigation focuses the selected child when a parent redirects", async () => {
  const { app, root } = await form();
  app.selectSettingsTab("windowLayout");
  let focused;
  for (const tab of root.querySelectorAll('[role="tab"]'))
    tab.focus = () => {
      focused = tab.dataset.settingsTab;
    };
  app.tabListener({
    type: "keydown",
    key: "ArrowDown",
    target: root.querySelector('[data-settings-tab="windowLayout"]'),
    preventDefault() {}
  });
  assert.equal(app.activeSettingsTab, "appearanceTheme");
  assert.equal(focused, "appearanceTheme");
  app.tabListener({
    type: "keydown",
    key: "ArrowUp",
    target: root.querySelector('[data-settings-tab="appearanceTheme"]'),
    preventDefault() {}
  });
  assert.equal(app.activeSettingsTab, "windowLayout");
  assert.equal(focused, "windowLayout");
  app._onClose({});
});

test("Apply commits a draft without closing; close offers stay, discard and save", async () => {
  const { app, root, f } = await form();
  const theme = root.querySelector('[name="theme"]');
  assert.equal(app.draftController.dirty, false);
  app.selectSettingsTab("appearance");
  assert.equal(app.draftController.dirty, false);
  theme.value = "dark";
  app.dependencyListener({ target: theme });
  assert.equal(
    root.querySelector("[data-settings-save-status]").dataset.state,
    "unsaved"
  );
  let closes = 0;
  const prototype = Object.getPrototypeOf(Object.getPrototypeOf(app));
  const previous = prototype.close;
  prototype.close = async () => {
    closes++;
    return app;
  };
  try {
    await app.saveDraft();
    assert.equal(f.current.get("theme"), "dark");
    assert.equal(app.draftController.dirty, false);
    assert.equal(closes, 0);
    theme.value = "light";
    app.dependencyListener({ target: theme });
    foundry.applications.api.DialogV2 = { wait: async () => "stay" };
    await app.close();
    assert.equal(closes, 0);
    assert.equal(f.current.get("theme"), "dark");
    foundry.applications.api.DialogV2.wait = async () => "save";
    await app.close();
    assert.equal(closes, 1);
    assert.equal(f.current.get("theme"), "light");
    theme.value = "dark";
    app.dependencyListener({ target: theme });
    foundry.applications.api.DialogV2.wait = async () => "discard";
    await app.close();
    assert.equal(closes, 2);
    assert.equal(f.current.get("theme"), "light");
  } finally {
    prototype.close = previous;
    app._onClose({});
  }
});

test("applying HUD language refreshes the open settings menu and retains its section", async t => {
  const { app, root, f } = await form(false, { language: "en" });
  foundry.utils.getRoute = route => route;
  t.mock.method(globalThis, "fetch", async route => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(
          new URL(`../lang/${route.split("/").at(-1)}`, import.meta.url),
          "utf8"
        )
      )
  }));
  app.selectSettingsTab("behavior");
  const section = app.activeSettingsTab;
  const language = root.querySelector('[name="language"]');
  language.value = "ru";
  app.dependencyListener({ target: language });
  await app.saveDraft();
  assert.equal(f.current.get("language"), "ru");
  assert.equal(app.settingsLanguage, "ru");
  assert.equal(app.context.closeLabel, "Закрыть");
  assert.equal(app.activeSettingsTab, section);
  assert.equal(app.rendered, true);
  assert.equal(app.draftController.dirty, false);
  app._onClose({});
});

test("failed saving retains the draft and changing a form during save cannot mark new values saved", async () => {
  const { app, root, f } = await form();
  const theme = root.querySelector('[name="theme"]');
  theme.value = "dark";
  app.dependencyListener({ target: theme });
  const set = game.settings.set;
  game.settings.set = async () => {
    throw new Error("save failed");
  };
  await assert.rejects(app.saveDraft(), /settings-save-failed/);
  assert.equal(app.draftController.dirty, true);
  assert.equal(app.saving, false);
  let release;
  game.settings.set = async (...args) => {
    await new Promise(resolve => {
      release = resolve;
    });
    return set(...args);
  };
  const saving = app.saveDraft();
  while (!release) await Promise.resolve();
  theme.value = "light";
  app.dependencyListener({ target: theme });
  release();
  await saving;
  assert.equal(f.current.get("theme"), "dark");
  assert.equal(app.draftController.dirty, true);
  game.settings.set = set;
  app._onClose({});
});

test("language belongs to Behavior and search retains one editable language control", async () => {
  const { app, root } = await form();
  const entry = app.searchController.entries.find(
    entry => entry.row?.dataset.settingKey === "language"
  );
  assert.ok(entry);
  assert.equal(entry.panel, "behavior");
  assert.equal(root.querySelectorAll('[name="fontSizePx"]').length, 1);
  assert.ok(root.querySelector("[data-font-size-number]"));
  assert.equal(
    root
      .querySelector('[name="showSpellPreparation"]')
      .closest("[data-settings-panel]").dataset.settingsPanel,
    "panelSections"
  );
  assert.equal(root.querySelector('[name="showFavoriteMode"]'), null);
  assert.equal(
    root.querySelectorAll('[name="showInventorySummary"]').length,
    1
  );
  assert.equal(
    root.querySelector('[name="showInventorySummary"]').checked,
    true
  );
  assert.equal(
    root
      .querySelector('[name="showInventorySummary"]')
      .closest("[data-settings-panel]").dataset.settingsPanel,
    "panelSections"
  );
  assert.equal(root.querySelectorAll('[name="language"]').length, 1);
  assert.equal(root.querySelector('.ws-settings-nav [name="language"]'), null);
  assert.equal(
    root.querySelector('[name="language"]').closest("[data-settings-panel]")
      .dataset.settingsPanel,
    "behavior"
  );
  assert.equal(
    root.querySelector("[data-settings-save-status]").dataset.state,
    "saved"
  );
  app._onClose({});
});
