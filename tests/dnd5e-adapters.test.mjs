import assert from "node:assert/strict";
import test from "node:test";

import {
  abilityTotal,
  actorDeathData,
  proficiencyMultiplier
} from "../scripts/dnd5e/actor-data.js";
import {
  damagePartFormula,
  hasItemProperty,
  inventoryCategory,
  isPreparedSpell,
  itemActivation,
  itemRangeData,
  itemUsesData
} from "../scripts/dnd5e/items.js";
import { dnd5eAdapter } from "../scripts/systems/dnd5e.js";

test("D&D status configuration accepts collection and object forms", () => {
  const previousConfig = globalThis.CONFIG;
  const bloodied = { id: "bloodied", name: "Bloodied" };
  try {
    globalThis.CONFIG = { statusEffects: new Map([["bloodied", bloodied]]) };
    assert.deepEqual(dnd5eAdapter.statusDefinitions(), [bloodied]);
    globalThis.CONFIG = { statusEffects: { bloodied } };
    assert.deepEqual(dnd5eAdapter.statusDefinitions(), [bloodied]);
    assert.equal(dnd5eAdapter.statusKind(bloodied), "bloodied");
    assert.equal(
      dnd5eAdapter.statusKind({ id: "concentrating" }),
      "concentrating"
    );
    assert.equal(dnd5eAdapter.spellSlotKind("pact"), "pact");
    assert.equal(dnd5eAdapter.spellSlotKind("spell2"), "standard");
  } finally {
    globalThis.CONFIG = previousConfig;
  }
});

const dnd53 = {
  system: {
    activation: { type: "bonus" },
    range: { value: 30, long: 120, units: "ft" },
    damage: { parts: [["1d8 + @mod", "piercing"]] },
    preparation: { mode: "prepared", prepared: true },
    properties: ["ritual"]
  }
};

const dnd6 = {
  system: {
    activities: new Map([
      [
        "attack",
        {
          activation: { type: "action" },
          duration: { concentration: true },
          range: { value: { value: 60, long: 120, units: "ft" } }
        }
      ]
    ]),
    level: 1,
    preparation: { mode: "prepared", prepared: false },
    properties: new Set(["vocal"])
  }
};

test("combat stats include proficiency bonus", () => {
  const actor = {
    system: {
      attributes: {
        ac: { value: 16 },
        hp: { value: 20, max: 20 },
        movement: { walk: 30, units: "ft" },
        prof: 3
      }
    }
  };
  assert.equal(dnd5eAdapter.combatStats(actor).proficiencyBonus, 3);
});

test("D&D 5e HP update saves current and temporary HP together", async () => {
  const updates = [];
  await dnd5eAdapter.updateHp(
    { update: values => updates.push(values) },
    { value: 8, temp: 4 }
  );
  assert.deepEqual(updates, [
    {
      "system.attributes.hp.value": 8,
      "system.attributes.hp.temp": 4
    }
  ]);
});

test("only leveled prepared-mode spells can toggle preparation", async () => {
  const updates = [];
  const spell = {
    type: "spell",
    system: { level: 2, preparation: { mode: "prepared", prepared: false } },
    update: values => updates.push(values)
  };
  assert.deepEqual(dnd5eAdapter.spellPreparation(spell), {
    canPrepare: true,
    prepared: false
  });
  await dnd5eAdapter.toggleSpellPreparation(spell);
  assert.deepEqual(updates, [{ "system.preparation.prepared": true }]);
  spell.system.level = 0;
  assert.equal(dnd5eAdapter.spellPreparation(spell).canPrepare, false);
  spell.system.level = 2;
  spell.system.preparation.mode = "always";
  assert.equal(dnd5eAdapter.spellPreparation(spell).canPrepare, false);
});

test("modern D&D spells use numeric preparation states", async () => {
  const updates = [];
  const spell = {
    type: "spell",
    system: { level: 1, method: "spell", prepared: 0, canPrepare: true },
    update: values => updates.push(values)
  };
  assert.deepEqual(dnd5eAdapter.spellPreparation(spell), {
    canPrepare: true,
    prepared: false
  });
  assert.equal(isPreparedSpell(spell), false);
  await dnd5eAdapter.toggleSpellPreparation(spell);
  assert.deepEqual(updates, [{ "system.prepared": 1 }]);
  spell.system.prepared = 1;
  assert.equal(isPreparedSpell(spell), true);
  await dnd5eAdapter.toggleSpellPreparation(spell);
  assert.deepEqual(updates[1], { "system.prepared": 0 });
  spell.system.prepared = 2;
  assert.equal(dnd5eAdapter.spellPreparation(spell).canPrepare, false);
  await dnd5eAdapter.toggleSpellPreparation(spell);
  assert.equal(updates.length, 2);
});

test("death data recognizes terminal counters and stable status", () => {
  const actor = {
    system: {
      attributes: { death: { failure: 3, success: 0 }, hp: { value: 0 } }
    },
    statuses: new Set()
  };
  assert.equal(actorDeathData(actor).dead, true);
  actor.system.attributes.death.failure = 0;
  actor.statuses.add("stable");
  assert.equal(actorDeathData(actor).stable, true);
});

test("D&D 5e 5.3 item shape remains supported", () => {
  assert.equal(itemActivation(dnd53), "bonus");
  assert.deepEqual(itemRangeData(dnd53), {
    value: 30,
    long: 120,
    units: "ft",
    special: ""
  });
  assert.equal(hasItemProperty(dnd53, "ritual"), true);
  assert.equal(isPreparedSpell(dnd53), true);
  assert.equal(damagePartFormula(dnd53.system.damage.parts[0]), "1d8 + @mod");
});

test("D&D 5e 6.x activity shape remains supported", () => {
  assert.equal(itemActivation(dnd6), "action");
  assert.deepEqual(itemRangeData(dnd6), {
    value: 60,
    long: 120,
    units: "ft",
    special: ""
  });
  assert.equal(hasItemProperty(dnd6, "concentration"), true);
  assert.equal(isPreparedSpell(dnd6), false);
});

test("weapon range uses normal and long item distances unless an activity overrides them", () => {
  const weapon = {
    type: "weapon",
    system: {
      range: { value: 80, long: 320, units: "ft" },
      activities: [
        { id: "custom", range: { override: true, value: 60, units: "ft" } },
        { id: "attack", range: { value: 320, long: 320, units: "ft" } }
      ]
    }
  };

  const normalRange = {
    value: 80,
    long: 320,
    units: "ft",
    special: ""
  };
  assert.deepEqual(itemRangeData(weapon), normalRange);
  assert.deepEqual(itemRangeData(weapon, "attack"), normalRange);
  assert.deepEqual(itemRangeData(weapon, "custom"), {
    value: 60,
    long: "",
    units: "ft",
    special: ""
  });
});

test("general item range does not inherit an unrelated activity override", () => {
  const item = {
    type: "spell",
    system: {
      range: { value: 30, units: "ft" },
      activities: [{ id: "far", range: { value: 120, units: "ft" } }]
    }
  };
  assert.equal(itemRangeData(item).value, 30);
  assert.equal(itemRangeData(item, "far").value, 120);
  item.system.range = {};
  assert.equal(itemRangeData(item).value, 120);
});

test("combat categories are indexed in one item pass", () => {
  const weapon = {
    type: "weapon",
    system: {
      activities: [
        { activation: { type: "action" } },
        { activation: { type: "bonus" } }
      ]
    }
  };
  const spell = { type: "spell", system: { activation: { type: "action" } } };
  let passes = 0;
  const actor = {
    items: {
      *[Symbol.iterator]() {
        passes++;
        yield weapon;
        yield spell;
      }
    }
  };
  const categories = dnd5eAdapter.combatItemsByCategory(actor, [
    "weapons",
    "spells",
    "action",
    "bonus"
  ]);
  assert.equal(passes, 1);
  assert.deepEqual(categories.get("weapons"), [weapon]);
  assert.deepEqual(categories.get("spells"), [spell]);
  assert.deepEqual(categories.get("action"), [weapon, spell]);
  assert.deepEqual(categories.get("bonus"), [weapon]);
});

test("weapon-only category indexing skips activity inspection", () => {
  const weapon = {
    type: "weapon",
    system: {
      get activities() {
        throw new Error("Activities were read");
      }
    }
  };
  const categories = dnd5eAdapter.combatItemsByCategory({ items: [weapon] }, [
    "weapons"
  ]);
  assert.deepEqual(categories.get("weapons"), [weapon]);
});

test("action cards use the selected activity's activation, range and cost", () => {
  const item = {
    system: {
      activities: [
        {
          id: "short",
          activation: { type: "action" },
          range: { value: 5, units: "ft" },
          consumption: { targets: [{ value: 1, target: "focus" }] }
        },
        {
          id: "long",
          activation: { type: "bonus" },
          range: { value: 60, units: "ft" },
          consumption: { targets: [{ value: 2, target: "focus" }] }
        }
      ]
    }
  };
  const actor = { items: new Map([["focus", { name: "Focus" }]]) };
  assert.equal(itemActivation(item, "long"), "bonus");
  assert.equal(itemRangeData(item, "long").value, 60);
  assert.equal(
    dnd5eAdapter.itemResourceCost(actor, item, {
      fallbackLabel: "Resource",
      activityId: "long"
    }),
    "2 Focus"
  );
});

test("actor adapters prefer prepared totals and retain legacy fallbacks", () => {
  assert.equal(proficiencyMultiplier({ prof: { multiplier: 2 } }), 2);
  assert.equal(abilityTotal({ check: { value: 7 }, mod: 2 }, "check"), 7);
  assert.equal(
    abilityTotal(
      { mod: 3, saveBonus: 1, saveProf: { term: 2, flat: 2 } },
      "save"
    ),
    6
  );
  assert.deepEqual(
    actorDeathData({
      system: {
        attributes: { death: { failure: 1, success: 2 }, hp: { value: 0 } }
      }
    }),
    { dead: false, failure: 1, hp: 0, stable: false, success: 2 }
  );
});

test("inventory adapters categorize items and normalize 5.3 and 6.x charges", () => {
  assert.equal(
    inventoryCategory({ type: "weapon", system: { equipped: true } }),
    "equipped"
  );
  assert.equal(
    inventoryCategory({ type: "consumable", system: {} }),
    "consumables"
  );
  assert.equal(inventoryCategory({ type: "loot", system: {} }), "other");
  assert.equal(inventoryCategory({ type: "spell", system: {} }), null);

  assert.deepEqual(itemUsesData({ system: { uses: { value: 2, max: 3 } } }), {
    value: 2,
    max: 3
  });
  assert.deepEqual(itemUsesData({ system: { uses: { spent: 2, max: 5 } } }), {
    value: 3,
    max: 5
  });
  assert.equal(itemUsesData({ system: { uses: { max: 0 } } }), null);
});

test("D&D adapter displays attack and damage formulas without duplicating ability modifiers", () => {
  const originalRoll = globalThis.Roll;
  globalThis.Roll = {
    replaceFormulaData(formula) {
      return formula
        .replaceAll("@mod", "3")
        .replaceAll("@abilities.str.mod", "3");
    }
  };

  try {
    const actor = {
      system: { abilities: { str: { mod: 3 } } },
      getRollData: () => ({})
    };
    const legacy = {
      type: "weapon",
      labels: { attack: "5" },
      system: {
        ability: "str",
        damage: { parts: [["1d8 + @mod", "piercing"]] }
      }
    };
    const explicitAbilityPath = {
      type: "weapon",
      system: {
        ability: "str",
        damage: {
          parts: [["1d8 + @abilities.str.mod", "piercing"]]
        }
      }
    };
    const structured = {
      type: "weapon",
      system: {
        ability: "str",
        activities: new Map([
          [
            "attack",
            {
              type: "attack",
              attack: true,
              damage: { parts: [{ number: 1, denomination: 8 }] }
            }
          ]
        ])
      }
    };

    assert.equal(dnd5eAdapter.itemAttackBonus(legacy), "+5");
    assert.equal(dnd5eAdapter.itemDamageFormula(actor, legacy), "1d8 + 3");
    assert.equal(
      dnd5eAdapter.itemDamageFormula(actor, explicitAbilityPath),
      "1d8 + 3"
    );
    assert.equal(dnd5eAdapter.itemDamageFormula(actor, structured), "1d8 + 3");
  } finally {
    globalThis.Roll = originalRoll;
  }
});

test("D&D activity cards use only the selected activity's attack and damage", () => {
  const originalRoll = globalThis.Roll;
  globalThis.Roll = { replaceFormulaData: formula => formula };
  try {
    const actor = {
      system: { abilities: { str: { mod: 3 }, dex: { mod: 2 } } },
      getRollData: () => ({})
    };
    const item = {
      type: "weapon",
      labels: { toHit: "+7" },
      system: {
        damage: { base: { formula: "1d10" } },
        activities: new Map([
          [
            "slash",
            {
              id: "slash",
              type: "attack",
              attack: { ability: "str" },
              labels: { toHit: "+7" },
              damage: { parts: [{ formula: "1d8" }], includeBase: false }
            }
          ],
          [
            "throw",
            {
              id: "throw",
              type: "attack",
              attack: { ability: "dex" },
              labels: { toHit: "+4" },
              damage: { parts: [{ formula: "1d6" }], includeBase: false }
            }
          ],
          [
            "burst",
            {
              id: "burst",
              type: "damage",
              damage: { parts: [{ formula: "2d4" }] }
            }
          ]
        ])
      }
    };

    assert.equal(dnd5eAdapter.itemAttackBonus(item, "throw"), "+4");
    assert.equal(
      dnd5eAdapter.itemDamageFormula(actor, item, "throw"),
      "1d6 + 2"
    );
    assert.equal(dnd5eAdapter.itemAttackBonus(item, "burst"), "");
    assert.equal(dnd5eAdapter.itemDamageFormula(actor, item, "burst"), "2d4");
    assert.equal(dnd5eAdapter.itemAttackBonus(item, "missing"), "");
    assert.equal(dnd5eAdapter.itemDamageFormula(actor, item, "missing"), "");
    item.system.activities.get("slash").damage = {
      includeBase: true,
      parts: []
    };
    assert.equal(
      dnd5eAdapter.itemDamageFormula(actor, item, "slash"),
      "1d10 + 3"
    );
  } finally {
    globalThis.Roll = originalRoll;
  }
});

test("spell save DC follows the selected activity", () => {
  const item = {
    type: "spell",
    system: {
      activities: new Map([
        ["save", { id: "save", type: "save", save: { dc: { value: 16 } } }],
        ["attack", { id: "attack", type: "attack", labels: { toHit: "+7" } }]
      ])
    }
  };
  assert.equal(dnd5eAdapter.itemSaveDc(item), "16");
  assert.equal(dnd5eAdapter.itemSaveDc(item, "save"), "16");
  assert.equal(dnd5eAdapter.itemSaveDc(item, "attack"), "");
  assert.equal(dnd5eAdapter.itemAttackBonus(item, "attack"), "+7");
  assert.equal(dnd5eAdapter.itemAttackBonus(item, "save"), "");
});

test("D&D adapter normalizes resources and spell-slot pools", () => {
  const actor = {
    items: [
      {
        id: "focus",
        name: "Focus Points",
        type: "feat",
        system: { uses: { spent: 1, max: 4 } }
      }
    ],
    system: {
      resources: { primary: { label: "Sorcery", value: 2, max: 5 } },
      spells: {
        spell2: { value: 1, max: 3 },
        pact: { level: 2, value: 2, max: 2 }
      }
    }
  };

  assert.deepEqual(dnd5eAdapter.actorResources(actor), [
    {
      id: "primary",
      itemId: null,
      label: "Sorcery",
      max: 5,
      value: 2
    }
  ]);
  assert.deepEqual(dnd5eAdapter.featureResources(actor), [
    {
      id: "focus",
      itemId: "focus",
      label: "Focus Points",
      max: 4,
      value: 3
    }
  ]);
  assert.deepEqual(dnd5eAdapter.spellSlots(actor, 2), [
    [1, 3, "spell2"],
    [2, 2, "pact"]
  ]);
});

test("spell slot edits update only the selected pool within its limits", async () => {
  const updates = [];
  const actor = {
    system: {
      spells: { spell2: { value: 1, max: 3 }, pact: { value: 2, max: 2 } }
    },
    update: values => updates.push(values)
  };
  await dnd5eAdapter.updateSpellSlots(actor, { pool: "spell2", value: 9 });
  await dnd5eAdapter.updateSpellSlots(actor, { pool: "pact", value: -2 });
  await dnd5eAdapter.updateSpellSlots(actor, { pool: "spell2", value: 1 });
  await dnd5eAdapter.updateSpellSlots(actor, { pool: "other", value: 1 });
  assert.deepEqual(updates, [
    { "system.spells.spell2.value": 3 },
    { "system.spells.pact.value": 0 }
  ]);
});

test("item resource costs use a fallback label when no target is specified", () => {
  const actor = { items: new Map() };
  const item = { system: { consume: { amount: 2 } } };

  assert.equal(
    dnd5eAdapter.itemResourceCost(actor, item, { fallbackLabel: "Resource" }),
    "2 Resource"
  );
});

test("D&D adapter delegates roll actions to the owning documents", async () => {
  const calls = [];
  const actor = {
    rollAbilityCheck: options => calls.push(["check", options]),
    rollSavingThrow: options => calls.push(["save", options]),
    rollSkill: options => calls.push(["skill", options]),
    rollToolCheck: options => calls.push(["tool", options]),
    rollDeathSave: options => calls.push(["death", options]),
    rollInitiative: (options, rollOptions) =>
      calls.push(["initiative", options, rollOptions])
  };
  const event = { altKey: true, ctrlKey: false, shiftKey: true };

  await dnd5eAdapter.rollAbility(actor, { type: "check", key: "str", event });
  await dnd5eAdapter.rollAbility(actor, { type: "save", key: "dex", event });
  await dnd5eAdapter.rollSkill(actor, { key: "ath", event });
  await dnd5eAdapter.rollTool(actor, { key: "thief", event });
  await dnd5eAdapter.rollDeathSave(actor, { event });
  await dnd5eAdapter.rollInitiative(actor, { event });
  const disadvantageEvent = { altKey: false, ctrlKey: true };
  await dnd5eAdapter.rollInitiative(actor, { event: disadvantageEvent });

  assert.deepEqual(calls, [
    ["check", { ability: "str", event }],
    ["save", { ability: "dex", event }],
    ["skill", { skill: "ath", event }],
    ["tool", { tool: "thief", event }],
    ["death", { event }],
    [
      "initiative",
      { createCombatants: false },
      { advantage: true, disadvantage: false, event }
    ],
    [
      "initiative",
      { createCombatants: false },
      {
        advantage: false,
        disadvantage: true,
        event: disadvantageEvent
      }
    ]
  ]);
});
