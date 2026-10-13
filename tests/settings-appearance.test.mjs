import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { AppearanceSettingsController } from "../scripts/settings-appearance.js";
import {
  settingsBackup,
  settingsBackupEntries,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
import { getSetting, resetSettings } from "../scripts/settings-access.js";
import { resolveHudPalette } from "../scripts/hud/theme.js";
restoreGlobalsAfterEach();

async function fixture(values = {}) {
  const f = installSettings({ values: { language: "auto", ...values } });
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
  app.element.innerHTML = template(await app._prepareContext());
  document.body.append(app.element);
  const controller = new AppearanceSettingsController(app.element);
  const input = key => app.element.querySelector(`[name="${key}"]`);
  const set = (key, value) => {
    if (input(key).type === "checkbox") input(key).checked = value;
    else if (input(key).tagName === "SELECT") {
      for (const option of input(key).querySelectorAll("option")) {
        option.removeAttribute("selected");
        if (option.value === value) option.setAttribute("selected", "");
      }
    } else input(key).value = value;
    controller.update();
  };
  return { ...f, app, App, controller, input, set };
}

test("Custom inherits applied explicit accent once, retains draft colors and copies only on request", async () => {
  const f = await fixture({
    theme: "graphite",
    accentPreset: "custom",
    accentColor: "#118899"
  });
  f.set("theme", "custom");
  assert.equal(f.input("customThemeAccent").value, "#118899");
  assert.equal(f.input("customThemeBackground").value, "#303944");
  assert.equal(f.input("customThemeText").value, "#f1f5fa");
  f.set("customThemeBackground", "#102030");
  f.set("theme", "pearl");
  f.set("theme", "custom");
  assert.equal(f.input("customThemeBackground").value, "#102030");
  assert.equal(getSetting("theme"), "graphite");
  f.controller.seed("pearl");
  f.controller.update();
  assert.equal(f.input("customThemeBackground").value, "#edf2f7");
  assert.equal(f.input("customThemeAccent").value, "#118899");
  f.controller.dispose();
});

test("Appearance cancellation preserves settings; saving and backup/restore retain Custom and hidden animation modes", async () => {
  const f = await fixture({ theme: "light" });
  f.set("theme", "custom");
  f.set("customThemeText", "#112233");
  f.controller.dispose();
  assert.equal(getSetting("theme"), "light");
  assert.equal(getSetting("customThemeInitialized"), false);
  f.set("hpAnimation", "bar");
  f.set("turnAnimation", "soft");
  f.set("showVisualEffects", false);
  for (const row of f.app.element.querySelectorAll(
    '[data-animation-detail="true"]'
  )) {
    assert.equal(row.hidden, false);
    assert.equal(row.querySelector("select").disabled, true);
  }
  const submitted = Object.fromEntries(
    [...f.app.element.querySelectorAll("[name]")]
      .filter(node =>
        [
          "theme",
          "customThemeAccent",
          "customThemeBackground",
          "customThemeText",
          "showVisualEffects"
        ].includes(node.name)
      )
      .map(node => [
        node.name,
        node.type === "checkbox" ? node.checked : node.value
      ])
  );
  await f.App.DEFAULT_OPTIONS.form.handler.call(f.app, null, f.app.element, {
    object: submitted
  });
  assert.equal(getSetting("customThemeInitialized"), true);
  assert.equal(getSetting("hpAnimation"), "bar");
  assert.equal(getSetting("showVisualEffects"), false);
  const backup = JSON.stringify(await settingsBackup());
  await resetSettings();
  assert.equal(getSetting("customThemeInitialized"), false);
  await restoreSettingsBackup(backup);
  assert.equal(getSetting("customThemeText"), "#112233");
  assert.equal(getSetting("turnAnimation"), "soft");
  f.controller.dispose();
});

test("Appearance backup validates colors/choices and accepts legacy partial backups without deleting new values", async () => {
  installSettings({
    values: { customThemeBackground: "#123456" }
  });
  for (const [key, value] of [
    ["customThemeAccent", "red"],
    ["customThemeText", "#fff"],
    ["customThemeBackground", "#gggggg"],
    ["hpAnimation", "soft"]
  ])
    assert.throws(
      () =>
        settingsBackupEntries(
          JSON.stringify({
            module: "adventurer-hud",
            format: 1,
            settings: { [key]: value }
          })
        ),
      /backup-invalid/
    );
  await restoreSettingsBackup(
    JSON.stringify({
      module: "adventurer-hud",
      format: 1,
      settings: { theme: "modern", accentPreset: "rose" }
    })
  );
  assert.equal(getSetting("theme"), "dark");
  assert.equal(getSetting("customThemeBackground"), "#123456");
});

test("Follow Foundry inheritance uses the visible light palette and demo modes keep native HP thresholds", async () => {
  const f = await fixture({ theme: "auto" });
  f.app.element.classList.add("theme-light");
  f.controller.update();
  f.set("theme", "custom");
  assert.equal(
    f.input("customThemeBackground").value,
    resolveHudPalette({ theme: "light" }).background
  );
  f.set("hpAnimation", "bar");
  f.controller.demonstrate("damage");
  assert.equal(
    f.app.element.querySelector("[data-preview-hp]").textContent,
    "20 / 40"
  );
  assert.equal(
    f.controller.preview.classList.contains("ws-hp-feedback"),
    false
  );
  assert.ok(
    f.app.element
      .querySelector("[data-preview-hp-bar]")
      .style.background.includes("hp-danger")
  );
  f.set("showVisualEffects", false);
  f.controller.demonstrate("turn");
  assert.equal(f.controller.preview.dataset.currentTurn, "true");
  assert.equal(f.controller.timer, null);
  f.set("showVisualEffects", true);
  assert.equal(f.input("hpAnimation").value, "bar");
  for (const row of f.app.element.querySelectorAll(
    '[data-animation-detail="true"]'
  ))
    assert.equal(row.hidden, false);
  f.controller.dispose();
});
