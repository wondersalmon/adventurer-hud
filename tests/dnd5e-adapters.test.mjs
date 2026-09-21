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
  isPreparedSpell,
  itemActivation,
  itemRangeData
} from "../scripts/dnd5e/items.js";

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
