import assert from "node:assert/strict";
import test from "node:test";

import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createCombatResourceController } from "../scripts/hud/combat-resources.js";
import { createHudComponents } from "../scripts/hud/components.js";
import { renderDeathSaveControl } from "../scripts/hud/death-save-control.js";
import { renderHealthBar } from "../scripts/hud/health-bar.js";
import { resolveHpChanges, resolveHpInput } from "../scripts/hud/hp-input.js";
import { hpChange } from "../scripts/hud/health-feedback.js";
import { createRegularRenderer } from "../scripts/hud/regular.js";

const escapeHTML = value =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

test("active-effect names are escaped before entering status attributes", () => {
  const originalConfig = globalThis.CONFIG;
  const originalGame = globalThis.game;
  globalThis.CONFIG = { statusEffects: [] };
  globalThis.game = {
    i18n: { localize: value => value }
  };

  try {
    const renderer = createCombatRenderer({
      actor: {
        effects: [
          {
            disabled: false,
            id: "effect-1",
            name: 'Marked "dangerous" <effect>',
            statuses: new Set(["custom"])
          }
        ],
        statuses: new Set(["custom"])
      },
      adapter: {},
      canRollActor: true,
      escapeHTML,
      hudState: {},
      t: key => key,
      tf: (_key, data) => `Remove ${data.condition}`,
      visibility: { conditions: true }
    });

    const html = renderer.combatStatuses();
    assert.match(
      html,
      /title="Remove Marked &quot;dangerous&quot; &lt;effect&gt;"/
    );
    assert.doesNotMatch(html, /title="Remove Marked "dangerous"/);
  } finally {
    globalThis.CONFIG = originalConfig;
    globalThis.game = originalGame;
  }
});

test("checks and saves share one collapsible block in both modes", () => {
  const hudState = {
    abilitiesExpanded: true,
    combatAbilitiesExpanded: false
  };
  const components = createHudComponents({
    abilities: [["str", "STR", "fa-hand-fist"]],
    actor: {},
    adapter: {
      abilityData: () => ({ mod: 2 }),
      abilityTotal: data => data.mod
    },
    canRollActor: true,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState,
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: key => key,
    visibility: { abilityChecks: true, savingThrows: true }
  });

  const regular = components.abilitiesSection();
  const combat = components.abilitiesSection("combat");
  assert.match(regular, /aria-expanded="true"/);
  assert.match(regular, /data-type="check"/);
  assert.match(regular, /data-type="save"/);
  assert.ok(
    regular.indexOf('data-type="save"') < regular.indexOf('data-type="check"')
  );
  assert.equal((regular.match(/ws-ability-card-title/g) ?? []).length, 1);
  assert.match(combat, /aria-expanded="false"/);
  assert.doesNotMatch(combat, /data-action="ability"/);
});

test("skill filter keeps proficiency and expertise, but excludes half proficiency", () => {
  const hudState = { proficientSkillsOnly: true };
  const components = createHudComponents({
    actor: {},
    adapter: {
      skillData: (_actor, id) => ({ total: id.length })
    },
    canRollActor: true,
    escapeHTML,
    formatMod: String,
    hudState,
    marker: () => ["", "", ""],
    skillProf: id => ({ half: 0.5, trained: 1, expert: 2 })[id],
    skills: [
      ["half", "Half", "fa-circle"],
      ["trained", "Trained", "fa-circle"],
      ["expert", "Expert", "fa-circle"]
    ],
    t: key => key
  });

  const filtered = components.skillsHTML();
  assert.doesNotMatch(filtered, /data-key="half"/);
  assert.match(filtered, /data-key="trained"/);
  assert.match(filtered, /data-key="expert"/);

  hudState.proficientSkillsOnly = false;
  assert.match(components.skillsHTML(), /data-key="half"/);
});

test("HP dialog uses its default button for Enter and edits both HP fields", async () => {
  const originalDocument = globalThis.document;
  const updates = [];
  let hp = { value: 10, max: 20, temp: 0 };
  let dialogOptions;
  globalThis.document = {
    createElement: () => ({
      innerHTML: ""
    })
  };
  try {
    const controller = createCombatResourceController({
      actor: {},
      adapter: {
        combatStats: () => ({ hp }),
        updateHp: (_actor, values) => {
          updates.push(values);
          hp = { ...hp, ...values };
        }
      },
      DialogV2: class {
        constructor(options) {
          dialogOptions = options;
        }
        render() {}
      },
      t: key => key,
      visibility: {}
    });
    controller.openHpDialog();
    assert.equal(dialogOptions.buttons[0].default, true);
    await dialogOptions.buttons[0].callback(null, {
      form: {
        elements: {
          namedItem: name => ({ value: name === "temp" ? "4" : "12" })
        }
      }
    });
    assert.deepEqual(updates, [{ value: 12, temp: 4 }]);
    await dialogOptions.buttons[0].callback(null, {
      form: {
        elements: {
          namedItem: name => ({ value: name === "temp" ? "" : "-3" })
        }
      }
    });
    assert.deepEqual(updates[1], { value: 12, temp: 1 });
  } finally {
    globalThis.document = originalDocument;
  }
});

test("HP input distinguishes absolute values from signed changes", () => {
  assert.equal(resolveHpInput("12", 10, 20), 12);
  assert.equal(resolveHpInput("+5", 10, 20), 15);
  assert.equal(resolveHpInput("-3", 10, 20), 7);
  assert.equal(resolveHpInput("+50", 10, 20), 20);
  assert.equal(resolveHpInput("-50", 10, 20), 0);
  assert.equal(resolveHpInput("+4", 0), 4);
  assert.equal(resolveHpInput("", 10, 20), 10);
  assert.equal(resolveHpInput("-2", 0), 0);
  assert.equal(resolveHpInput("+", 10, 20), null);
  assert.equal(resolveHpInput("1.5", 10, 20), null);
});

test("HP feedback tracks temporary damage and bar widths", () => {
  assert.deepEqual(
    hpChange({ value: 10, temp: 5, max: 20 }, { value: 10, temp: 2, max: 20 }),
    {
      delta: -3,
      kind: "damage",
      previousWidths: { normal: 50, temp: 25 },
      nextWidths: { normal: 50, temp: 10 }
    }
  );
});

test("HP damage spends temporary HP before regular HP", () => {
  const base = { value: 20, temp: 5, max: 20 };
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "-3" }), {
    value: 20,
    temp: 2
  });
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "-8" }), {
    value: 17,
    temp: 0
  });
  assert.deepEqual(
    resolveHpChanges({ ...base, valueInput: "-8", tempInput: "+2" }),
    {
      value: 19,
      temp: 0
    }
  );
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "+3" }), {
    value: 20,
    temp: 5
  });
});

test("regular view availability follows live spell and visibility changes", () => {
  let spells = [];
  const visibility = {
    inventory: true,
    skills: true,
    tools: false,
    combatSpells: true
  };
  const renderer = createRegularRenderer({
    combatItems: category => (category === "spells" ? spells : []),
    visibility
  });

  assert.equal(renderer.availableViews().spells, false);
  spells = [{ id: "spell-1" }];
  assert.equal(renderer.availableViews().spells, true);
  visibility.combatSpells = false;
  assert.equal(renderer.availableViews().spells, false);
});

test("combat HP includes a temporary segment and class resources come last", () => {
  const previousGame = globalThis.game;
  globalThis.game = { combat: null };
  try {
    let hp = { value: 5, max: 10, temp: 3, tempmax: 0 };
    let combatant = null;
    const renderer = createCombatRenderer({
      actor: { items: new Map() },
      actorHeader: () => "<div>Header</div>",
      adapter: {
        capabilities: { deathSaves: true },
        actorResources: () => [
          { id: "ki", label: "Ki", value: 2, max: 7, itemId: null }
        ],
        combatItems: () => [],
        combatStats: () => ({
          ac: 11,
          hp,
          speed: 45,
          speedUnits: "ft"
        }),
        featureResources: () => []
      },
      abilitiesSection: () => "<div>Abilities</div>",
      canRollActor: true,
      canRollDeathSave: () => true,
      deathData: () => ({ hp: hp.value, failure: 0 }),
      escapeHTML,
      formatMod: String,
      getCombatant: () => combatant,
      hudState: { favoriteEntries: [], resourcesExpanded: false },
      inspirationControl: () => "",
      modeNavigation: () => "",
      shortcutHint: () => "<div>Shortcuts</div>",
      t: key => key,
      visibility: { combatStats: true, combatResources: true }
    });

    const html = renderer.combatHTML();
    assert.match(html, /ws-health-fill[^>]+width: 50%;/);
    assert.match(html, /ws-health-temp-fill[^>]+width: 30%/);
    assert.match(html, /Combat.Bloodied/);
    assert.ok(html.indexOf("Abilities") < html.indexOf("ws-combat-resources"));
    assert.ok(html.indexOf("Shortcuts") < html.indexOf("ws-combat-resources"));
    hp = { ...hp, value: 1 };
    combatant = { id: "turn", initiative: 12 };
    globalThis.game.combat = { combatant };
    const criticalHtml = renderer.combatHTML();
    assert.match(criticalHtml, /Combat.CriticalHP/);
    assert.match(criticalHtml, /ws-combat-heading ws-current-turn/);
    hp = { ...hp, value: 0 };
    const unconsciousHtml = renderer.combatHTML();
    assert.match(unconsciousHtml, /Combat.Unconscious/);
    assert.match(unconsciousHtml, /data-action="death"/);
    assert.ok(
      unconsciousHtml.indexOf('data-action="edithp"') <
        unconsciousHtml.indexOf('data-action="death"')
    );
  } finally {
    globalThis.game = previousGame;
  }
});

test("shared HP bar renders normal and temporary health", () => {
  const html = renderHealthBar({
    hp: { value: 5, max: 10, temp: 3 },
    canEdit: true,
    formatMod: String,
    t: key => key
  });
  assert.match(html, /ws-health-fill[^>]+width: 50%/);
  assert.match(html, /ws-health-temp-fill[^>]+width: 30%/);
  assert.match(html, /Combat.Bloodied/);
  assert.match(html, /data-action="edithp"/);
});

test("exploration places the shared HP bar below the actor header", () => {
  const originalDocument = globalThis.document;
  let markup = "";
  globalThis.document = {
    createElement: () => ({
      set innerHTML(value) {
        markup = value;
      },
      content: { querySelector: () => ({ outerHTML: "view" }) }
    })
  };
  try {
    const renderer = createRegularRenderer({
      abilitiesSection: () => "",
      actorHeader: () => "ACTOR_HEADER",
      back: () => "",
      combatInitiative: () => "",
      combatItemButton: () => "",
      combatItems: () => [],
      favoriteSection: () => "",
      healthPanel: () => "HEALTH_BAR",
      hudState: {
        currentView: "main",
        inventoryCategory: "equipped",
        preparedSpellsOnly: true,
        searchQuery: ""
      },
      inspirationControl: () => "",
      instruments: [],
      inventoryCategories: () => [],
      inventoryItems: () => [],
      legend: () => "",
      modeNavigation: () => "",
      normalTools: [],
      restControls: () => "",
      searchControl: () => "",
      searchItems: items => items,
      shortcutHint: () => "",
      skillsHTML: () => "",
      spellGroups: () => "",
      t: key => key,
      toolSection: () => "",
      tools: [],
      visibility: { combatStats: true }
    });
    renderer.normalHTML();
    assert.ok(markup.indexOf("ACTOR_HEADER") < markup.indexOf("HEALTH_BAR"));
    assert.match(markup, /ws-regular-health/);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("actor class summary keeps its full value in a tooltip", () => {
  const components = createHudComponents({
    abilities: [],
    actor: { img: "actor.webp", name: "Rook" },
    adapter: {
      classSummary: () => "Monk 7 / Barbarian 1"
    },
    canRollActor: true,
    combatModeAvailable: () => true,
    escapeHTML,
    formatMod: String,
    hudState: {},
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: key => key,
    visibility: {}
  });

  const html = components.actorHeader();
  assert.match(html, /title="Monk 7 \/ Barbarian 1"/);
  assert.match(html, />Monk 7 \/ Barbarian 1<\/span>/);
});

test("adapter-provided ability markup is escaped", () => {
  const components = createHudComponents({
    abilities: [
      ['str" data-injected="yes', "<STR>", 'fa-hand-fist\" onclick=\"bad']
    ],
    actor: {},
    adapter: {
      abilityData: () => ({ mod: 2 }),
      abilityTotal: data => data.mod
    },
    canRollActor: true,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState: { abilitiesExpanded: true },
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: (_key, data) => `${data.ability} check`,
    visibility: { abilityChecks: true, savingThrows: true }
  });

  const html = components.abilitiesSection();
  assert.match(html, /data-key="str&quot; data-injected=&quot;yes"/);
  assert.match(html, /&lt;STR&gt;/);
  assert.doesNotMatch(html, /onclick="bad"/);
});

test("combat resources escape adapter identifiers and update through the adapter", async () => {
  const updates = [];
  const controller = createCombatResourceController({
    actor: {},
    adapter: {
      actorResources: () => [],
      featureResources: () => [
        {
          id: "resource",
          itemId: 'item\" injected=\"true',
          label: "Focus <Points>",
          max: 5,
          value: 3
        }
      ],
      resourceData: () => ({ current: 3, max: 5 }),
      updateResource: (_actor, data) => updates.push(data)
    },
    DialogV2: class {},
    escapeHTML,
    hudState: { resourcesExpanded: true },
    t: key => key,
    tf: key => key,
    visibility: { combatResources: true }
  });

  const html = controller.combatResources();
  assert.match(html, /data-item-id="item&quot; injected=&quot;true"/);
  assert.match(html, /Focus &lt;Points&gt;/);
  assert.match(html, /ws-resource-shortcuts ws-shortcuts/);
  assert.match(html, /Combat\.ResourceConsumeKeys/);
  assert.equal(
    await controller.changeResource({
      amount: 1,
      direction: "consume",
      item: { id: "item" }
    }),
    true
  );
  assert.equal(updates[0].value, 2);
});

test("combat resources with the same label remain separately available", () => {
  const controller = createCombatResourceController({
    actor: {},
    adapter: {
      actorResources: () => [
        { id: "primary", itemId: null, label: "Focus", max: 3, value: 2 }
      ],
      featureResources: () => [
        { id: "item-1", itemId: "item-1", label: "Focus", max: 2, value: 1 }
      ]
    },
    escapeHTML,
    hudState: { resourcesExpanded: true },
    t: key => key,
    visibility: { combatResources: true }
  });

  const html = controller.combatResources();
  assert.match(html, /data-resource-id="primary"/);
  assert.match(html, /data-item-id="item-1"/);
});

test("inline death save appears at zero HP and death replaces the roll", () => {
  const render = (death, canRoll = true) =>
    renderDeathSaveControl({
      canRoll,
      canRollActor: true,
      death,
      t: key => key
    });
  assert.equal(render({ hp: 1, failure: 0 }), "");
  assert.match(render({ hp: 0, failure: 2 }), /data-action="death"/);
  assert.match(render({ hp: 0, failure: 2 }, false), /disabled/);
  assert.match(render({ hp: 0, failure: 3 }), /Death.YouDied/);
  assert.doesNotMatch(render({ hp: 0, failure: 3 }), /data-action="death"/);
});
