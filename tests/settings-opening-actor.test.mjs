import assert from "node:assert/strict";
import test from "node:test";
import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import {
  SETTINGS,
  getConfigureSettingGroups,
  getSettingDefinitions
} from "../scripts/settings-schema.js";
import { booleanSettingsEntries } from "../scripts/settings-form.js";
import {
  settingsBackup,
  settingsBackupEntries,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
import { selectHudActor } from "../scripts/hud/actor-selection.js";
restoreGlobalsAfterEach();

const actors = () => [
  {
    id: "first",
    uuid: "Actor.first",
    name: "First",
    type: "character",
    isOwner: true
  },
  {
    id: "second",
    uuid: "Actor.second",
    name: "Second",
    type: "character",
    isOwner: true
  }
];
async function configure(values = {}) {
  const f = installSettings({
    values: {
      hudActorSelection: "specific",
      hudPreferredActor: "Actor.first",
      ...values
    }
  });
  installDom();
  game.actors = actors();
  foundry.utils.getRoute = path => path;
  globalThis.fetch = async path => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(
          new URL(
            `../lang/${String(path).endsWith("ru.json") ? "ru" : "en"}.json`,
            import.meta.url
          ),
          "utf8"
        )
      )
  });
  const App = f.menus.get("configure").type;
  const app = new App();
  app.element = document.createElement("form");
  const template = Handlebars.compile(
    await readFile(
      new URL("../templates/settings.hbs", import.meta.url),
      "utf8"
    )
  );
  Handlebars.registerHelper("checked", value => (value ? "checked" : ""));
  app.element.innerHTML = template(await app._prepareContext());
  const control = app.element.querySelector('[name="hudActorSelection"]');
  return { ...f, App, app, control };
}

test("opening character is one visible dropdown and a cancellable draft", async () => {
  const f = await configure();
  assert.equal(
    getSettingDefinitions()[SETTINGS.hudPreferredActor].placement,
    "internal"
  );
  assert.equal(
    Object.values(getConfigureSettingGroups(false))
      .flat()
      .includes(SETTINGS.hudPreferredActor),
    false
  );
  assert.equal(
    f.app.element.querySelectorAll('[name="hudActorSelection"]').length,
    1
  );
  assert.equal(f.app.element.querySelector('[name="hudPreferredActor"]'), null);
  assert.equal(f.control.value, "Actor.first");
  for (const option of f.control.querySelectorAll("option")) {
    if (option.value === "Actor.second") option.setAttribute("selected", "");
    else option.removeAttribute("selected");
  }
  assert.equal(f.current.get(SETTINGS.hudPreferredActor), "Actor.first");
  await f.App.DEFAULT_OPTIONS.actions.cancel.call(f.app);
  assert.equal(f.current.get(SETTINGS.hudActorSelection), "specific");
  assert.equal(f.current.get(SETTINGS.hudPreferredActor), "Actor.first");
  assert.deepEqual(f.writes, []);
});

test("saving one Actor UUID stores the original two settings and selects the current owned native Actor", async () => {
  const f = await configure({ hudActorSelection: "prompt" });
  for (const option of f.control.querySelectorAll("option")) {
    if (option.value === "Actor.second") option.setAttribute("selected", "");
    else option.removeAttribute("selected");
  }
  await f.App.DEFAULT_OPTIONS.form.handler.call(f.app, null, f.app.element, {
    object: { hudActorSelection: f.control.value }
  });
  assert.equal(f.current.get(SETTINGS.hudActorSelection), "specific");
  assert.equal(f.current.get(SETTINGS.hudPreferredActor), "Actor.second");
  globalThis.canvas = { tokens: { controlled: [] } };
  const selected = await selectHudActor({
    adapter: { isActorSupported: actor => actor?.type === "character" },
    t: key => key,
    tf: key => key
  });
  assert.equal(selected.actor, game.actors[1]);
  assert.equal(selected.token, null);
  for (const mode of ["prompt", "last"]) {
    await f.App.DEFAULT_OPTIONS.form.handler.call(f.app, null, f.app.element, {
      object: { hudActorSelection: mode }
    });
    assert.equal(f.current.get(SETTINGS.hudActorSelection), mode);
    assert.equal(f.current.get(SETTINGS.hudPreferredActor), "Actor.second");
  }
});

test("single opening selector parsing retains storage shape and rejects malformed submitted choices", () => {
  const groups = { behavior: [SETTINGS.hudActorSelection] };
  assert.deepEqual(
    booleanSettingsEntries(groups, { hudActorSelection: "Actor.first" }),
    [
      ["hudActorSelection", "specific"],
      ["hudPreferredActor", "Actor.first"]
    ]
  );
  for (const mode of ["prompt", "last"])
    assert.deepEqual(
      booleanSettingsEntries(groups, { hudActorSelection: mode }),
      [["hudActorSelection", mode]]
    );
  for (const value of ["Actor.", "wrong", 42, null])
    assert.throws(() =>
      booleanSettingsEntries(groups, { hudActorSelection: value })
    );
});

test("old opening policy backups round-trip without converting or losing preferred characters", async () => {
  const f = installSettings({
    values: {
      hudActorSelection: "specific",
      hudPreferredActor: "Actor.missing"
    }
  });
  const backup = await settingsBackup();
  assert.equal(backup.settings.hudActorSelection, "specific");
  assert.equal(backup.settings.hudPreferredActor, "Actor.missing");
  const legacy = JSON.stringify({
    module: "adventurer-hud",
    format: 1,
    settings: {
      hudActorSelection: "specific",
      hudPreferredActor: "Actor.first"
    }
  });
  assert.deepEqual(settingsBackupEntries(legacy), [
    ["hudActorSelection", "specific"],
    ["hudPreferredActor", "Actor.first"]
  ]);
  await restoreSettingsBackup(legacy);
  assert.equal(f.current.get(SETTINGS.hudActorSelection), "specific");
  assert.equal(f.current.get(SETTINGS.hudPreferredActor), "Actor.first");
});

test("legacy specific mode without a preferred UUID remains selected and can be saved unchanged", async () => {
  const f = await configure({
    hudActorSelection: "specific",
    hudPreferredActor: ""
  });
  assert.equal(f.control.value, "specific");
  assert.equal(
    f.control
      .querySelector('option[value="specific"]')
      .hasAttribute("selected"),
    true
  );
  await f.App.DEFAULT_OPTIONS.form.handler.call(f.app, null, f.app.element, {
    object: { hudActorSelection: "specific" }
  });
  assert.equal(f.current.get(SETTINGS.hudActorSelection), "specific");
  assert.equal(f.current.get(SETTINGS.hudPreferredActor), "");
  assert.deepEqual(
    f.writes.filter(([key]) =>
      [SETTINGS.hudActorSelection, SETTINGS.hudPreferredActor].includes(key)
    ),
    []
  );
});
