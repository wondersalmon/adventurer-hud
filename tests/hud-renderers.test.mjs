import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import assert from "node:assert/strict";
import { combatTurnState } from "../scripts/hud/actor-context.js";
import test from "node:test";
import {
  escapeHTML,
  fragment,
  itemRendererFixture
} from "./helpers/rendering.mjs";

import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createItemPanelRenderer } from "../scripts/hud/items/item-panels.js";

test("GM action-only tabs include ordinary spells and keep legendary activities separate", () => {
  const weapon = { id: "sword", name: "Sword", type: "weapon" };
  const spell = { id: "spell", name: "Fireball", type: "spell" };
  const feature = { id: "feature", name: "Feature", type: "feat" };
  const legendary = { id: "legendary", name: "Legendary", type: "feat" };
  const f = itemRendererFixture({
    items: [weapon, spell, feature, legendary],
    hudState: { combatCategory: "spells", searchQuery: "does not match" },
    visibility: {
      gm: true,
      actionTypesOnly: true,
      showActionTypes: false,
      search: false
    },
    adapter: {
      itemActivities: item => [
        { activation: { type: item === legendary ? "legendary" : "action" } }
      ],
      combatItems: (_actor, category) =>
        ({
          weapons: [weapon],
          spells: [spell],
          features: [feature],
          action: [weapon, spell, feature, legendary]
        })[category] ?? []
    }
  });
  const root = fragment(f.renderer.combatActions());
  assert.deepEqual(
    [...root.querySelectorAll('[data-action="combatfilter"]')].map(
      button => button.dataset.category
    ),
    ["action", "features"]
  );
  assert.equal(f.hudState.combatCategory, "action");
  for (const item of [weapon, spell, feature])
    assert.ok(root.querySelector(`[data-item-id="${item.id}"]`));
  assert.equal(root.querySelector('[data-item-id="legendary"]'), null);
  assert.equal(root.querySelector('[data-action="searchitems"]'), null);
  f.visibility.actionTypesOnly = false;
  f.visibility.showActionTypes = true;
  const restored = fragment(f.renderer.combatActions());
  for (const category of ["weapons", "spells", "features"])
    assert.ok(restored.querySelector(`[data-category="${category}"]`));
  assert.equal(restored.querySelector('[data-item-id="spell"]'), null);
  f.visibility.gm = false;
  f.visibility.actionTypesOnly = true;
  assert.ok(
    fragment(f.renderer.combatActions()).querySelector(
      '[data-category="weapons"]'
    )
  );
});
import { createHpDialogController } from "../scripts/hud/hp-dialog.js";
import { createHudComponents } from "../scripts/hud/components.js";
import { renderDeathSaveControl } from "../scripts/hud/death-save-control.js";
import { renderHealthBar } from "../scripts/hud/health-bar.js";
import { resolveHpChanges, resolveHpInput } from "../scripts/hud/hp-input.js";
import { hpChange } from "../scripts/hud/health-feedback.js";
import { createRegularRenderer } from "../scripts/hud/regular.js";

restoreGlobalsAfterEach();

test("statuses expose safe native tooltip labels and right-click identity", () => {
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
      adapter: { statusDefinitions: () => [] },
      escapeHTML,
      hudState: {},
      t: key => key,
      visibility: { conditions: true }
    });

    const html = renderer.combatStatuses();
    assert.match(
      html,
      /aria-label="Marked &quot;dangerous&quot; &lt;effect&gt;"/
    );
    assert.match(html, /data-status-id="custom"/);
    assert.equal(fragment(html).querySelector(".ws-status").tagName, "BUTTON");
    assert.doesNotMatch(html, /data-action="removestatus"/);
    assert.equal(
      fragment(html).querySelector(".ws-status-more").hasAttribute("hidden"),
      true
    );
  } finally {
    globalThis.CONFIG = originalConfig;
    globalThis.game = originalGame;
  }
});

test("conditions retain native priority and all icons for adaptive overflow", () => {
  const previousConfig = globalThis.CONFIG;
  const previousGame = globalThis.game;
  globalThis.CONFIG = {
    statusEffects: [
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `condition-${index}`,
        name: `Condition ${index}`
      })),
      { id: "concentrating", name: "Concentrating" },
      { id: "bloodied", name: "Bloodied" }
    ]
  };
  globalThis.game = { i18n: { localize: value => value } };

  try {
    const hudState = { conditionsExpanded: false };
    const statuses = new Set(
      globalThis.CONFIG.statusEffects.map(({ id }) => id)
    );
    const renderer = createCombatRenderer({
      actor: {
        effects: [],
        statuses
      },
      adapter: {
        statusDefinitions: () => globalThis.CONFIG.statusEffects,
        statusKind: status =>
          status.id === "concentrating" || status.id === "bloodied"
            ? status.id
            : null
      },
      escapeHTML,
      hudState,
      t: key => key,
      visibility: { conditions: true }
    });

    const collapsed = renderer.combatStatuses();
    assert.equal((collapsed.match(/class="ws-status(?: |")/g) ?? []).length, 9);
    assert.match(collapsed, /data-action="toggleconditions"/);
    assert.match(collapsed, />\+9<\/button>/);
    assert.match(collapsed, /ws-status-concentrating/);
    assert.match(collapsed, /ws-status-bloodied/);
    assert.ok(
      collapsed.indexOf("Concentrating") < collapsed.indexOf("Condition 0")
    );
    assert.ok(collapsed.indexOf("Bloodied") < collapsed.indexOf("Condition 0"));
    assert.match(collapsed, /Condition 3/);
    assert.match(collapsed, /Condition 6/);
    assert.doesNotMatch(collapsed, /ws-status-new/);

    hudState.conditionsExpanded = true;
    const expanded = renderer.combatStatuses();
    assert.equal((expanded.match(/class="ws-status(?: |")/g) ?? []).length, 9);
    assert.match(expanded, /class="ws-status-extra"/);

    statuses.delete("concentrating");
    statuses.delete("condition-0");
    statuses.delete("condition-1");
    const reduced = renderer.combatStatuses();
    assert.equal((reduced.match(/class="ws-status(?: |")/g) ?? []).length, 6);
    assert.match(reduced, /Condition 6/);
    assert.match(reduced, /data-action="toggleconditions"/);
    assert.match(reduced, /class="ws-status-extra"/);

    statuses.delete("bloodied");
    statuses.delete("condition-2");
    const reducedAgain = renderer.combatStatuses();
    assert.equal(
      (reducedAgain.match(/class="ws-status(?: |")/g) ?? []).length,
      4
    );
    assert.doesNotMatch(reducedAgain, /ws-status-bloodied/);
  } finally {
    globalThis.CONFIG = previousConfig;
    globalThis.game = previousGame;
  }
});

test("new conditions flash only after the first render", () => {
  const previousConfig = globalThis.CONFIG;
  const previousGame = globalThis.game;
  globalThis.CONFIG = { statusEffects: [] };
  globalThis.game = { i18n: { localize: value => value } };

  try {
    const statuses = new Set(["existing"]);
    const renderer = createCombatRenderer({
      actor: { effects: [], statuses },
      adapter: { statusDefinitions: () => [] },
      escapeHTML,
      hudState: {},
      t: key => key,
      visibility: { conditions: true }
    });

    assert.doesNotMatch(renderer.combatStatuses(), /ws-status-new/);
    statuses.add("fresh");
    assert.match(renderer.combatStatuses(), /ws-status ws-status-new/);
    assert.doesNotMatch(renderer.combatStatuses(), /ws-status-new/);
    statuses.delete("fresh");
    renderer.combatStatuses();
    statuses.add("fresh");
    assert.match(renderer.combatStatuses(), /ws-status ws-status-new/);

    for (let index = 0; index < 4; index++) {
      statuses.add(`extra-${index}`);
    }
    renderer.combatStatuses();
    statuses.add("hidden-new");
    assert.match(
      renderer.combatStatuses(),
      /ws-status-more ws-button ws-status-new/
    );
  } finally {
    globalThis.CONFIG = previousConfig;
    globalThis.game = previousGame;
  }
});

test("checks and saves stay open together in both modes regardless of old collapse preferences", () => {
  const hudState = {
    abilitiesExpanded: true,
    combatAbilitiesExpanded: false
  };
  const components = createHudComponents({
    abilities: [["str", "STR", "fa-hand-fist"]],
    actor: {},
    adapter: {
      combatStats: () => ({ proficiencyBonus: 3 }),
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
  assert.match(regular, /data-type="check"/);
  assert.match(regular, /data-type="save"/);
  assert.ok(
    regular.indexOf('data-type="save"') < regular.indexOf('data-type="check"')
  );
  assert.equal((regular.match(/ws-ability-card-title/g) ?? []).length, 1);
  assert.doesNotMatch(combat, /hidden|toggleabilities/);
  assert.match(combat, /data-type="save"/);
  assert.match(combat, /data-type="check"/);
  assert.match(combat, /data-action="ability"/);
});

test("combat item categories start closed and show only the selected list", () => {
  const item = { id: "sword", name: "Sword" };
  const hudState = {
    combatCategory: null,
    actionMenuOpen: false,
    favoriteEntries: [],
    searchQuery: ""
  };
  const renderer = createItemPanelRenderer({
    actor: { items: new Map() },
    adapter: {
      combatItems: (_actor, category) => (category === "weapons" ? [item] : []),
      itemActivities: () => [],
      itemRole: () => "other",
      itemActivation: () => "",
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
    const controller = createHpDialogController({
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
    assert.deepEqual(updates[1], { damage: 3, temp: 4 });
  } finally {
    globalThis.document = originalDocument;
  }
});

test("disposing HP during its native render closes the late dialog and prevents duplicate opens", async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ innerHTML: "" }) };
  let finishRender,
    dialog,
    instances = 0,
    closes = 0;
  try {
    const controller = createHpDialogController({
      actor: { name: "Hero" },
      adapter: { combatStats: () => ({ hp: {} }) },
      DialogV2: class {
        constructor() {
          instances++;
          dialog = this;
        }
        render() {
          return new Promise(resolve => {
            finishRender = () => {
              this.rendered = true;
              resolve(this);
            };
          });
        }
        close() {
          this.rendered = false;
          closes++;
        }
      },
      t: key => key
    });
    const pending = controller.openHpDialog();
    controller.openHpDialog();
    assert.equal(instances, 1);
    controller.dispose();
    finishRender();
    await pending;
    assert.equal(dialog.rendered, false);
    assert.equal(closes, 1);
    assert.equal(controller.openHpDialog(), undefined);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("HP input distinguishes absolute values from signed changes", () => {
  for (const [input, current, max, expected] of [
    ["12", 10, 20, 12],
    ["+5", 10, 20, 15],
    ["-3", 10, 20, 7],
    ["+50", 10, 20, 20],
    ["-50", 10, 20, 0],
    ["+4", 0, undefined, 4],
    ["", 10, 20, 10],
    ["-2", 0, undefined, 0],
    ["+", 10, 20, null],
    ["1.5", 10, 20, null]
  ]) {
    assert.equal(
      resolveHpInput(input, current, max),
      expected,
      JSON.stringify({ input, current, max })
    );
  }
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

test("HP input delegates damage and healing without calculating their result", () => {
  const base = { value: 20, temp: 5, max: 20 };
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "-3" }), {
    damage: 3,
    temp: 5
  });
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "-8" }), {
    damage: 8,
    temp: 5
  });
  assert.deepEqual(
    resolveHpChanges({ ...base, valueInput: "-8", tempInput: "+2" }),
    {
      damage: 8,
      temp: 7
    }
  );
  assert.deepEqual(resolveHpChanges({ ...base, valueInput: "+3" }), {
    damage: -3,
    temp: 5
  });
});

test("regular spell navigation follows the live item list", () => {
  let spells = [];
  const renderer = createRegularRenderer({ combatItems: () => spells });
  assert.equal(renderer.availableViews().spells, false);
  spells = [{ id: "spell-1" }];
  assert.equal(renderer.availableViews().spells, true);
  spells = [];
  assert.equal(renderer.availableViews().spells, false);
});

test("combat places abilities below stats and statuses and features in the action filters", () => {
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
      ...itemRendererFixture({
        adapter: {
          combatItems: (_actor, category) =>
            category === "features" ? [{ id: "flurry" }] : []
        }
      }).renderer,
      actor: {
        items: new Map(),
        statuses: new Set(["prone"]),
        effects: []
      },
      actorHeader: extra => `<div>Header${extra}</div>`,
      adapter: {
        statusDefinitions: () => globalThis.CONFIG.statusEffects,
        combatStats: () => ({
          ac: 11,
          hp,
          speed: 45,
          speedUnits: "ft",
          proficiencyBonus: 3
        })
      },
      abilitiesSection: () => "<div>Abilities</div>",
      canRollActor: true,
      canRollDeathSave: () => true,
      deathData: () => ({ hp: hp.value, failure: 0 }),
      escapeHTML,
      formatMod: String,
      getCombatState: () =>
        combatTurnState(globalThis.game.combat, combatant, true),
      hudState: { favoriteEntries: [] },
      inspirationControl: () => "",
      modeNavigation: () => "",
      shortcutHint: () => "<div>Shortcuts</div>",
      t: key => key,
      tf: key => key,
      visibility: {}
    });

    const html = renderer.combatHTML();
    assert.doesNotMatch(html, /data-action="endturn"/);
    assert.ok(html.indexOf("Header") < html.indexOf("Abilities"));
    assert.ok(
      html.indexOf("ws-health-stack") < html.indexOf("ws-combat-statuses") &&
        html.indexOf("ws-combat-statuses") < html.indexOf("ws-combat-stats")
    );
    assert.ok(html.indexOf("Abilities") > html.indexOf("ws-combat-stats"));
    assert.doesNotMatch(html, /ws-player-proficiency/);
    assert.match(html, /ws-health-fill[^>]+width: 50%;/);
    assert.match(html, /ws-health-temp-fill[^>]+width: 30%/);
    assert.match(html, /Combat.HalfHP/);
    assert.ok(html.indexOf("Abilities") < html.indexOf("ws-combat-actions"));
    assert.ok(html.indexOf("Abilities") < html.indexOf("Shortcuts"));
    assert.ok(html.indexOf("Shortcuts") < html.indexOf("ws-combat-actions"));
    assert.match(
      html,
      /data-action="combatfilter" data-category="features" aria-expanded="false"/
    );
    assert.doesNotMatch(html, /data-action="toggleresources"/);
    assert.doesNotMatch(html, /class="ws-resource-grid"/);
    hp = { ...hp, value: 1 };
    combatant = { id: "turn", initiative: 12 };
    globalThis.game.combat = { started: true, combatant };
    const criticalHtml = renderer.combatHTML();
    assert.match(criticalHtml, /Combat.CriticalHP/);
    assert.match(criticalHtml, /ws-header-end-turn/);
    assert.doesNotMatch(criticalHtml, /ws-combat-heading ws-current-turn/);
    assert.doesNotMatch(criticalHtml, /Labels.Combat/);
    assert.match(criticalHtml, /data-action="endturn"/);
    assert.ok(
      criticalHtml.indexOf('data-action="endturn"') <
        criticalHtml.indexOf("ws-health-stack")
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
    assert.match(unconsciousHtml, /Combat.ZeroHP/);
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
  assert.match(html, /Combat.HalfHP/);
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
    actorHeader: extra => `ACTOR_HEADER${extra}`,
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
    globalSearchPanel: () => "",
    sortItems: items => items,
    shortcutHint: () => "",
    skillsHTML: () => "",
    spellFilterHTML: () => "",
    skillFilterHTML: () => "",
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
  assert.doesNotMatch(renderer.normalHTML(), /INITIATIVE_CONTROL/);
});

test("exploration keeps character information beside the selected view and reads current tools", () => {
  let inventoryReads = 0;
  const hudState = { currentView: "skills", proficientSkillsOnly: true };
  const toolState = { tools: [], normalTools: [], instruments: [] };
  const renderer = createRegularRenderer({
    actorHeader: () => "CHARACTER_HEADER",
    combatInitiative: () => "",
    inspirationControl: () => "",
    modeNavigation: () => "",
    combatItems: () => [],
    healthPanel: () => "HEALTH",
    abilitiesSection: () => "ABILITIES",
    favoriteSection: () => "FAVORITES",
    back: () => "BACK",
    hudState,
    inventoryItems: () => {
      inventoryReads++;
      return [];
    },
    legend: () => "",
    shortcutHint: () => "",
    skillsHTML: () => "SKILLS",
    spellFilterHTML: () => "FILTER",
    skillFilterHTML: () => "FILTER",
    t: key => key,
    trainedToolsHTML: () =>
      toolState.instruments.map(item => item.name).join(""),
    visibility: {}
  });

  const skills = renderer.normalHTML();
  assert.match(skills, /SKILLS/);
  assert.match(skills, /CHARACTER_HEADER/);
  assert.match(skills, /HEALTH/);
  assert.match(skills, /ABILITIES/);
  assert.match(skills, /FAVORITES/);
  assert.match(
    skills,
    /aria-expanded="true" aria-controls="ws-exploration-content-skills"/
  );
  assert.match(skills, /ws-exploration-section ws-expanded/);
  assert.match(skills, /data-view="skills" aria-current="page"/);
  assert.equal(inventoryReads, 0);
  hudState.currentView = "skills";
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
      combatStats: () => ({ proficiencyBonus: 3 }),
      combatStats: () => ({ proficiencyBonus: 3 }),
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

test("condition tooltips use native rule references and include effects without statuses", () => {
  globalThis.game = { i18n: { localize: key => key } };
  const renderer = createCombatRenderer({
    actor: {
      statuses: new Set(["poisoned"]),
      effects: [
        {
          id: "custom",
          uuid: "Actor.test.ActiveEffect.custom",
          statuses: new Set(),
          name: "Bless",
          description: "Manual description"
        },
        {
          id: "disabled",
          statuses: new Set(),
          name: "Disabled",
          disabled: true
        }
      ]
    },
    adapter: {
      statusDefinitions: () => [
        {
          id: "poisoned",
          name: "Poisoned",
          reference: "Compendium.rules.poisoned"
        }
      ]
    },
    escapeHTML,
    hudState: {},
    t: key => key
  });
  const root = fragment(renderer.combatStatuses());
  assert.match(
    root.querySelector('[data-status-id="poisoned"]').dataset.tooltip,
    /Compendium.rules.poisoned/
  );
  assert.match(
    root.querySelector('[aria-label="Bless"]').dataset.tooltip,
    /Actor.test.ActiveEffect.custom/
  );
  assert.equal(root.querySelector('[aria-label="Disabled"]'), null);
  assert.doesNotMatch(root.innerHTML, /Manual description/);
  assert.equal(root.querySelector(".ws-status[title]"), null);
});

test("GM keeps weapons without activities and still separates legendary-only items", () => {
  const weapon = { id: "bite", name: "Bite", type: "weapon" };
  const legendary = { id: "legend", name: "Legend", type: "feat" };
  const { renderer } = itemRendererFixture({
    items: [weapon, legendary],
    visibility: { gm: true, actionTypesOnly: false },
    adapter: {
      combatItems: (_actor, category) =>
        category === "weapons" ? [weapon, legendary] : [],
      itemActivities: item =>
        item === legendary ? [{ activation: { type: "legendary" } }] : []
    }
  });
  const root = fragment(renderer.combatActions());
  assert.equal(
    root.querySelector('[data-category="weapons"] small').textContent,
    "1"
  );
  assert.ok(root.querySelector('[data-item-id="bite"]'));
  assert.equal(root.querySelector('[data-item-id="legend"]'), null);
});

test("GM legendary abilities remain visible without a resource pool and respect collapse with a pool", () => {
  installSettings();
  const actor = { name: "NPC", type: "npc", effects: [], statuses: new Set() };
  let resource = null;
  const hudState = { gmLegendaryExpanded: false };
  const renderer = createCombatRenderer({
    actor,
    adapter: {
      combatStats: () => ({ ac: 10, hp: { value: 10, max: 10 } }),
      npcResource: (_actor, key) => (key === "legact" ? resource : null),
      npcTraits: () => [],
      npcMovement: () => ({ primary: "30 ft", secondary: "" })
    },
    escapeHTML,
    formatMod: String,
    hudState,
    t: key => key,
    visibility: { gm: true },
    gmHeader: () => "",
    getCombatState: () => ({ combat: { started: true }, isTurn: false }),
    combatActions: () => "",
    gmSpecialActions: kind =>
      kind === "legendary"
        ? '<button data-test="legendary">Legendary ability</button>'
        : ""
  });
  assert.ok(
    fragment(renderer.combatHTML()).querySelector('[data-test="legendary"]')
  );
  resource = { max: 3, value: 0 };
  assert.equal(
    fragment(renderer.combatHTML()).querySelector('[data-test="legendary"]'),
    null
  );
  hudState.gmLegendaryExpanded = true;
  assert.ok(
    fragment(renderer.combatHTML()).querySelector(
      '.ws-gm-legendary-list [data-test="legendary"]'
    )
  );
});

test("GM unfiltered actions include missing activities and special abilities once without category tabs", () => {
  const items = [
    { id: "multi", name: "Multiattack", type: "feat" },
    { id: "legend", name: "Legendary ability", type: "feat" },
    { id: "spell", name: "Spell", type: "spell" },
    {
      id: "cache",
      name: "Cached spell",
      type: "spell",
      flags: { dnd5e: { cachedFor: "cast" } }
    },
    { id: "loot", name: "Treasure", type: "loot" }
  ];
  const { renderer, visibility } = itemRendererFixture({
    items,
    visibility: { gm: true, filterActions: false, actionTypesOnly: true },
    adapter: {
      itemActivities: item =>
        item.id === "legend" ? [{ activation: { type: "legendary" } }] : []
    }
  });
  const root = fragment(renderer.combatActions());
  assert.equal(root.querySelectorAll('[data-action="combatfilter"]').length, 0);
  for (const id of ["multi", "legend", "spell"]) {
    assert.equal(
      root.querySelectorAll(
        `.ws-combat-item[data-action="${id === "multi" ? "openitem" : "useitem"}"][data-item-id="${id}"]`
      ).length,
      1
    );
  }
  assert.equal(root.querySelector('[data-item-id="cache"]'), null);
  assert.equal(root.querySelector('[data-item-id="loot"]'), null);
  visibility.search = true;
  visibility.filterActions = true;
  assert.equal(
    fragment(renderer.combatActions()).querySelector('[data-item-id="multi"]'),
    null
  );
});
