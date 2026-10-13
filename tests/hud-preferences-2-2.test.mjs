import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hiddenEffectChoices } from "../scripts/settings-effects.js";
import { settingsBackupEntries } from "../scripts/settings-backup.js";
import {
  getConfigureSettingGroups,
  cardDetailFields,
  CARD_DETAIL_FIELDS
} from "../scripts/settings-schema.js";
import { booleanSettingsEntries } from "../scripts/settings-form.js";
import { createCombatItemCardRenderer } from "../scripts/hud/items/combat-item-card.js";
import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createCombatSpellRenderer } from "../scripts/hud/items/combat-spells.js";
import { createViewActions } from "../scripts/hud/view-actions.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { escapeHTML, fragment, itemCollection } from "./helpers/rendering.mjs";
import { createHudState } from "../scripts/hud/state.js";
import {
  panelStateSnapshot,
  panelStateForActor
} from "../scripts/hud/panel-state.js";

restoreGlobalsAfterEach();

test("AC, initiative and speed can each hide without suppressing the other controls", () => {
  installSettings();
  for (let mask = 0; mask < 8; mask++) {
    const visibility = {
      armorClass: Boolean(mask & 1),
      initiative: Boolean(mask & 2),
      speed: Boolean(mask & 4)
    };
    const render = createCombatRenderer({
      actor: { isOwner: true },
      adapter: { combatStats: () => ({ ac: 16, speed: 30, speedUnits: "ft" }) },
      escapeHTML,
      formatMod: String,
      hudState: {},
      t: key => key,
      visibility,
      getCombatState: () => ({ combatant: { initiative: 15 } })
    });
    const html = render.playerStatsHTML();
    const root = fragment(html);
    assert.equal(
      Boolean(root.querySelector(".ws-armor-class")),
      visibility.armorClass
    );
    assert.equal(
      Boolean(root.querySelector(".ws-header-initiative")),
      visibility.initiative
    );
    assert.equal(html.includes("Combat.Speed"), visibility.speed);
    if (!mask) assert.equal(html, "");
  }
});

test("class names and levels are independent, with total level when names are hidden", () => {
  const actor = {
    items: [
      { type: "class", name: "Monk", system: { levels: 6 } },
      { type: "class", name: "Warlock", system: { levels: 2 } }
    ],
    system: { details: { level: 8 } }
  };
  const formatLevel = level => `Level ${level}`;
  assert.equal(
    dnd5eAdapter.classSummary(actor, { formatLevel }),
    "Monk 6 / Warlock 2"
  );
  assert.equal(
    dnd5eAdapter.classSummary(actor, { formatLevel, showLevels: false }),
    "Monk / Warlock"
  );
  assert.equal(
    dnd5eAdapter.classSummary(actor, { formatLevel, showClasses: false }),
    "Level 8"
  );
  assert.equal(
    dnd5eAdapter.classSummary(actor, {
      formatLevel,
      showClasses: false,
      showLevels: false
    }),
    ""
  );
});

test("effect catalogue loads once on first entry; searches and Clear preserve independent selections", async () => {
  const f = installSettings({ values: { hiddenEffects: ["effect:Missing"] } });
  const { document } = installDom();
  globalThis.CONFIG = {
    statusEffects: [
      { id: "poisoned", name: "Poisoned" },
      { id: "flying", name: "Flying" }
    ],
    DND5E: { conditionTypes: { poisoned: {} } }
  };
  let scans = 0;
  Object.defineProperty(game, "actors", {
    get() {
      return {
        contents: [
          {
            isOwner: true,
            get effects() {
              scans++;
              return [{ id: "magical", name: "Magical", statuses: new Set() }];
            }
          }
        ]
      };
    }
  });
  assert.ok(
    hiddenEffectChoices({
      selected: ["effect:Missing"],
      t: k => k,
      includeActors: false
    }).some(c => c.value === "effect:Missing")
  );
  const App = f.menus.get("configure").type;
  const app = new App();
  const engine = Handlebars.create();
  engine.registerHelper("checked", v => (v ? "checked" : ""));
  app.element = document.createElement("form");
  app.element.innerHTML = engine.compile(
    await readFile(
      new URL("../templates/settings.hbs", import.meta.url),
      "utf8"
    )
  )(await app._prepareContext());
  app._onRender({}, {});
  const mode = app.element.querySelector('[name="statusFilter"]');
  let modeValue = mode.value;
  Object.defineProperty(mode, "value", {
    get: () => modeValue,
    set: value => {
      modeValue = value;
    }
  });
  assert.equal(scans, 0);
  app.selectSettingsTab("effects");
  await app.effectsController.load();
  const afterFirstEntry = scans;
  assert.ok(afterFirstEntry > 0);
  app.selectSettingsTab("appearance");
  app.selectSettingsTab("effects");
  await app.effectsController.load();
  assert.equal(scans, afterFirstEntry);
  const magical = app.element.querySelector('[value="effect:Magical"]');
  magical.checked = true;
  magical.dispatchEvent(
    new document.defaultView.Event("change", { bubbles: true })
  );
  const search = app.element.querySelector("[data-effect-search]");
  search.value = "Flying";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true })
  );
  assert.equal(magical.closest("label").hidden, true);
  await App.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
    object: { statusFilter: "custom" }
  });
  assert.deepEqual(f.current.get("hiddenEffects"), [
    "effect:Magical",
    "effect:Missing"
  ]);
  App.DEFAULT_OPTIONS.actions.showalleffects.call(app);
  assert.equal(app.effectsController.selected.size, 0);
  search.value = "";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true })
  );
  assert.equal(magical.checked, false);
  app._onClose({});
});

test("legacy column thresholds remain manual, and backup restores explicit auto without discarding width", () => {
  const f = installSettings({ values: { twoColumnWidth: 820 } });
  assert.equal(f.current.get("twoColumnMode"), "manual");
  const backup = settings =>
    JSON.stringify({ module: "adventurer-hud", format: 1, settings });
  assert.ok(
    settingsBackupEntries(backup({ twoColumnWidth: 720 })).some(
      ([k, v]) => k === "twoColumnMode" && v === "manual"
    )
  );
  assert.ok(
    settingsBackupEntries(backup({ twoColumnWidth: 450 })).some(
      ([k, v]) => k === "twoColumnMode" && v === "auto"
    )
  );
  assert.ok(
    settingsBackupEntries(
      backup({ twoColumnWidth: 820, twoColumnMode: "auto" })
    ).some(([k, v]) => k === "twoColumnMode" && v === "auto")
  );
});

test("card presets cover independent details, reject invalid fields and render damage beside type", () => {
  installSettings();
  installDom();
  assert.deepEqual(cardDetailFields("off", []), []);
  assert.deepEqual(cardDetailFields("all", []), CARD_DETAIL_FIELDS);
  assert.deepEqual(cardDetailFields("custom", ["components"]), ["components"]);
  assert.throws(() =>
    booleanSettingsEntries(getConfigureSettingGroups(false), {
      cardDetailFields: ["unknown"]
    })
  );
  const visibility = { cardDetailFields: cardDetailFields("all", []) };
  const render = createCombatItemCardRenderer({
    actor: { isOwner: true },
    adapter: {
      itemRole: () => "spell",
      itemActivities: () => [],
      itemActivation: () => "action",
      hasItemProperty: () => false,
      itemAttackBonus: () => "+5",
      itemSaveDc: () => 15,
      itemDamageFormula: () => "3d8",
      itemDamageTypes: () => ["Fire"],
      spellComponents: () => [{ label: "Vocal", abbreviation: "V" }],
      itemUsesData: () => null,
      itemRangeData: () => ({ value: 60, units: "ft" }),
      rangeUnitLabel: () => "ft"
    },
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: k => k,
    visibility
  });
  const item = { id: "spell", type: "spell", name: "Spell" };
  const full = fragment(render(item));
  assert.match(
    full.querySelector(".ws-damage-types").parentElement.textContent,
    /3d8.*Fire/s
  );
  assert.equal(full.querySelector(".ws-spell-components").textContent, "V");
  visibility.cardDetailFields = [];
  assert.equal(fragment(render(item)).querySelector(".ws-spell-meta"), null);
  visibility.cardDetailFields = cardDetailFields("basic", []);
  const basic = fragment(render(item));
  assert.ok(basic.querySelector(".ws-activation-badge"));
  assert.equal(basic.querySelector(".ws-spell-components"), null);
  assert.ok(!basic.textContent.includes("60"));
});

test("unprepared spells exclude cantrips and always prepared spells; class limits use native prepared values", () => {
  installSettings();
  installDom();
  globalThis.CONFIG = {
    DND5E: { spellPreparationStates: { always: { value: 2 } } }
  };
  const spell = (id, level, prepared) => ({
    id,
    type: "spell",
    system: { level, prepared, canPrepare: true }
  });
  const items = [
    spell("known", 1, 1),
    spell("missing", 1, 0),
    spell("always", 1, 2),
    spell("cantrip", 0, 0)
  ];
  const state = createHudState();
  const actions = createViewActions({
    hudState: state,
    currentMode: () => "regular",
    refreshHud() {}
  });
  actions.spellfilter(null, { dataset: { prepared: "unprepared" } });
  const groups = createCombatSpellRenderer({
    actor: {},
    adapter: { ...dnd5eAdapter, spellSlots: () => [] },
    combatItemButton: i => `<button>${i.id}</button>`,
    hudState: state,
    t: k => k,
    tf: k => k,
    escapeHTML
  });
  assert.equal(
    fragment(groups(items)).querySelector("button").textContent,
    "missing"
  );
  assert.equal(fragment(groups(items)).querySelectorAll("button").length, 1);
  assert.equal(
    panelStateForActor(
      { "Actor.test": panelStateSnapshot(state) },
      "Actor.test"
    ).unpreparedSpellsOnly,
    true
  );
  const classes = [
    {
      id: "class",
      type: "class",
      name: "Wizard",
      system: {
        spellcasting: {
          preparation: { formula: "@scale.limit", max: 3, value: 1 }
        }
      }
    },
    {
      id: "subclass",
      type: "subclass",
      name: "Subclass",
      system: { spellcasting: { preparation: { value: 1, max: 0 } } }
    }
  ];
  assert.deepEqual(
    dnd5eAdapter.spellPreparationLimits({
      items: itemCollection([...items, ...classes])
    }),
    [{ name: "Wizard", value: 1, max: 3 }]
  );
});

test("changelog restricts history to the installed major and matches current version exactly", async () => {
  const { changelogEntries } = await import("../scripts/settings-changelog.js");
  const entries = changelogEntries(
    "# Notes\n## 3.0.0\nFuture\n## 2.2.0\n- Current <script>\n## 2.1.0\nOlder\n## 2.0.0\nInitial\n## 1.4.1\nLegacy",
    "2.2.0"
  );
  assert.deepEqual(
    entries.map(e => [e.version, e.current]),
    [
      ["2.2.0", true],
      ["2.1.0", false],
      ["2.0.0", false]
    ]
  );
  assert.deepEqual(entries[0].lines.filter(Boolean), ["- Current <script>"]);
  assert.deepEqual(changelogEntries("## 1.0.0\nLegacy", "2.2.0"), []);
});
