import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";

restoreGlobalsAfterEach();

async function gmFixture() {
  const f = await hudFixture({ isGM: true });
  canvas.scene = { id: "scene" };
  let deletes = 0,
    ends = 0;
  const actor = { ...f.actor, type: "npc", statuses: new Set(["dead"]) };
  const token = {
    id: "npc",
    uuid: "Scene.scene.Token.npc",
    parent: canvas.scene,
    actor,
    delete: async () => {
      deletes++;
      return token;
    }
  };
  const entry = {
    id: "npc",
    actorId: actor.id,
    actor,
    token,
    tokenId: token.id,
    sceneId: "scene",
    players: [],
    initiative: 10,
    defeated: true
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    round: 1,
    turn: 0,
    combatant: entry,
    turns: [entry],
    combatants: itemCollection([entry]),
    endCombat: async () => ends++
  };
  entry.parent = combat;
  canvas.scene.tokens = itemCollection([token]);
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  return { ...f, combat, token, entry, counts: () => ({ deletes, ends }) };
}

test("unmarking defeat refreshes gray styling and preserves native creature controls", async () => {
  const f = await gmFixture();
  const app = __adventurerHud.app;
  assert.ok(app.element.querySelector(".ws-gm-dead"));
  let saves = 0;
  f.token.actor.rollSavingThrow = async () => {
    saves++;
  };
  f.token.actor.toggleStatusEffect = async (status, { active }) => {
    if (active) f.token.actor.statuses.add(status);
    else f.token.actor.statuses.delete(status);
    f.hooks.callAll("updateActor", f.token.actor, {
      statuses: [...f.token.actor.statuses]
    });
  };
  f.entry.update = async change => {
    Object.assign(f.entry, change);
    f.hooks.callAll("updateCombatant", f.entry, change);
  };
  await app.hudActions.gmdefeated(null, {
    dataset: { combatantId: f.entry.id }
  });
  f.flushFrames();
  assert.equal(f.entry.defeated, false);
  assert.equal(f.token.actor.statuses.has("dead"), false);
  assert.equal(app.element.querySelector(".ws-gm-dead"), null);
  assert.equal(app.element.querySelector('[data-action="gmremove"]'), null);
  const save = app.element.querySelector(
    '.ws-gm-saves [data-action="ability"]'
  );
  assert.ok(save);
  assert.equal(save.disabled, false);
  await app.hudActions.ability(
    { type: "click" },
    { dataset: { key: "str", type: "save" } }
  );
  assert.equal(saves, 1);
  await app.close();
});

test("external token deletion removes a stale initiative card and releases the selected creature", async () => {
  const f = await gmFixture();
  canvas.scene.tokens.delete(f.token.id);
  // Simulate an integration that has not yet removed its native combatant.
  f.hooks.callAll("deleteToken", f.token);
  await waitFor(
    () => __adventurerHud.actor === null && __adventurerHud.app?.rendered
  );
  assert.equal(
    __adventurerHud.app.element.querySelector(
      '.ws-gm-creature[data-combatant-id="npc"]'
    ),
    null
  );
  await __adventurerHud.app.close();
});

for (const transition of ["close", "replace", "combat", "scene"]) {
  test(`GM confirmation rejects ${transition} while valid empty-panel commands still work`, async () => {
    const f = await gmFixture();
    const app = __adventurerHud.app;
    const saved = app.hudActions;
    let confirm;
    foundry.applications.api.DialogV2.confirm = () =>
      new Promise(resolve => {
        confirm = resolve;
      });
    const pending = saved.gmremovedead();
    await waitFor(() => Boolean(confirm));
    if (transition === "close") await app.close();
    if (transition === "replace") await f.api.open();
    if (transition === "combat") {
      game.combat = { ...f.combat, id: "another" };
      game.combats.set("another", game.combat);
      __adventurerHud.gm.combatId = "another";
    }
    if (transition === "scene") canvas.scene = { id: "another" };
    confirm(true);
    await pending;
    assert.equal(f.counts().deletes, 0);
    if (transition === "close" || transition === "replace") {
      await saved.gmendcombat();
      assert.equal(f.counts().ends, 0);
    }
    await __adventurerHud.app?.close();
    canvas.scene = f.token.parent;
    game.combat = f.combat;
    game.combats = itemCollection([f.combat]);
    f.combat.turns = [];
    f.combat.combatants = itemCollection();
    __adventurerHud.gm.combatId = f.combat.id;
    await f.api.open();
    const empty = __adventurerHud.app;
    await empty.hudActions.gmendcombat();
    assert.equal(f.counts().ends, 1);
    const emptyActions = empty.hudActions;
    await empty.close();
    await emptyActions.gmendcombat();
    assert.equal(f.counts().ends, 1);
  });
}

test("queued GM removal rechecks session before each native token deletion", async () => {
  const f = await gmFixture();
  const app = __adventurerHud.app;
  const secondToken = {
    ...f.token,
    id: "second",
    uuid: "Scene.scene.Token.second",
    delete: async () => assert.fail("closed session deleted second token")
  };
  const second = {
    ...f.entry,
    id: "second",
    token: secondToken,
    tokenId: secondToken.id
  };
  canvas.scene.tokens.set(secondToken.id, secondToken);
  f.combat.turns.push(second);
  f.combat.combatants.set(second.id, second);
  f.token.delete = async () => {
    await app.close();
    return f.token;
  };
  foundry.applications.api.DialogV2.confirm = async () => true;
  await app.hudActions.gmremovedead();
});

test("native removal hooks defer automatic selection until the valid batch finishes", async () => {
  const f = await gmFixture();
  const app = __adventurerHud.app;
  const deleted = [];
  const secondToken = {
    ...f.token,
    id: "second",
    uuid: "Scene.scene.Token.second"
  };
  const second = {
    ...f.entry,
    id: "second",
    token: secondToken,
    tokenId: "second"
  };
  canvas.scene.tokens.set(secondToken.id, secondToken);
  f.combat.turns.push(second);
  f.combat.combatants.set(second.id, second);
  for (const entry of [f.entry, second]) {
    entry.token.delete = async () => {
      deleted.push(entry.id);
      f.combat.turns = f.combat.turns.filter(other => other !== entry);
      f.combat.combatants.delete(entry.id);
      f.hooks.callAll("deleteCombatant", entry);
      await Promise.resolve();
      return entry.token;
    };
  }
  foundry.applications.api.DialogV2.confirm = async () => true;
  await app.hudActions.gmremovedead();
  assert.deepEqual(deleted, ["npc", "second"]);
  await waitFor(
    () => __adventurerHud.actor === null && __adventurerHud.app?.rendered
  );
  await __adventurerHud.app.close();
});

for (const companions of [false, true]) {
  test(`world Actor replacement recovers current data and search (companions=${companions})`, async () => {
    const f = await hudFixture({
      values: { showCompanions: companions, showSearch: true }
    });
    await f.api.open(f.actor);
    const old = __adventurerHud.app;
    const input = old.element.querySelector('[data-action="searchitems"]');
    input.value = "preserved";
    input.dispatchEvent(
      new document.defaultView.Event("input", { bubbles: true })
    );
    const actor = {
      ...f.actor,
      system: {
        ...f.actor.system,
        attributes: {
          ...f.actor.system.attributes,
          hp: { value: 3, max: 20, temp: 0 }
        }
      }
    };
    game.actors.set(actor.id, actor);
    f.hooks.callAll("updateActor", actor, { "system.attributes.hp.value": 3 });
    await waitFor(
      () => __adventurerHud.actor === actor && __adventurerHud.app?.rendered
    );
    assert.match(__adventurerHud.app.element.textContent, /3\/20/);
    assert.equal(
      __adventurerHud.app.element.querySelector('[data-action="searchitems"]')
        .value,
      "preserved"
    );
    assert.notEqual(__adventurerHud.app, old);
    await __adventurerHud.app.close();
  });
}

test("synthetic replacement keeps exact token even when another token of the base Actor is controlled", async () => {
  const f = await hudFixture({ values: { showCompanions: false } });
  canvas.scene = { id: "scene" };
  const actor = {
    ...f.actor,
    uuid: "Scene.scene.Token.one.Actor.hero",
    isToken: true
  };
  const one = {
    id: "one",
    uuid: "Scene.scene.Token.one",
    parent: canvas.scene,
    actor
  };
  const two = {
    id: "two",
    uuid: "Scene.scene.Token.two",
    parent: canvas.scene,
    actor: { ...actor, uuid: "Scene.scene.Token.two.Actor.hero" }
  };
  canvas.scene.tokens = itemCollection([one, two]);
  canvas.tokens.controlled = [one];
  await f.api.open(actor);
  const next = {
    ...actor,
    system: {
      ...actor.system,
      attributes: {
        ...actor.system.attributes,
        hp: { value: 4, max: 20, temp: 0 }
      }
    }
  };
  one.actor = next;
  canvas.tokens.controlled = [two];
  f.hooks.callAll("updateActor", next, { "system.attributes.hp.value": 4 });
  await waitFor(
    () => __adventurerHud.actor === next && __adventurerHud.app?.rendered
  );
  assert.equal(__adventurerHud.tokenUuid, one.uuid);
  assert.match(__adventurerHud.app.element.textContent, /4\/20/);
  await __adventurerHud.app.close();
});

test("Actor recovery queued behind another opening does not reopen a closed HUD", async () => {
  const f = await hudFixture({ values: { showCompanions: false } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const next = { ...f.actor };
  game.actors.set(next.id, next);
  f.hooks.callAll("updateActor", next, {});
  await app.close();
  // Drain the sole opening queue with a rejected recovery request.
  await f.api.open(next, null, {
    token: null,
    hudState: {},
    isCurrent: () => false
  });
  assert.equal(__adventurerHud.app, null);
});

test("GM ignores foreign biography/items/effects and another combat but refreshes relevant roster and selection", async () => {
  const f = await gmFixture();
  const original = dnd5eAdapter.combatItemsByCategory;
  let builds = 0;
  dnd5eAdapter.combatItemsByCategory = (...args) => {
    builds++;
    return original(...args);
  };
  try {
    const foreign = { id: "foreign", uuid: "Actor.foreign" };
    f.hooks.callAll("updateActor", foreign, {
      "system.details.biography.value": "text"
    });
    f.hooks.callAll("updateItem", { parent: foreign }, { name: "other" });
    f.hooks.callAll("updateActiveEffect", { parent: foreign }, {});
    f.hooks.callAll(
      "updateCombat",
      { id: "other", combatants: itemCollection() },
      { round: 2 }
    );
    await Promise.resolve();
    f.flushFrames();
    assert.equal(builds, 0);
    f.hooks.callAll("updateActor", f.token.actor, {
      "system.attributes.hp.value": 5
    });
    await Promise.resolve();
    f.flushFrames();
    assert.equal(builds, 1);
    builds = 0;
    f.hooks.callAll("updateCombat", f.combat, { round: 2 });
    await Promise.resolve();
    f.flushFrames();
    assert.equal(builds, 1);
    f.combat.turns = [];
    f.combat.combatants = itemCollection();
    f.hooks.callAll("deleteCombatant", f.entry);
    await waitFor(
      () => __adventurerHud.actor === null && __adventurerHud.app?.rendered
    );
  } finally {
    dnd5eAdapter.combatItemsByCategory = original;
    await __adventurerHud.app?.close();
  }
});

test("status buttons remove via Ctrl+Enter/Space and reject plain/repeated/denied/stale keyboard events", async () => {
  const f = await hudFixture();
  CONFIG.statusEffects = [{ id: "poisoned", name: "Poisoned" }];
  f.actor.statuses = new Set(["poisoned"]);
  let removals = 0;
  f.actor.toggleStatusEffect = async () => {
    removals++;
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const send = (key, ctrlKey = true, repeat = false) => {
    const button = app.element.querySelector('[data-status-id="poisoned"]');
    assert.equal(button.tagName, "BUTTON");
    const event = new document.defaultView.Event("keydown", {
      bubbles: true,
      cancelable: true
    });
    Object.assign(event, { key, ctrlKey, repeat });
    button.dispatchEvent(event);
    return event;
  };
  send("Enter", false);
  send(" ", true, true);
  assert.equal(removals, 0);
  assert.equal(send("Enter").defaultPrevented, true);
  await waitFor(() => removals === 1);
  f.flushFrames();
  await delay(700);
  send(" ");
  await waitFor(() => removals === 2);
  f.flushFrames();
  f.actor.isOwner = false;
  send("Enter");
  const saved = app.hudActions;
  await app.close();
  f.actor.isOwner = true;
  await saved.removestatus(
    { type: "keydown", key: "Enter", ctrlKey: true },
    { dataset: { statusId: "poisoned" } }
  );
  assert.equal(removals, 2);
});
