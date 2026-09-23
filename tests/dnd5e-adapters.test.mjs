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
    { failure: 1, hp: 0, success: 2 }
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
    [1, 3],
    [2, 2]
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
