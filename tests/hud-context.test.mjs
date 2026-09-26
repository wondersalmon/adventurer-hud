import assert from "node:assert/strict";
import test from "node:test";
import { createHudActorContext } from "../scripts/hud/actor-context.js";

test("HUD context preserves synthetic actor and exact scene token through combat changes", () => {
  const actor = {
    id: "shared",
    uuid: "Scene.scene.Token.two.Actor.shared",
    isOwner: true
  };
  const token = {
    id: "two",
    uuid: "Scene.scene.Token.two",
    parent: { id: "scene" },
    actor
  };
  actor.token = token;
  const one = {
    id: "first",
    actorId: "shared",
    tokenId: "one",
    sceneId: "scene"
  };
  const two = {
    id: "second",
    actorId: "shared",
    tokenId: "two",
    sceneId: "scene"
  };
  const combat = {
    started: true,
    combatants: new Map([
      [one.id, one],
      [two.id, two]
    ]),
    combatant: two
  };
  two.parent = combat;
  let selectedCombat = combat;
  const context = createHudActorContext({
    actor,
    getCombat: () => selectedCombat
  });
  assert.equal(context.actor, actor);
  assert.equal(context.token, token);
  assert.equal(context.tokenUuid, token.uuid);
  assert.equal(context.getCombatState().combatant, two);
  assert.equal(context.getCombatState().canEndTurn, true);
  actor.isOwner = false;
  assert.equal(context.getCombatState().canEndTurn, false);
  assert.equal(context.isCurrentCombatant(two), true);
  assert.equal(context.isCurrentCombatant({ ...two, parent: {} }), false);
  combat.combatants.delete(two.id);
  assert.equal(context.getCombatState().combatant, null);
  assert.equal(context.getCombatState().canEndTurn, false);
  assert.equal(context.isCurrentCombatant(two), false);
  selectedCombat = null;
  assert.equal(context.getCombatState().isActive, false);
});
