import assert from "node:assert/strict";
import test from "node:test";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import {
  getSetting,
  setSetting,
  resetSettings
} from "../scripts/settings-access.js";
import {
  settingsBackup,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
restoreGlobalsAfterEach();

test("SC world compatibility is GM-only, independent of the GM HUD and preserved by personal reset/restore", async () => {
  const f = installSettings({ isGM: true, values: { gmEnabled: false } });
  const App = f.menus.get("gm").type;
  const app = new App();
  const submit = Object.getPrototypeOf(App).DEFAULT_OPTIONS.form.handler;
  const context = await app._prepareContext();
  const field = context.groups
    .flatMap(group => group.settings)
    .find(field => field.key === "scInitiative");
  assert.equal(field.disabled, false);
  assert.equal(f.registrations.get("scInitiative").scope, "world");
  assert.equal(f.registrations.get("scInitiative").config, false);
  assert.equal(f.menus.get("gm").restricted, true);
  await submit.call(app, null, null, {
    object: { scInitiative: true }
  });
  assert.equal(getSetting("scInitiative"), true);
  const backup = await settingsBackup();
  assert.equal(Object.hasOwn(backup.settings, "scInitiative"), false);
  await restoreSettingsBackup(
    JSON.stringify({
      ...backup,
      settings: { ...backup.settings, scInitiative: false }
    })
  );
  await resetSettings({ gmOnly: true });
  assert.equal(getSetting("scInitiative"), true);
  game.user.isGM = false;
  const writes = f.writes.length;
  await setSetting("scInitiative", false);
  await submit.call(app, null, null, {
    object: { scInitiative: false }
  });
  await resetSettings();
  assert.equal(getSetting("scInitiative"), true);
  assert.ok(f.writes.slice(writes).every(([key]) => key !== "scInitiative"));
});
