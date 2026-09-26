import assert from "node:assert/strict";
import test from "node:test";
import {
  createGmCombatController,
  gmRoster
} from "../scripts/hud/gm-combat.js";
import {
  SETTINGS,
  getSettingDefinitions,
  resetSettings,
  setSetting,
  registerSettings,
  openGmSettings
} from "../scripts/settings.js";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();

function combatFixture() {
  const npc = id => ({
    id,
    actorId: "shared",
    sceneId: "scene",
    tokenId: id,
    actor: { type: "character" },
    token: {
      id,
      uuid: `Scene.scene.Token.${id}`,
      actor: { type: "npc", isOwner: true }
    },
    players: []
  });
  const first = npc("first"),
    second = npc("second"),
    last = npc("last");
  const player = {
    id: "player",
    actor: { type: "character", isOwner: true },
    sceneId: "scene",
    token: {}
  };
  const combat = {
    id: "battle",
    scene: { id: "scene" },
    started: true,
    round: 1,
    turn: 0,
    turns: [first, player, second, last],
    combatant: first
  };
  combat.combatants = itemCollection(combat.turns);
  const state = {
    user: { isGM: true },
    combat,
    combats: itemCollection([combat])
  };
  const values = {
    [SETTINGS.gmFollowTurn]: true,
    [SETTINGS.gmAutoAdvance]: false,
    [SETTINGS.gmIncludePlayerNpcs]: false
  };
  const memory = {};
  const controller = createGmCombatController({
    memory,
    getGame: () => state,
    getSceneId: () => "scene",
    readSetting: key => values[key],
    writeSetting: async (key, value) => {
      values[key] = value;
    }
  });
  return {
    state,
    combat,
    first,
    second,
    last,
    player,
    values,
    memory,
    controller
  };
}

test("GM roster uses token actors, scene identity, ownership and native initiative order", () => {
  const f = combatFixture();
  f.first.players = [{ active: true, isGM: true }];
  f.last.players = [{ active: true }];
  assert.deepEqual(
    f.controller.roster().map(entry => entry.id),
    ["first", "second"]
  );
  f.values[SETTINGS.gmIncludePlayerNpcs] = true;
  assert.deepEqual(
    f.controller.roster().map(entry => entry.id),
    ["first", "second", "last"]
  );
  f.second.sceneId = "elsewhere";
  f.first.token = null;
  assert.deepEqual(
    f.controller.roster().map(entry => entry.id),
    ["last"]
  );
  assert.deepEqual(gmRoster(f.combat, { isGM: false, sceneId: "scene" }), []);
});

test("GM follow keeps player turns and manual choice; deleting selection finds another NPC", async () => {
  const f = combatFixture();
  assert.equal(f.controller.sync({ selectedToken: f.second.token }), f.second);
  f.combat.combatant = f.first;
  assert.equal(f.controller.sync({ follow: true }), f.first);
  f.combat.combatant = f.player;
  assert.equal(f.controller.sync({ follow: true }), f.first);
  await f.controller.select("second");
  assert.equal(f.values[SETTINGS.gmFollowTurn], false);
  f.combat.combatant = f.last;
  assert.equal(f.controller.sync({ follow: true }), f.second);
  assert.equal(f.controller.sync({ forceFollow: true }), f.last);
  assert.equal(f.values[SETTINGS.gmFollowTurn], false);
  await f.controller.select("second");
  f.second.token = null;
  assert.equal(f.controller.sync(), f.last);
  f.state.user.isGM = false;
  assert.equal(await f.controller.select("first"), null);
  assert.equal(f.controller.chooseCombat("battle"), false);
});

test("GM End Turn advances once, suppresses follow races, and auto-selects without skipping player turns", async () => {
  const f = combatFixture();
  f.controller.sync();
  let advances = 0;
  const advance = async () => {
    advances++;
    f.combat.combatant = f.player;
    f.combat.turn++;
    assert.equal(f.controller.sync({ follow: true }), f.first);
  };
  assert.equal(await f.controller.endTurn("first", advance), f.first);
  assert.equal(f.controller.sync({ follow: true }), f.first);
  assert.equal(f.combat.combatant, f.player);
  assert.equal(advances, 1);
  await f.controller.endTurn("first", advance);
  assert.equal(advances, 1);
  f.combat.combatant = f.first;
  f.values[SETTINGS.gmAutoAdvance] = true;
  f.second.defeated = true;
  assert.equal(await f.controller.endTurn("first", advance), f.last);
  assert.equal(f.combat.combatant, f.player);
  f.combat.combatant = f.last;
  const wrap = await f.controller.endTurn("last", async () => {
    f.combat.combatant = f.first;
  });
  assert.equal(wrap, f.first);
  f.memory.combatantId = "first";
  await assert.rejects(
    f.controller.endTurn("first", async () => {
      throw new Error("native failed");
    }),
    /native failed/
  );
  assert.equal(f.memory.combatantId, "first");
  assert.equal(f.memory.endingTurn, false);
});

test("GM settings reuse the form, reject player access and isolate reset from player preferences", async () => {
  const f = installSettings({
    isGM: true,
    values: { showSearch: false, gmAutoAdvance: true }
  });
  assert.equal(f.menus.get("gm").restricted, true);
  const gmApp = new (f.menus.get("gm").type)();
  const context = await gmApp._prepareContext();
  const keys = context.groups.flatMap(group =>
    group.settings.map(setting => setting.key)
  );
  assert.ok(keys.every(key => getSettingDefinitions()[key].gmOnly));
  const submit = f.menus.get("configure").type.DEFAULT_OPTIONS.form.handler;
  await submit.call(gmApp, null, null, {
    object: {
      gmEnabled: true,
      gmFollowTurn: true,
      gmAutoAdvance: false,
      showSearch: true
    }
  });
  assert.equal(f.current.get("gmEnabled"), true);
  assert.equal(f.current.get("showSearch"), false);
  await resetSettings({ gmOnly: true });
  assert.equal(f.current.get("gmEnabled"), true);
  assert.equal(f.current.get("gmAutoAdvance"), false);
  assert.equal(f.current.get("showSearch"), false);
  game.user.isGM = false;
  const writes = f.writes.length;
  await submit.call(gmApp, null, null, { object: { gmAutoAdvance: true } });
  assert.equal(f.writes.length, writes);
  await assert.rejects(gmApp._prepareContext(), /GM only/);
});

test("players cannot enable the GM preset or open NPCs through the HUD API", async () => {
  const f = await hudFixture();
  await setSetting(SETTINGS.gmEnabled, true);
  assert.equal(f.current.get(SETTINGS.gmEnabled), true);
  assert.equal(f.menus.get("gm").restricted, true);
  assert.equal(openGmSettings(), undefined);
  f.current.set(SETTINGS.gmEnabled, true);
  await f.api.open({ ...f.actor, type: "npc" });
  assert.equal(__adventurerHud.app, null);
  assert.equal(__adventurerHud.preset, undefined);
});

test("real GM HUD switches between synthetic NPCs and releases old subscriptions", async () => {
  const f = await hudFixture({ isGM: true, values: { gmEnabled: true } });
  canvas.scene = { id: "scene" };
  const make = (id, hp) => {
    const actor = {
      ...f.actor,
      id: "shared",
      uuid: `Scene.scene.Token.${id}.Actor.shared`,
      name: `Goblin ${id}`,
      type: "npc",
      system: {
        ...f.actor.system,
        attributes: {
          ...f.actor.system.attributes,
          hp: { value: hp, max: 10, temp: 0 }
        }
      }
    };
    const token = {
      id,
      uuid: `Scene.scene.Token.${id}`,
      parent: canvas.scene,
      actor
    };
    return {
      id,
      name: actor.name,
      sceneId: "scene",
      tokenId: id,
      actorId: actor.id,
      actor,
      token,
      players: [],
      initiative: 15
    };
  };
  const first = make("one", 8),
    second = make("two", 3);
  const combat = {
    id: "battle",
    name: "Encounter",
    scene: canvas.scene,
    started: true,
    round: 1,
    turn: 0,
    turns: [first, second],
    combatant: first,
    combatants: itemCollection([first, second])
  };
  first.parent = second.parent = combat;
  let advances = 0;
  combat.nextTurn = async () => {
    advances++;
    combat.combatant = second;
    combat.turn = 1;
    f.hooks.callAll("updateCombat", combat);
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  let app = __adventurerHud.app;
  assert.equal(__adventurerHud.actor, first.actor);
  assert.match(app.element.textContent, /8\/10/);
  assert.equal(
    app.element.querySelector('[data-action="endturn"]').disabled,
    false
  );
  const originalApp = app;
  const originalElement = app.element;
  const originalHooks = f.callbacks.size;
  await app.options.actions.gmselect(null, { dataset: { combatantId: "two" } });
  app = __adventurerHud.app;
  assert.equal(__adventurerHud.actor, second.actor);
  assert.equal(app, originalApp);
  assert.equal(app.element, originalElement);
  assert.equal(
    app.element.querySelector('[data-action="endturn"]').disabled,
    true
  );
  assert.equal(f.callbacks.size, originalHooks);
  assert.equal(f.current.get("gmFollowTurn"), false);
  await app.options.actions.gmselect(null, { dataset: { combatantId: "one" } });
  await __adventurerHud.app.options.actions.endturn();
  assert.equal(advances, 1);
  assert.equal(__adventurerHud.actor, first.actor);
  f.current.set("gmFollowTurn", true);
  combat.turn = 2;
  f.hooks.callAll("updateCombat", combat);
  await waitFor(
    () =>
      __adventurerHud.actor === second.actor && __adventurerHud.app?.rendered
  );
  const reusedWindow = __adventurerHud.app;
  f.current.set("fontSize", "large");
  await f.api.open();
  assert.equal(__adventurerHud.app, reusedWindow);
  assert.equal(reusedWindow.element.classList.contains("ws-font-large"), true);
  const controls = { tokens: { tools: {} } };
  f.current.set("showTokenControl", true);
  f.hooks.callAll("getSceneControlButtons", controls);
  assert.equal(controls.tokens.tools.adventurerGmHud.active, true);
  assert.equal(controls.tokens.tools.adventurerHud, undefined);
  assert.equal(
    __adventurerHud.app.options.window.controls.some(
      control => control.action === "togglemodes"
    ),
    false
  );
  await __adventurerHud.app.close();
  f.hooks.callAll("getSceneControlButtons", controls);
  assert.equal(controls.tokens.tools.adventurerGmHud.active, false);
  assert.equal(document.querySelectorAll(".ws-rolls-dialog").length, 0);
});

test("GM HUD can start empty and opens a creature after combat is populated", async () => {
  const f = await hudFixture({ isGM: true, values: { gmEnabled: true } });
  await f.api.open();
  assert.match(__adventurerHud.app.element.textContent, /GM.NoCombat/);
  assert.equal(__adventurerHud.actor, null);
  const emptyApp = __adventurerHud.app;
  canvas.scene = { id: "scene" };
  const actor = { ...f.actor, type: "npc" };
  const token = {
    id: "npc",
    uuid: "Scene.scene.Token.npc",
    parent: canvas.scene,
    actor
  };
  const combatant = {
    id: "npc",
    tokenId: "npc",
    sceneId: "scene",
    actorId: actor.id,
    token,
    actor,
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    combatants: itemCollection([combatant]),
    turns: [combatant],
    combatant
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  f.hooks.callAll("createCombat", combat);
  await waitFor(
    () => __adventurerHud.actor === actor && __adventurerHud.app?.rendered
  );
  assert.doesNotMatch(__adventurerHud.app.element.textContent, /GM.NoCombat/);
  assert.equal(__adventurerHud.app, emptyApp);
  await __adventurerHud.app.close();
  assert.equal(document.querySelectorAll(".ws-rolls-dialog").length, 0);
});

test("GM menu registers before users exist and opens after the user is initialized", async () => {
  const f = installSettings();
  game.user = null;
  registerSettings();
  assert.equal(f.menus.get("gm").restricted, true);
  assert.equal(openGmSettings(), undefined);
  game.user = { isGM: true };
  const app = await openGmSettings();
  assert.equal(app.rendered, true);
  assert.ok(
    app.context.groups
      .flatMap(group => group.settings)
      .some(setting => setting.key === "gmEnabled")
  );
  game.user.isGM = false;
  assert.equal(openGmSettings(), undefined);
});

test("Follow before combat starts selects the first NPC in initiative order", async () => {
  const f = combatFixture();
  f.combat.started = false;
  f.combat.combatant = null;
  f.memory.combatantId = f.last.id;
  assert.equal(f.controller.sync({ follow: true }), f.first);
  await f.controller.select(f.last.id);
  assert.equal(f.controller.sync({ forceFollow: true }), f.first);
});
