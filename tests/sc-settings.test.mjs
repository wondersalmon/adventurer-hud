import assert from "node:assert/strict";
import test from "node:test";
import { SC, installSc } from "./helpers/venaerys.mjs";
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

test("SC integration requires an installed module, explains missing/inactive states, and is hidden from players", async () => {
  const f = installSettings({ isGM: true });
  const App = f.menus.get("configure").type;
  const app = new App();
  const field = async () =>
    (await app._prepareContext()).groups
      .flatMap(group => group.settings)
      .find(row => row.key === "scInitiative");
  assert.equal(getSetting("scInitiative"), false);
  assert.equal((await field()).disabled, true);
  assert.match((await field()).hint, /scInitiative.Missing/);
  await setSetting("scInitiative", true);
  assert.equal(getSetting("scInitiative"), false);
  installSc();
  game.modules.get(SC).active = false;
  assert.equal((await field()).disabled, false);
  assert.match((await field()).hint, /scInitiative.Inactive/);
  await setSetting("scInitiative", true);
  assert.equal(getSetting("scInitiative"), true);
  game.modules.delete(SC);
  await App.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
    object: { scInitiative: false }
  });
  assert.equal(getSetting("scInitiative"), true);
  game.user.isGM = false;
  assert.equal(await field(), undefined);
});

test("SC world compatibility is GM-only, independent of the GM HUD and preserved by personal reset/restore", async () => {
  const f = installSettings({ isGM: true, values: { gmEnabled: false } });
  installSc();
  const App = f.menus.get("configure").type;
  const app = new App();
  const submit = App.DEFAULT_OPTIONS.form.handler;
  const context = await app._prepareContext();
  const field = context.groups
    .flatMap(group => group.settings)
    .find(field => field.key === "scInitiative");
  assert.equal(field.disabled, false);
  assert.equal(f.registrations.get("scInitiative").scope, "world");
  assert.equal(f.registrations.get("scInitiative").config, false);
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
