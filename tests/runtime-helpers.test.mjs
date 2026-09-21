import assert from "node:assert/strict";
import test from "node:test";

import {
  actorContextChanged,
  calculateResourceValue,
  findCombatant,
  tokenForActor
} from "../scripts/runtime-helpers.js";

test("actor context changes when the selected token changes", () => {
  const current = { actorUuid: "Actor.a", tokenUuid: "Scene.s.Token.one" };

  assert.equal(
    actorContextChanged(current, {
      actorUuid: "Actor.a",
      tokenUuid: "Scene.s.Token.two"
    }),
    true
  );
  assert.equal(
    actorContextChanged(current, { actorUuid: "Actor.a", tokenUuid: null }),
    true
  );
  assert.equal(actorContextChanged(current, { ...current }), false);
});

test("an actor override never inherits an unrelated selected token", () => {
  const token = { actor: { uuid: "Actor.selected" } };

  assert.equal(tokenForActor(token, { uuid: "Actor.selected" }), token);
  assert.equal(tokenForActor(token, { uuid: "Actor.override" }), null);
  assert.equal(tokenForActor(null, { uuid: "Actor.override" }), null);
});

test("combatant lookup prefers the selected token and falls back to actor", () => {
  const combatants = [
    { id: "one", actorId: "actor", tokenId: "token-one" },
    { id: "two", actorId: "actor", tokenId: "token-two" }
  ];

  assert.equal(
    findCombatant(combatants, {
      actorId: "actor",
      tokenId: "token-two"
    })?.id,
    "two"
  );
  assert.equal(findCombatant(combatants, { actorId: "actor" })?.id, "one");
  assert.equal(findCombatant(combatants, { actorId: "missing" }), null);
});

test("resource changes are clamped and maxless resources cannot be restored", () => {
  assert.equal(
    calculateResourceValue({
      amount: 3,
      current: 2,
      direction: "consume",
      max: 5
    }),
    0
  );
  assert.equal(
    calculateResourceValue({
      amount: 4,
      current: 3,
      direction: "restore",
      max: 5
    }),
    5
  );
  assert.equal(
    calculateResourceValue({
      amount: 1,
      current: 3,
      direction: "restore",
      max: 0
    }),
    null
  );
});
