import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { createGmActions } from "../scripts/hud/gm/gm-actions.js";
import { renderGmCombatHeader } from "../scripts/hud/gm/gm-combat.js";
import { itemCollection, escapeHTML, fragment } from "./helpers/rendering.mjs";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

function fixture(started = true) {
  installSettings({ isGM: true });
  globalThis.CONFIG = { specialStatusEffects: { DEFEATED: "dead" } };
  const writes = [];
  const scene = { id: "scene" };
  const entries = ["one", "two", "player", "companion"].map(id => {
    const actor = {
      type: id === "player" ? "character" : "npc",
      isOwner: true
    };
    const token = {
      id,
      uuid: `Scene.scene.Token.${id}`,
      parent: scene,
      actor,
      isOwner: true,
      hidden: true,
      async update(change) {
        writes.push([id, change]);
        Object.assign(this, change);
      }
    };
    return {
      id,
      name: id,
      sceneId: scene.id,
      tokenId: id,
      actor,
      token,
      players: id === "companion" ? [{ isGM: false }] : []
    };
  });
  scene.tokens = itemCollection(entries.map(entry => entry.token));
  globalThis.canvas = { scene };
  foundry.utils = { escapeHTML };
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  const combat = {
    started,
    combatants: itemCollection(entries),
    turns: entries,
    combatant: entries[0]
  };
  let current = true;
  const controller = {
    isGM: () => game.user.isGM,
    getCombat: () => combat,
    roster: () => entries,
    combats: () => [combat],
    memory: {}
  };
  const actions = createGmActions({
    gmController: controller,
    isSessionCurrent: () => current,
    performSceneAction: callback => callback(),
    t: key => key
  });
  return {
    entries,
    scene,
    combat,
    controller,
    actions,
    writes,
    dispose: () => {
      current = false;
    }
  };
}

test("Hidden controls use exact owned NPC tokens in preparation and combat, protecting players and companions", async () => {
  for (const started of [false, true]) {
    const f = fixture(started);
    const root = fragment(
      renderGmCombatHeader({
        controller: f.controller,
        selectedId: "one",
        t: key => key,
        escapeHTML,
        adapter: { combatStats: () => ({ hp: { value: 3, max: 5 } }) }
      })
    );
    assert.equal(root.querySelectorAll('[data-action="gmhidden"]').length, 2);
    assert.equal(
      root
        .querySelector('[data-action="gmhidden"]')
        .getAttribute("aria-pressed"),
      "true"
    );
    assert.ok(root.querySelector('[data-action="gmrevealhidden"]'));
    await f.actions.gmhidden(null, { dataset: { combatantId: "one" } });
    assert.deepEqual(f.writes, [["one", { hidden: false }]]);
    await new Promise(resolve => setTimeout(resolve, 270));
    await f.actions.gmhidden(null, { dataset: { combatantId: "one" } });
    assert.deepEqual(f.writes[1], ["one", { hidden: true }]);
    for (const id of ["player", "companion", "missing"])
      await f.actions.gmhidden(null, { dataset: { combatantId: id } });
    f.entries[0].token.isOwner = false;
    await f.actions.gmhidden(null, { dataset: { combatantId: "one" } });
    assert.equal(f.writes.length, 2);
    game.user.isGM = false;
    await f.actions.gmhidden(null, { dataset: { combatantId: "two" } });
    assert.equal(f.writes.length, 2);
  }
});

test("Show all hidden confirms and affects only current encounter NPC tokens", async () => {
  const f = fixture();
  const outsider = { ...f.entries[0].token, id: "outside" };
  f.scene.tokens.set(outsider.id, outsider);
  foundry.applications.api.DialogV2.confirm = async () => false;
  await f.actions.gmrevealhidden();
  assert.deepEqual(f.writes, []);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await f.actions.gmrevealhidden();
  assert.deepEqual(f.writes, [
    ["one", { hidden: false }],
    ["two", { hidden: false }]
  ]);
  assert.equal(outsider.hidden, true);
  assert.equal(f.entries[2].token.hidden, true);
  assert.equal(f.entries[3].token.hidden, true);
});

test("Hidden and Defeated reject rapid toggles until native writes settle and the pause ends", async () => {
  for (const action of ["gmhidden", "gmdefeated"]) {
    const f = fixture();
    const entry = f.entries[0],
      token = entry.token;
    entry.defeated = false;
    entry.actor.statuses = new Set();
    const native = [];
    let finish;
    const deferred = new Promise(resolve => {
      finish = resolve;
    });
    token.update = async change => {
      native.push(change);
      await deferred;
      Object.assign(token, change);
    };
    entry.actor.toggleStatusEffect = async (status, { active }) => {
      native.push({ status, active });
      await deferred;
      if (active) entry.actor.statuses.add(status);
      else entry.actor.statuses.delete(status);
    };
    entry.update = async change => {
      Object.assign(entry, change);
    };
    const target = { dataset: { combatantId: entry.id } };
    const pending = f.actions[action](null, target);
    await f.actions[action](null, target);
    assert.equal(native.length, 1);
    finish();
    await pending;
    await f.actions[action](null, target);
    assert.equal(native.length, 1);
    await pause(270);
    await f.actions[action](null, target);
    assert.equal(native.length, 2);
    if (action === "gmhidden") assert.equal(token.hidden, true);
    else {
      assert.equal(entry.defeated, false);
      assert.equal(entry.actor.statuses.has("dead"), false);
    }
  }
});

test("roster Ping and To token target their own card without changing the inspected creature", async () => {
  const f = fixture();
  const calls = [];
  const centers = new Map(
    f.entries.map((entry, index) => [entry.tokenId, { x: index * 10, y: 30 }])
  );
  canvas.tokens = {
    get: id => ({
      center: centers.get(id),
      control: options => calls.push([id, options])
    })
  };
  canvas.ping = center => calls.push(["ping", center]);
  canvas.animatePan = center => calls.push(["pan", center]);
  f.controller.sync = () => {
    assert.fail("a roster navigation button changed selection");
  };
  await f.actions.gmping(null, { dataset: { combatantId: "two" } });
  await f.actions.gmcenter(null, { dataset: { combatantId: "one" } });
  assert.deepEqual(calls, [
    ["ping", centers.get("two")],
    ["one", { releaseOthers: true }],
    ["pan", centers.get("one")]
  ]);
  f.entries[0].token = { ...f.entries[0].token };
  await f.actions.gmping(null, { dataset: { combatantId: "one" } });
  assert.equal(calls.length, 3);
});

test("Show all hidden rechecks permissions, exact documents and scene after confirmation and each native update", async () => {
  for (const change of [
    "scene",
    "session",
    "permission",
    "replacement",
    "mid-batch"
  ]) {
    const f = fixture();
    foundry.applications.api.DialogV2.confirm = async () => {
      if (change === "scene") canvas.scene = { ...f.scene };
      if (change === "session") f.dispose();
      if (change === "permission") game.user.isGM = false;
      if (change === "replacement")
        f.scene.tokens.set("one", { ...f.entries[0].token });
      return true;
    };
    if (change === "mid-batch")
      f.entries[0].token.update = async value => {
        f.writes.push(["one", value]);
        f.dispose();
      };
    await f.actions.gmrevealhidden();
    assert.deepEqual(
      f.writes,
      change === "replacement"
        ? [["two", { hidden: false }]]
        : change === "mid-batch"
          ? [["one", { hidden: false }]]
          : []
    );
  }
});
