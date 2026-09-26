import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dnd5eAdapter as adapter } from "../scripts/dnd5e/index.js";
import { registerGmLifecycle } from "../scripts/hud/gm-lifecycle.js";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { createHudActions } from "../scripts/hud/actions.js";
import {
  deadCreatures,
  createSceneCombat,
  addGmCreatures,
  addSceneCreatures,
  removeDeadCreatures,
  moveToCreature
} from "../scripts/hud/gm-scene.js";
import {
  fragment,
  itemCollection,
  itemRendererFixture
} from "./helpers/rendering.mjs";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();

const exported = JSON.parse(
  await readFile(new URL("fixtures/gm-npcs.json", import.meta.url), "utf8")
);
function npc(key) {
  const actor = structuredClone(exported[key]);
  actor.isOwner = true;
  for (const item of actor.items) {
    for (const activity of Object.values(item.system.activities ?? {})) {
      activity.id = activity._id;
      activity.use = async () => {};
    }
  }
  actor.items = itemCollection(actor.items);
  return actor;
}

test("Cultist spellbook excludes native Cast caches and routes casting and charges to the source feature", () => {
  installSettings({ isGM: true });
  globalThis.CONFIG = { DND5E: {} };
  const actor = npc("cultist");
  const spells = adapter.combatItems(actor, "spells");
  assert.equal(spells.length, 3);
  assert.deepEqual(
    adapter.combatItemsByCategory(actor, ["spells"]).get("spells"),
    spells
  );
  const counterspell = spells.find(item => item.name === "Counterspell");
  const usage = adapter.itemUsageTarget(actor, counterspell);
  assert.equal(usage.item.type, "feat");
  assert.equal(usage.activityId, "dnd5eactivity000");
  usage.item.system.uses.spent = 2;
  assert.deepEqual(
    adapter.itemResourceData(actor, usage.item, usage.activityId),
    { max: 2, value: 0 }
  );
  const { renderer } = itemRendererFixture({
    adapter,
    items: [...actor.items.values()],
    options: {},
    actor,
    visibility: { gm: true, itemDetails: false },
    hudState: { combatCategory: "features" }
  });
  const card = fragment(renderer.combatItemButton(counterspell));
  assert.equal(
    card.querySelector('[data-action="useactivity"]').dataset.itemId,
    usage.item.id
  );
  assert.match(card.textContent, /0\/2/);
  actor.items.set("another", { ...counterspell, id: "another" });
  assert.equal(adapter.combatItems(actor, "spells").length, 4);
});

test("Tarrasque displays legendary pools, all native speeds, damage traits and feature consumption", () => {
  installSettings();
  globalThis.CONFIG = {
    DND5E: {
      movementTypes: {
        walk: "Walk",
        burrow: "Burrow",
        climb: "Climb",
        fly: "Fly"
      },
      damageTypes: { fire: { label: "Fire" } },
      conditionTypes: { charmed: { name: "Charmed", img: "charmed.svg" } }
    }
  };
  const actor = npc("tarrasque");
  game.i18n.localize = key => {
    assert.equal(
      typeof key,
      "string",
      "Foundry localization requires a string key"
    );
    return key;
  };
  assert.deepEqual(adapter.npcResource(actor, "legres"), { max: 6, value: 6 });
  actor.system.resources.legres.spent = 6;
  assert.equal(adapter.npcResource(actor, "legres").value, 0);
  const resistance = [...actor.items.values()].find(
    item => item.name === "Legendary Resistance"
  );
  assert.equal(adapter.itemResourceData(actor, resistance).value, 0);
  assert.equal(adapter.legendaryResistanceUsage(actor).itemId, resistance.id);
  assert.equal(adapter.npcMovement(actor).primary, "60 ft");
  assert.doesNotMatch(adapter.npcMovement(actor).secondary, /Walk/);
  assert.match(adapter.movementSummary(actor), /Walk 60 ft/);
  assert.match(adapter.movementSummary(actor), /Burrow 40 ft/);
  assert.match(adapter.movementSummary(actor), /Climb 60 ft/);
  assert.match(
    adapter
      .npcTraits(actor)
      .find(trait => trait.title === "GM.DamageImmunities").text,
    /Fire/
  );
  assert.match(
    adapter
      .npcTraits(actor)
      .find(trait => trait.title === "GM.ConditionImmunities").text,
    /Charmed/
  );
  actor.system.attributes.movement = {
    walk: 30,
    fly: 60,
    swim: 0,
    hover: true,
    units: "ft"
  };
  assert.match(adapter.movementSummary(actor), /Fly 60 ft.*Hover/);
  assert.doesNotMatch(adapter.movementSummary(actor), /swim/);
});

test("GM attack DC setting is independent of item details, and special sections use exact activities", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const actor = npc("tarrasque");
  const bellow = [...actor.items.values()].find(
    item => item.name === "Thunderous Bellow"
  );
  Object.values(bellow.system.activities)[0].save = { dc: { value: 20 } };
  const { renderer, visibility } = itemRendererFixture({
    actor,
    items: [...actor.items.values()],
    adapter,
    visibility: { gm: true, attackDetails: true, itemDetails: false }
  });
  assert.match(renderer.combatItemButton(bellow), /SaveDCShort.*20/);
  visibility.attackDetails = false;
  assert.doesNotMatch(renderer.combatItemButton(bellow), /SaveDCShort/);
  const lair = {
    id: "lair",
    name: "Lair",
    type: "feat",
    system: {
      activities: [
        {
          id: "lair-use",
          name: "Lair",
          activation: { type: "lair", value: 1 },
          use() {}
        }
      ]
    }
  };
  actor.items.set(lair.id, lair);
  const html = fragment(renderer.combatActions() + renderer.gmSpecialActions());
  assert.equal(html.querySelectorAll(".ws-gm-special").length, 2);
  assert.equal(
    html.querySelectorAll('[data-action="toggleactionmenu"]').length,
    0
  );
  assert.equal(html.querySelectorAll(".ws-action-menu").length, 0);
  assert.equal(
    html.querySelector('[data-activity-id="lair-use"]').dataset.itemId,
    "lair"
  );
  assert.equal(Boolean(html.querySelector('[data-category="skills"]')), false);
});

test("removal deletes only defeated GM NPC tokens, never zero-HP living NPCs or directory actors", async () => {
  installSettings({ isGM: true });
  globalThis.CONFIG = { specialStatusEffects: { DEFEATED: "dead" } };
  const scene = { id: "scene" };
  globalThis.canvas = { scene };
  const calls = [];
  const entry = (id, dead) => ({
    id,
    sceneId: "scene",
    tokenId: id,
    players: [],
    defeated: dead,
    token: {
      actor: {
        type: "npc",
        isOwner: true,
        statuses: new Set(),
        system: { attributes: { hp: { value: 0 } } }
      }
    }
  });
  const dead = entry("dead", true),
    live = entry("live", false),
    player = entry("pet", true);
  player.players = [{ active: true, isGM: false }];
  for (const creature of [dead, live, player])
    Object.assign(creature.token, {
      id: creature.tokenId,
      parent: scene,
      uuid: `Scene.scene.Token.${creature.tokenId}`,
      delete: async () => {
        calls.push(["Token", [creature.tokenId]]);
        return creature.token;
      }
    });
  const combat = {
    scene,
    turns: [dead, live, player],
    combatants: itemCollection([dead, live, player]),
    deleteEmbeddedDocuments: async (type, ids) => calls.push([type, ids])
  };
  scene.deleteEmbeddedDocuments = async (type, ids) => calls.push([type, ids]);
  assert.deepEqual(
    deadCreatures(combat).map(entry => entry.id),
    ["dead"]
  );
  await removeDeadCreatures(combat, ["dead", "live", "pet"]);
  assert.deepEqual(calls, [["Token", ["dead"]]]);
  game.user.isGM = false;
  await removeDeadCreatures(combat, ["dead"]);
  assert.equal(calls.length, 1);
});

test("ping and centering use the chosen scene token without implicit targeting", async () => {
  installSettings({ isGM: true });
  const calls = [];
  const token = {
    center: { x: 123, y: 456 },
    control: options => calls.push(["control", options])
  };
  globalThis.canvas = {
    scene: { id: "scene" },
    tokens: { get: id => (id === "chosen" ? token : null) },
    ping: point => calls.push(["ping", point]),
    animatePan: point => calls.push(["pan", point])
  };
  const combatant = { tokenId: "chosen", sceneId: "scene" };
  await moveToCreature(combatant, { ping: true });
  assert.deepEqual(calls, [["ping", token.center]]);
  await moveToCreature(combatant);
  assert.deepEqual(calls.slice(1), [
    ["control", { releaseOthers: true }],
    ["pan", token.center]
  ]);
  await moveToCreature({ tokenId: "gone", sceneId: "scene" }, { ping: true });
  assert.equal(calls.length, 3);
});

test("combat open and close preferences are independent and ignore unrelated combat events", async () => {
  for (const open of [false, true])
    for (const close of [false, true]) {
      installSettings({
        isGM: true,
        values: {
          gmEnabled: true,
          gmOpenOnCombat: open,
          gmCloseAfterCombat: close
        }
      });
      globalThis.canvas = { scene: { id: "scene" } };
      const callbacks = new Map();
      const hooks = { on: (name, callback) => callbacks.set(name, callback) };
      let opens = 0,
        closes = 0;
      const state = {
        preset: "gm",
        gm: { combatId: "battle" },
        app: { rendered: false, close: () => closes++ }
      };
      registerGmLifecycle({
        hooks,
        getState: () => state,
        openHud: () => opens++
      });
      const combat = { id: "battle", scene: canvas.scene };
      callbacks.get("combatStart")(combat);
      assert.equal(opens, Number(open));
      state.app.rendered = true;
      callbacks.get("combatStart")(combat);
      assert.equal(opens, Number(open));
      callbacks.get("deleteCombat")({ id: "other" });
      assert.equal(closes, 0);
      callbacks.get("deleteCombat")(combat);
      assert.equal(closes, Number(close));
      game.user.isGM = false;
      state.app.rendered = false;
      callbacks.get("combatStart")(combat);
      assert.equal(opens, Number(open));
    }
});

test("GM Features follows native consumption and replacement of a synthetic Actor in the same window", async () => {
  const f = await hudFixture({ isGM: true, values: { gmEnabled: true } });
  canvas.scene = { id: "scene" };
  const actor = {
    ...f.actor,
    type: "npc",
    uuid: "Scene.scene.Token.npc.Actor.shared"
  };
  const feature = {
    id: "feature",
    name: "Counterspell",
    type: "feat",
    parent: actor,
    system: {
      uses: { max: 2, spent: 0 },
      activities: [
        {
          id: "use",
          type: "utility",
          activation: { type: "reaction" },
          use() {}
        }
      ]
    }
  };
  actor.items = itemCollection([feature]);
  const token = {
    id: "npc",
    uuid: "Scene.scene.Token.npc",
    parent: canvas.scene,
    actor
  };
  const combatant = {
    id: "npc",
    sceneId: "scene",
    tokenId: "npc",
    actorId: actor.id,
    token,
    actor,
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    turns: [combatant],
    combatant,
    combatants: itemCollection([combatant])
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  const app = __adventurerHud.app;
  assert.equal(
    app.element.querySelectorAll('.ws-gm-saves [data-type="save"]').length,
    6
  );
  assert.equal(app.element.querySelectorAll(".ws-gm-info img").length, 0);
  for (const action of ["gmprevious", "gmnext", "gmfollow"]) {
    assert.equal(
      app.element.querySelectorAll(`.ws-gm-tools [data-action="${action}"]`)
        .length,
      1
    );
    assert.equal(
      app.element.querySelectorAll(`.ws-gm-combat [data-action="${action}"]`)
        .length,
      0
    );
  }

  assert.equal(
    app.element.querySelectorAll('.ws-gm-tools [data-action="gmremovedead"]')
      .length,
    1
  );
  await app.options.actions.combatfilter(null, {
    dataset: { category: "features" }
  });
  assert.match(
    app.element.querySelector(".ws-combat-item-list").textContent,
    /2\/2/
  );
  feature.system.uses.spent = 2;
  f.hooks.callAll("dnd5e.postActivityConsumption", { item: feature });
  f.flushFrames();
  assert.match(
    app.element.querySelector(".ws-combat-item-list").textContent,
    /0\/2/
  );
  const replacement = {
    ...actor,
    items: itemCollection([
      { ...feature, system: { ...feature.system, uses: { max: 2, spent: 1 } } }
    ])
  };
  token.actor = replacement;
  f.hooks.callAll("updateToken", token);
  await waitFor(
    () =>
      __adventurerHud.actor === replacement &&
      __adventurerHud.app?.hudActions !== undefined
  );
  // The context is assigned before asynchronous component preparation finishes.
  await waitFor(() => /1\/2/.test(app.element.textContent));
  assert.equal(__adventurerHud.app, app);
  await app.close();
});

test("automatic removal reacts only to a dead creature in the selected combat and honors the preference", async () => {
  const f = installSettings({
    isGM: true,
    values: { gmEnabled: true, gmAutoRemoveDead: false }
  });
  globalThis.CONFIG = {};
  const calls = [];
  globalThis.canvas = {
    scene: {
      id: "scene",
      deleteEmbeddedDocuments: async (_type, ids) => calls.push(ids)
    }
  };
  const actor = { type: "npc", isOwner: true, uuid: "Actor.npc" };
  const entry = {
    id: "npc",
    sceneId: "scene",
    tokenId: "npc",
    token: { actor },
    defeated: true,
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    turns: [entry],
    combatants: itemCollection([])
  };
  game.combats = itemCollection([combat]);
  Object.assign(entry.token, {
    id: entry.tokenId,
    parent: canvas.scene,
    uuid: "Scene.scene.Token.npc",
    delete: async () => {
      calls.push(["npc"]);
      return entry.token;
    }
  });
  const callbacks = new Map();
  registerGmLifecycle({
    hooks: { on: (name, callback) => callbacks.set(name, callback) },
    openHud() {},
    getState: () => ({ preset: "gm", gm: { combatId: combat.id } })
  });
  await callbacks.get("updateActor")(actor);
  assert.deepEqual(calls, []);
  f.current.set("gmAutoRemoveDead", true);
  await callbacks.get("updateActor")({ uuid: "Actor.unrelated" });
  assert.deepEqual(calls, []);
  await callbacks.get("updateActor")(actor);
  assert.deepEqual(calls, [["npc"]]);
});

test("Remove defeated confirms, uses the scene queue, and preserves combatants when token deletion is cancelled", async () => {
  installSettings({ isGM: true });
  const scene = { id: "scene" };
  globalThis.canvas = { scene };
  let deletes = 0,
    confirms = 0;
  const token = {
    id: "npc",
    parent: scene,
    uuid: "Scene.scene.Token.npc",
    actor: { type: "npc", isOwner: true },
    delete: async () => {
      deletes++;
      return token;
    }
  };
  const combatant = {
    id: "npc",
    tokenId: token.id,
    sceneId: scene.id,
    defeated: true,
    token,
    players: []
  };
  const combat = { turns: [combatant], combatants: itemCollection([]) };
  foundry.utils = { escapeHTML: text => text };
  foundry.applications.api.DialogV2 = {
    confirm: async () => {
      confirms++;
      return true;
    }
  };
  const actions = createHudActions({
    gmController: { isGM: () => true, getCombat: () => combat },
    t: key => key,
    performAndRefresh: () => assert.fail("actor roll queue used"),
    performSceneAction: callback => callback()
  });
  await actions.gmremovedead();
  assert.equal(confirms, 1);
  assert.equal(deletes, 1);
  token.delete = async () => null;
  combat.combatants = itemCollection([combatant]);
  combat.deleteEmbeddedDocuments = () =>
    assert.fail("undeleted token removed from initiative");
  assert.equal(await removeDeadCreatures(combat, [combatant.id]), 0);
  game.user.isGM = false;
  await actions.gmremovedead();
  assert.equal(confirms, 1);
});

test("explicit turn arrows select the native current NPC even when following is disabled", async () => {
  installSettings({ isGM: true });
  const calls = [];
  const combat = {
    started: true,
    previousTurn: async () => calls.push("previous"),
    nextTurn: async () => calls.push("next")
  };
  const actions = createHudActions({
    gmController: {
      isGM: () => true,
      getCombat: () => combat,
      sync: options => calls.push(options)
    },
    performAndRefresh: callback => callback(),
    openGmSelection: async () => calls.push("selection")
  });
  await actions.gmprevious();
  await actions.gmnext();
  assert.deepEqual(calls, [
    "previous",
    { forceFollow: true },
    "selection",
    "next",
    { forceFollow: true },
    "selection"
  ]);
});

test("manual and automatic removal share a queue and recheck deleted combatants", async () => {
  installSettings({ isGM: true });
  globalThis.canvas = { scene: { id: "scene" } };
  const calls = [];
  const combat = { combatants: itemCollection([]), turns: [] };
  for (const id of ["a", "b"]) {
    const entry = {
      id,
      tokenId: id,
      sceneId: "scene",
      defeated: true,
      players: [],
      token: { id, parent: canvas.scene, actor: { type: "npc", isOwner: true } }
    };
    entry.token.delete = async () => {
      calls.push(id);
      await new Promise(resolve => setTimeout(resolve, 5));
      combat.combatants.delete(id);
      combat.turns = combat.turns.filter(value => value.id !== id);
      return entry.token;
    };
    combat.combatants.set(id, entry);
    combat.turns.push(entry);
  }
  const counts = await Promise.all([
    removeDeadCreatures(combat, ["a"]),
    removeDeadCreatures(combat, ["a", "b"])
  ]);
  assert.deepEqual(counts, [1, 1]);
  assert.deepEqual(calls, ["a", "b"]);
});

test("GM shortcuts route to current HUD actions and reject closed HUDs and player access", async () => {
  const f = await hudFixture({ isGM: true });
  const calls = [];
  const state = globalThis.__adventurerHud;
  state.preset = "gm";
  state.app = {
    rendered: true,
    hudActions: Object.fromEntries(
      ["gmprevious", "gmnext", "endturn"].map(action => [
        action,
        () => calls.push(action)
      ])
    )
  };
  for (const key of ["gmPreviousTurn", "gmNextTurn", "gmEndTurn"]) {
    const config = f.keybindings.get(key);
    assert.equal(config.restricted, true);
    assert.equal(config.repeat, false);
    assert.deepEqual(config.editable, []);
    assert.equal(config.onDown(), true);
  }
  assert.deepEqual(calls, ["gmprevious", "gmnext", "endturn"]);
  state.app.rendered = false;
  assert.equal(f.keybindings.get("gmNextTurn").onDown(), false);
  state.app.rendered = true;
  game.user.isGM = false;
  assert.equal(f.keybindings.get("gmEndTurn").onDown(), false);
  assert.equal(calls.length, 3);
});

test("GM initiative roll skips existing results while reroll includes them and scopes to selection", async () => {
  installSettings({ isGM: true });
  const calls = [];
  const combat = {
    rollInitiative: async (ids, options) => calls.push([ids, options])
  };
  const actions = createHudActions({
    gmCombatantId: "a",
    gmController: {
      isGM: () => game.user.isGM,
      getCombat: () => combat,
      roster: () => [
        { id: "a", initiative: 10 },
        { id: "b", initiative: null }
      ]
    },
    performAndRefresh: callback => callback()
  });
  const target = (scope, reroll) => ({
    dataset: { scope, reroll: String(reroll) }
  });
  await actions.gmrollinitiative(null, target("selected", false));
  await actions.gmrollinitiative(null, target("all", false));
  await actions.gmrollinitiative(null, target("selected", true));
  await actions.gmrollinitiative(null, target("all", true));
  assert.deepEqual(
    calls.map(([ids]) => ids),
    [["b"], ["a"], ["a", "b"]]
  );
  assert.ok(calls.every(([, options]) => options.updateTurn));
  game.user.isGM = false;
  await actions.gmrollinitiative(null, target("all", true));
  assert.equal(calls.length, 3);
});

test("GM speed and legendary lists toggle independently without resource mutations", async () => {
  const hudState = {};
  let refreshes = 0;
  const actions = createHudActions({
    hudState,
    refreshHud: () => refreshes++,
    gmController: { isGM: () => true }
  });
  await actions.gmspeeds();
  await actions.gmlegendary();
  assert.equal(hudState.gmSpeedsExpanded, true);
  assert.equal(hudState.gmLegendaryExpanded, true);
  await actions.gmspeeds();
  assert.equal(hudState.gmSpeedsExpanded, false);
  assert.equal(hudState.gmLegendaryExpanded, true);
  assert.equal(refreshes, 3);
});

test("GM end combat delegates confirmation to Foundry and rejects player access", async () => {
  installSettings({ isGM: true });
  let calls = 0;
  const combat = { started: true, endCombat: async () => calls++ };
  const actions = createHudActions({
    gmController: { isGM: () => game.user.isGM, getCombat: () => combat },
    performSceneAction: callback => callback()
  });
  await actions.gmendcombat();
  assert.equal(calls, 1);
  game.user.isGM = false;
  await actions.gmendcombat();
  assert.equal(calls, 1);
});

test("combat setup uses native documents and adds only unoccupied GM NPC tokens", async () => {
  installSettings({ isGM: true });
  const calls = [];
  const combat = {
    id: "battle",
    combatants: itemCollection([
      { id: "existing", tokenId: "already", sceneId: "scene" }
    ])
  };
  const token = (id, type = "npc", player = false) => ({
    id,
    actor: {
      type,
      isOwner: true,
      testUserPermission: user => player && user.id === "player"
    }
  });
  globalThis.canvas = {
    scene: {
      id: "scene",
      tokens: itemCollection([
        token("new"),
        token("already"),
        token("pc", "character"),
        token("pet", "npc", true)
      ])
    }
  };
  game.users = itemCollection([{ id: "player", active: true, isGM: false }]);
  globalThis.foundry = {
    utils: {
      getDocumentClass: name =>
        name === "Combat"
          ? {
              create: async data => {
                calls.push(data);
                return combat;
              }
            }
          : {
              createCombatants: async (tokens, options) => {
                calls.push(tokens.map(token => token.id));
                assert.equal(options.combat, combat);
                return tokens;
              }
            }
    }
  };
  assert.equal(await createSceneCombat(), combat);
  assert.deepEqual(calls[0], { scene: "scene", active: true });
  await addGmCreatures(combat);
  assert.deepEqual(calls[1], ["new"]);
  canvas.scene.tokens.set("orphan", { id: "orphan", actor: null });
  await addSceneCreatures(combat);
  assert.deepEqual(calls[2], ["new", "pc", "pet"]);
  game.user.isGM = false;
  assert.equal(await createSceneCombat(), null);
  assert.deepEqual(await addGmCreatures(combat), []);
  assert.deepEqual(await addSceneCreatures(combat), []);
  assert.equal(calls.length, 3);
});
