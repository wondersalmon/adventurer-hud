import assert from "node:assert/strict";
import test from "node:test";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

function initiativeFixture({ linked = true } = {}) {
  installSettings();
  const rolls = [],
    messages = [],
    hooks = [];
  const actor = {
    id: "hero",
    uuid: "Actor.hero",
    isOwner: true,
    getInitiativeRoll: options => {
      const roll = { total: 17, options };
      rolls.push([actor, options, roll]);
      return roll;
    },
    rollInitiative: () =>
      assert.fail("Exact initiative must not target all actor tokens")
  };
  const tokens = ["first", "second"].map(id => {
    const nativeActor = linked
      ? actor
      : {
          ...actor,
          uuid: `Scene.scene.Token.${id}.Actor.hero`,
          isToken: true,
          getInitiativeRoll: options => {
            const roll = { total: 17, options };
            rolls.push([nativeActor, options, roll]);
            return roll;
          }
        };
    return { id, actor: nativeActor, baseActor: actor };
  });
  const combatants = new Map(
    tokens.map(token => [
      token.id,
      {
        id: token.id,
        token,
        actor: token.actor,
        isOwner: true,
        initiative: null,
        getInitiativeRoll() {
          return this.actor.getInitiativeRoll();
        }
      }
    ])
  );
  const calls = [];
  const combat = {
    combatants,
    async rollInitiative(ids, options) {
      calls.push([ids, options]);
      for (const id of ids) {
        const combatant = combatants.get(id);
        const roll = combatant.getInitiativeRoll();
        messages.push(roll);
        combatant.initiative = roll.total;
      }
      return combat;
    }
  };
  for (const combatant of combatants.values()) combatant.parent = combat;
  game.combat = combat;
  globalThis.Hooks = {
    call: (name, ...args) => {
      hooks.push([name, ...args]);
      return true;
    },
    callAll: (name, ...args) => hooks.push([name, ...args])
  };
  return { actor, tokens, combatants, combat, calls, rolls, messages, hooks };
}

for (const linked of [true, false]) {
  test(`native initiative addresses only the selected ${linked ? "linked" : "unlinked"} combatant and preserves modifiers`, async () => {
    for (const event of [
      { altKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      {}
    ]) {
      const f = initiativeFixture({ linked });
      const selected = f.combatants.get("second");
      const original = selected.getInitiativeRoll;
      const result = await dnd5eAdapter.rollInitiative(selected.actor, {
        combatant: selected,
        event
      });
      assert.equal(result, f.combat);
      assert.equal(f.combatants.get("first").initiative, null);
      assert.equal(selected.initiative, 17);
      assert.deepEqual(f.calls, [[["second"], { updateTurn: true }]]);
      assert.equal(f.rolls[0][1].event, event);
      assert.equal(f.rolls[0][1].advantage, event.altKey ? true : undefined);
      assert.equal(
        f.rolls[0][1].disadvantage,
        event.ctrlKey ? true : undefined
      );
      assert.equal(f.messages[0], f.rolls[0][2]);
      assert.equal(selected.getInitiativeRoll, original);
      assert.deepEqual(
        f.hooks.map(call => call[0]),
        ["dnd5e.preRollInitiative", "dnd5e.rollInitiative"]
      );
      assert.deepEqual(f.hooks[1][2], [selected]);
    }
  });
}

test("world sheet initiative uses the chosen synthetic token's native roll", async () => {
  const f = initiativeFixture({ linked: false });
  await dnd5eAdapter.rollInitiative(f.actor, {
    combatant: f.combatants.get("second")
  });
  assert.equal(f.rolls[0][0], f.tokens[1].actor);
  assert.equal(f.combatants.get("first").initiative, null);
});

test("native initiative cancellation and missing permissions leave the encounter unchanged", async () => {
  const f = initiativeFixture();
  const selected = f.combatants.get("second");
  const original = selected.getInitiativeRoll;
  Hooks.call = () => false;
  assert.equal(
    await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected }),
    null
  );
  assert.deepEqual(f.calls, []);
  assert.equal(selected.getInitiativeRoll, original);
  Hooks.call = () => true;
  selected.isOwner = false;
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected });
  selected.isOwner = true;
  selected.initiative = 9;
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected });
  selected.initiative = null;
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: { ...selected } });
  assert.deepEqual(f.calls, []);
  Hooks.call = () => {
    selected.isOwner = false;
    return true;
  };
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected });
  assert.deepEqual(f.calls, []);
});

test("native initiative preserves a newer module wrapper without retaining the prepared roll", async () => {
  const f = initiativeFixture();
  const selected = f.combatants.get("second");
  let newer;
  const native = f.combat.rollInitiative;
  f.combat.rollInitiative = async (...args) => {
    const captured = selected.getInitiativeRoll;
    newer = function (...params) {
      return captured.apply(this, params);
    };
    selected.getInitiativeRoll = newer;
    return native(...args);
  };
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected });
  assert.equal(selected.getInitiativeRoll, newer);
  assert.equal(f.rolls.length, 1);
  const subsequent = selected.getInitiativeRoll();
  assert.equal(f.rolls.length, 2);
  assert.notEqual(subsequent, f.messages[0]);
});

test("failed native initiative restores the combatant method and can retry", async () => {
  const f = initiativeFixture();
  const selected = f.combatants.get("second");
  const original = selected.getInitiativeRoll;
  const native = f.combat.rollInitiative;
  f.combat.rollInitiative = async () => {
    throw new Error("native failure");
  };
  await assert.rejects(
    dnd5eAdapter.rollInitiative(f.actor, { combatant: selected }),
    /native failure/
  );
  assert.equal(selected.getInitiativeRoll, original);
  f.combat.rollInitiative = native;
  await dnd5eAdapter.rollInitiative(f.actor, { combatant: selected });
  assert.equal(selected.initiative, 17);
});

test("simultaneous exact initiative requests share one native roll", async () => {
  const f = initiativeFixture();
  const selected = f.combatants.get("second");
  await Promise.all([
    dnd5eAdapter.rollInitiative(f.actor, { combatant: selected }),
    dnd5eAdapter.rollInitiative(f.actor, { combatant: selected })
  ]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.rolls.length, 1);
});
