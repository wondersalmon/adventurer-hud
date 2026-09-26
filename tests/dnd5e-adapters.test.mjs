import assert from "node:assert/strict";
import test from "node:test";

import { actorDeathData } from "../scripts/dnd5e/actor-data.js";
import { itemRangeData } from "../scripts/dnd5e/items.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";

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

test("HP deltas use native damage and healing after explicit temporary HP edits", async () => {
  const calls = [];
  const actor = {
    system: { attributes: { hp: { temp: 5 } } },
    async update(values) {
      calls.push(["update", values]);
      this.system.attributes.hp.temp = values["system.attributes.hp.temp"];
    },
    async applyDamage(amount) {
      calls.push(["applyDamage", amount]);
    }
  };
  await dnd5eAdapter.updateHp(actor, { damage: 8, temp: 5 });
  await dnd5eAdapter.updateHp(actor, { damage: -3, temp: 5 });
  await dnd5eAdapter.updateHp(actor, { damage: 8, temp: 7 });
  assert.deepEqual(calls, [
    ["applyDamage", 8],
    ["applyDamage", -3],
    ["update", { "system.attributes.hp.temp": 7 }],
    ["applyDamage", 8]
  ]);
  calls.length = 0;
  await dnd5eAdapter.updateHp(actor, { damage: 0, temp: 7 });
  assert.deepEqual(calls, []);
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
  const spell = {
    type: "spell",
    system: { activities: [{ activation: { type: "action" } }] }
  };
  let passes = 0;
  const actor = {
    items: {
      *values() {
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
  assert.equal(dnd5eAdapter.itemSaveDc(item), 16);
  assert.equal(dnd5eAdapter.itemSaveDc(item, "save"), 16);
  assert.equal(dnd5eAdapter.itemSaveDc(item, "attack"), "");
  assert.equal(dnd5eAdapter.itemAttackBonus(item, "attack"), "+7");
  assert.equal(dnd5eAdapter.itemAttackBonus(item, "save"), "");
});

test("D&D adapter reads native standard and pact spell-slot pools", () => {
  const actor = {
    system: {
      spells: {
        spell2: { value: 1, max: 3 },
        pact: { level: 2, value: 2, max: 2 }
      }
    }
  };
  assert.deepEqual(dnd5eAdapter.spellSlots(actor, 2), [
    [1, 3, "spell2"],
    [2, 2, "pact"]
  ]);
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

test("sharing a D&D item posts its description card without using the item", async () => {
  let cards = 0;
  const item = {
    displayCard: () => ++cards,
    use: () => assert.fail("sharing must not use the item")
  };
  assert.equal(
    await dnd5eAdapter.showItemDescription(item, { event: { shiftKey: true } }),
    1
  );
  assert.equal(cards, 1);
});
