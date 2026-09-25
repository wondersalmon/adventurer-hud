import assert from "node:assert/strict";
import test from "node:test";

import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createCombatItemRenderer } from "../scripts/hud/combat-items.js";
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

test("statuses display safely without an action to remove them", () => {
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
      escapeHTML,
      hudState: {},
      t: key => key,
      visibility: { conditions: true }
    });

    const html = renderer.combatStatuses();
    assert.match(html, /title="Marked &quot;dangerous&quot; &lt;effect&gt;"/);
    assert.match(html, /role="img"/);
    assert.doesNotMatch(html, /data-action="removestatus"/);
    assert.doesNotMatch(html, /<button/);
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

test("combat item categories start closed and show only the selected list", () => {
  const item = { id: "sword", name: "Sword" };
  const hudState = {
    combatCategory: null,
    actionMenuOpen: false,
    favoriteEntries: [],
    searchQuery: ""
  };
  const renderer = createCombatItemRenderer({
    actor: {},
    adapter: {
      combatItems: (_actor, category) => (category === "weapons" ? [item] : []),
      itemActivities: () => [],
      itemRole: () => "other",
      itemActivation: () => "",
      itemResourceCost: () => "",
      itemUsesData: () => null
    },
    escapeHTML,
    hudState,
    t: key => key,
    visibility: { combatWeapons: true }
  });

  const collapsed = renderer.combatActions();
  assert.match(collapsed, /data-category="weapons"[^>]+aria-expanded="false"/);
  assert.doesNotMatch(collapsed, /class="ws-combat-item-list"/);
  hudState.combatCategory = "weapons";
  const expanded = renderer.combatActions();
  assert.match(expanded, /data-category="weapons"[^>]+aria-expanded="true"/);
  assert.match(expanded, /data-item-id="sword"/);
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

test("spell slot dialog edits the current pool after checking its latest maximum", async () => {
  const originalDocument = globalThis.document;
  let slots = [1, 3, "spell2"];
  let dialogOptions;
  const updates = [];
  globalThis.document = { createElement: () => ({ innerHTML: "" }) };
  try {
    const controller = createCombatResourceController({
      actor: {},
      adapter: {
        spellSlots: () => [slots],
        updateSpellSlots: (_actor, values) => updates.push(values)
      },
      DialogV2: class {
        constructor(options) {
          dialogOptions = options;
        }
        render() {}
      },
      t: key => key,
      tf: key => key,
      visibility: {}
    });
    controller.openSpellSlotsDialog({ level: 2, pool: "spell2" });
    assert.equal(dialogOptions.buttons[0].default, true);
    slots = [1, 2, "spell2"];
    await dialogOptions.buttons[0].callback(null, {
      form: { elements: { namedItem: () => ({ value: "3" }) } }
    });
    assert.deepEqual(updates, [{ pool: "spell2", value: 2 }]);
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

test("combat places statuses above HP, then abilities and collapsed resources above actions", () => {
  const previousGame = globalThis.game;
  const previousConfig = globalThis.CONFIG;
  globalThis.game = {
    combat: null,
    i18n: { localize: value => value }
  };
  globalThis.CONFIG = { statusEffects: [{ id: "prone", name: "Prone" }] };
  try {
    let hp = { value: 5, max: 10, temp: 3, tempmax: 0 };
    let combatant = null;
    const renderer = createCombatRenderer({
      actor: {
        items: new Map(),
        statuses: new Set(["prone"]),
        effects: []
      },
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
          speedUnits: "ft",
          proficiencyBonus: 3
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
      tf: key => key,
      visibility: {
        combatStats: true,
        combatResources: true,
        conditions: true,
        initiative: true
      }
    });

    const html = renderer.combatHTML();
    assert.doesNotMatch(html, /data-action="endturn"/);
    assert.ok(
      html.indexOf("ws-combat-statuses") < html.indexOf("ws-health-stack")
    );
    assert.ok(html.indexOf("ws-combat-stats") < html.indexOf("Abilities"));
    assert.match(
      html,
      /Combat.ProficiencyBonusShort<\/span>\s*<strong>3<\/strong>/
    );
    assert.match(html, /ws-health-fill[^>]+width: 50%;/);
    assert.match(html, /ws-health-temp-fill[^>]+width: 30%/);
    assert.match(html, /Combat.Bloodied/);
    assert.ok(html.indexOf("Abilities") < html.indexOf("ws-combat-resources"));
    assert.ok(html.indexOf("ws-combat-resources") < html.indexOf("Shortcuts"));
    assert.match(html, /data-action="toggleresources" aria-expanded="false"/);
    assert.doesNotMatch(html, /class="ws-resource-grid"/);
    hp = { ...hp, value: 1 };
    combatant = { id: "turn", initiative: 12 };
    globalThis.game.combat = { started: true, combatant };
    const criticalHtml = renderer.combatHTML();
    assert.match(criticalHtml, /Combat.CriticalHP/);
    assert.match(criticalHtml, /ws-combat-heading ws-current-turn/);
    assert.doesNotMatch(criticalHtml, /Labels.Combat/);
    assert.match(criticalHtml, /data-action="endturn"/);
    assert.ok(
      criticalHtml.indexOf("Combat.YourTurn") <
        criticalHtml.indexOf('data-action="endturn"')
    );
    globalThis.game.combat.combatant = { id: "other" };
    assert.doesNotMatch(renderer.combatHTML(), /data-action="endturn"/);
    globalThis.game.combat.combatant = combatant;
    combatant.initiative = null;
    const resetInitiative = renderer.combatInitiative();
    assert.match(resetInitiative, /ws-header-initiative ws-button ws-unrolled/);
    assert.doesNotMatch(resetInitiative, /disabled/);
    hp = { ...hp, value: 0 };
    const unconsciousHtml = renderer.combatHTML();
    assert.match(unconsciousHtml, /Combat.Unconscious/);
    assert.match(unconsciousHtml, /data-action="death"/);
    assert.ok(
      unconsciousHtml.indexOf('data-action="edithp"') <
        unconsciousHtml.indexOf('data-action="death"')
    );
  } finally {
    globalThis.CONFIG = previousConfig;
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

test("HP bar turns yellow below 70 percent and red at half health", () => {
  const render = value =>
    renderHealthBar({
      hp: { value, max: 100 },
      canEdit: true,
      formatMod: String,
      t: key => key
    });

  assert.match(render(70), /background: var\(--success\)/);
  assert.match(render(69), /background: var\(--warning\)/);
  assert.match(render(51), /background: var\(--warning\)/);
  assert.match(render(50), /background: hsl\(3 65%/);
});

test("exploration places the shared HP bar below the actor header", () => {
  let initiative = "";
  const renderer = createRegularRenderer({
    abilitiesSection: () => "",
    actorHeader: () => "ACTOR_HEADER",
    back: () => "",
    combatInitiative: () => initiative,
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
    inventoryCategories: () => [],
    inventoryItems: () => [],
    legend: () => "",
    modeNavigation: () => "",
    restControls: controls => controls,
    searchControl: () => "",
    searchItems: items => items,
    shortcutHint: () => "",
    skillsHTML: () => "",
    spellGroups: () => "",
    t: key => key,
    toolSection: () => "",
    toolState: { tools: [], normalTools: [], instruments: [] },
    visibility: { combatStats: true }
  });
  const markup = renderer.normalHTML();
  assert.ok(markup.indexOf("ACTOR_HEADER") < markup.indexOf("HEALTH_BAR"));
  assert.match(markup, /ws-regular-health/);
  assert.doesNotMatch(markup, /INITIATIVE_CONTROL/);
  initiative = "INITIATIVE_CONTROL";
  assert.match(renderer.normalHTML(), /INITIATIVE_CONTROL/);
});

test("regular renderer builds only the selected view and reads current tools", () => {
  let inventoryReads = 0;
  const hudState = { currentView: "skills", proficientSkillsOnly: true };
  const toolState = { tools: [], normalTools: [], instruments: [] };
  const renderer = createRegularRenderer({
    actorHeader: () => assert.fail("main view rendered"),
    back: () => "BACK",
    hudState,
    inventoryItems: () => {
      inventoryReads++;
      return [];
    },
    legend: () => "",
    shortcutHint: () => "",
    skillsHTML: () => "SKILLS",
    t: key => key,
    toolSection: (_label, _icon, items) =>
      items.map(item => item.name).join(""),
    toolState,
    visibility: {}
  });

  assert.match(renderer.normalHTML(), /SKILLS/);
  assert.equal(inventoryReads, 0);
  hudState.currentView = "tools";
  toolState.tools = [{ name: "Flute" }];
  toolState.instruments = toolState.tools;
  assert.match(renderer.normalHTML(), /Flute/);
  assert.equal(inventoryReads, 0);
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
  assert.equal((html.match(/data-open-actor-sheet/g) ?? []).length, 2);
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
