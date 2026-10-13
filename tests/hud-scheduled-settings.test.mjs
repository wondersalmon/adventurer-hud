import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { createHudState } from "../scripts/hud/state.js";
import { createCombatSpellRenderer } from "../scripts/hud/items/combat-spells.js";
import { createViewActions } from "../scripts/hud/view-actions.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import {
  panelStateSnapshot,
  panelStateForActor
} from "../scripts/hud/panel-state.js";
import { itemCollection, escapeHTML, fragment } from "./helpers/rendering.mjs";
restoreGlobalsAfterEach();

test("native spell source composes with preparation and survives saved state", () => {
  installSettings();
  const items = [
    {
      id: "a",
      name: "Fire",
      type: "spell",
      system: { classIdentifier: "wizard", level: 1 },
      prepared: true
    },
    {
      id: "b",
      name: "Cold",
      type: "spell",
      system: { classIdentifier: "wizard", level: 1 },
      prepared: false
    },
    {
      id: "c",
      name: "Eldritch",
      type: "spell",
      system: { classIdentifier: "warlock", level: 0 },
      prepared: true
    },
    {
      id: "d",
      name: "Race spell",
      type: "spell",
      system: { sourceItem: "race:elf", level: 1 },
      prepared: true
    }
  ];
  const actor = {
    items: itemCollection(items),
    classes: { wizard: { name: "Wizard" }, warlock: { name: "Warlock" } },
    identifiedItems: new Map([["race:elf", { first: () => ({ name: "Elf" }) }]])
  };
  assert.deepEqual(
    dnd5eAdapter.spellSources(actor).map(s => [s.source, s.name]),
    [
      ["class:wizard", "Wizard"],
      ["class:warlock", "Warlock"],
      ["item:race:elf", "Elf"]
    ]
  );
  const state = createHudState({ spellSource: "class:wizard" }),
    adapter = {
      ...dnd5eAdapter,
      isPreparedSpell: i => i.prepared,
      spellPreparation: () => ({ canPrepare: true }),
      spellSlots: () => [],
      spellLevel: i => i.system.level
    };
  const visibility = { spellPreparation: true };
  const render = createCombatSpellRenderer({
    visibility,
    actor,
    adapter,
    hudState: state,
    combatItemButton: i => "<button>" + i.name + "</button>",
    t: k => k,
    tf: k => k,
    escapeHTML
  });
  const names = () =>
    [...fragment(render(items)).querySelectorAll("button")].map(
      n => n.textContent
    );
  assert.deepEqual(names(), ["Fire"]);
  state.unpreparedSpellsOnly = true;
  state.preparedSpellsOnly = false;
  assert.deepEqual(names(), ["Cold"]);
  state.unpreparedSpellsOnly = false;
  assert.deepEqual(names(), ["Fire", "Cold"]);
  assert.equal(
    panelStateForActor({ "Actor.a": panelStateSnapshot(state) }, "Actor.a")
      .spellSource,
    "class:wizard"
  );
  visibility.spellPreparation = false;
  assert.equal(names().length, 4);
  assert.equal(state.spellSource, "class:wizard");
  visibility.spellPreparation = true;
  assert.deepEqual(names(), ["Fire", "Cold"]);
  state.spellSource = "class:removed";
  assert.equal(names().length, 4);
  let saves = 0,
    refreshes = 0;
  const actions = createViewActions({
    hudState: state,
    currentMode: () => "combat",
    savePanelState: () => saves++,
    refreshHud: () => refreshes++
  });
  actions.spellsourcefilter(null, { dataset: { source: "class:warlock" } });
  assert.equal(state.spellSource, "class:warlock");
  actions.spellsourcefilter(null, { dataset: { source: "class:warlock" } });
  assert.equal(state.spellSource, null);
  state.spellSource = "class:wizard";
  actions.spellsourcefilter(null, { dataset: { source: "" } });
  assert.equal(state.spellSource, null);
  assert.equal(saves, 3);
  assert.equal(refreshes, 3);
});

test("changelog notice is first-opening per user and returns for a changed version", async () => {
  const f = installSettings();
  const { document } = installDom();
  game.modules = new Map([["adventurer-hud", { version: "2.2.0" }]]);
  foundry.utils.getRoute = p => p;
  globalThis.fetch = async p => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(
          new URL(
            "../lang/" + (p.includes("ru.json") ? "ru" : "en") + ".json",
            import.meta.url
          ),
          "utf8"
        )
      )
  });
  const App = f.menus.get("configure").type;
  const app = new App(),
    context = await app._prepareContext();
  assert.equal(context.changelogNew, true);
  const h = Handlebars.create();
  h.registerHelper("checked", v => (v ? "checked" : ""));
  app.element = document.createElement("form");
  app.element.innerHTML = h.compile(
    await readFile(
      new URL("../templates/settings.hbs", import.meta.url),
      "utf8"
    )
  )(context);
  app._onRender({}, {});
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.current.get("changelogSeenVersion"), "");
  assert.equal((await new App()._prepareContext()).changelogNew, true);
  app.selectSettingsTab("changelog");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(
    app.element
      .querySelector("[data-settings-tab=changelog]")
      .classList.contains("ws-settings-changelog-new"),
    false
  );
  assert.equal(f.current.get("changelogSeenVersion"), "2.2.0");
  app._onClose({});
  assert.equal((await new App()._prepareContext()).changelogNew, false);
  game.modules.get("adventurer-hud").version = "2.3.0";
  assert.equal((await new App()._prepareContext()).changelogNew, true);
  assert.equal(f.registrations.get("changelogSeenVersion").scope, "user");
});

test("invalid spell source is rejected by backup validation while valid state survives", async () => {
  installSettings();
  const { settingsBackupEntries } =
    await import("../scripts/settings-backup.js");
  const backup = spellSource =>
    JSON.stringify({
      module: "adventurer-hud",
      format: 1,
      settings: { panelStates: { "Actor.a": { spellSource } } }
    });
  assert.throws(
    () => settingsBackupEntries(backup("x".repeat(257))),
    /backup-invalid/
  );
  assert.throws(
    () => settingsBackupEntries(backup("class:\u0000bad")),
    /backup-invalid/
  );
  assert.equal(
    settingsBackupEntries(backup("class:wizard"))[0][1]["Actor.a"].spellSource,
    "class:wizard"
  );
});

test("spell filter visibility hides both rows and preserves native preparation counts when shown", async () => {
  const { createAbilityComponents } =
    await import("../scripts/hud/ability-components.js");
  const visibility = { spellPreparation: true };
  const hudState = createHudState();
  let collections = 0;
  const controls = createAbilityComponents({
    actor: {},
    visibility,
    hudState,
    escapeHTML,
    t: key => key,
    adapter: {
      spellSources: () => [{ source: "class:monk", name: "Monk" }],
      spellPreparationLimits: () => {
        collections++;
        return [{ source: "class:monk", name: "Monk", value: 3, max: 2 }];
      }
    }
  });
  const root = fragment(controls.spellFilterHTML());
  assert.equal(
    root.querySelector("details[data-spell-filters]").hasAttribute("open"),
    false
  );
  assert.match(root.querySelector("summary").textContent, /Combat.Prepared/);
  assert.equal(root.querySelectorAll(".ws-spell-filter button").length, 3);
  assert.equal(
    root.querySelector('[data-source="class:monk"] strong').textContent,
    "3/2"
  );
  assert.ok(
    root
      .querySelector('[data-source="class:monk"]')
      .classList.contains("ws-limit-exceeded")
  );
  visibility.spellPreparation = false;
  assert.equal(controls.spellFilterHTML(), "");
  assert.equal(collections, 1);
  visibility.spellPreparation = true;
  assert.match(controls.spellFilterHTML(), /3\/2/);
});
