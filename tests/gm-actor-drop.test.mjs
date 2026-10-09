import test from "node:test";
import assert from "node:assert/strict";
import {
  actorsFromDrop,
  createGmActorDrop
} from "../scripts/hud/gm/gm-actor-drop.js";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

function fixture() {
  const settings = installSettings({ isGM: true });
  const scene = { id: "scene", tokens: new Map() };
  const actors = new Map();
  const sources = new Map();
  const calls = [];
  let current = true;
  let combat = { id: "selected" };
  let placement = async (data, options) => {
    assert.equal(options.createOptions.controlObject, false);
    assert.equal(await options.preConfirm(), true);
    assert.equal(await options.preCommit(), true);
    return data.map((item, index) => {
      assert.equal(item._id, undefined);
      const token = {
        id: `token-${index}`,
        parent: scene,
        actor: actors.get(item.actorId),
        isOwner: true
      };
      scene.tokens.set(token.id, token);
      return token;
    });
  };
  const Actor = {
    canUserCreate: () => true,
    fromDropData: async data => sources.get(data.uuid)
  };
  const Token = {
    canUserCreate: () => true,
    createCombatants: async (tokens, options) =>
      calls.push(["combatants", tokens, options])
  };
  const Combat = {
    create: async data => {
      calls.push(["create-combat", data]);
      return { id: "new" };
    }
  };
  foundry.utils = {
    getDocumentClass: type => ({ Actor, Token, Combat, Folder: Actor })[type]
  };
  globalThis.CONFIG = { Token: { documentClass: Token } };
  globalThis.canvas = {
    scene,
    level: { id: "level" },
    tokens: {
      activate: () => calls.push(["activate"]),
      deactivate: () => calls.push(["deactivate"]),
      placeTokens: (...args) => placement(...args)
    }
  };
  game.actors = actors;
  game.actors.importDocument = async (source, options) => {
    calls.push(["import", source, options]);
    return actor(`imported-${source.id}`);
  };
  game.packs = new Map();
  const actor = (id, options = {}) => {
    const document = {
      id,
      uuid: `Actor.${id}`,
      documentName: "Actor",
      type: "npc",
      isOwner: true,
      async getTokenDocument(overrides, context) {
        calls.push(["prototype", this, overrides, context]);
        return { toObject: () => ({ _id: "prototype", actorId: this.id }) };
      },
      ...options
    };
    sources.set(document.uuid, document);
    if (!document.compendium) actors.set(id, document);
    return document;
  };
  const controller = {
    isGM: () => game.user.isGM,
    getCombat: () => combat,
    chooseCombat: id => {
      combat = { id };
      return true;
    }
  };
  const drop = createGmActorDrop({
    controller,
    isCurrent: () => current,
    performSceneAction: callback => callback(),
    t: key => key
  });
  return {
    settings,
    scene,
    actors,
    sources,
    calls,
    actor,
    controller,
    drop,
    Actor,
    Token,
    Combat,
    setCombat: value => {
      combat = value;
    },
    setCurrent: value => {
      current = value;
    },
    setPlacement: value => {
      placement = value;
    }
  };
}

test("actor drops default on and use native prototype placement and the selected encounter", async () => {
  const f = fixture();
  const actor = f.actor("monster");
  await f.drop.drop({ type: "Actor", uuid: actor.uuid });
  const prototype = f.calls.find(call => call[0] === "prototype");
  assert.deepEqual(prototype.slice(2), [
    { level: "level" },
    { parent: f.scene }
  ]);
  const enrolled = f.calls.find(call => call[0] === "combatants");
  assert.equal(enrolled[2].combat, f.controller.getCombat());
  assert.equal(enrolled[1][0], f.scene.tokens.get("token-0"));
});

test("folders include nested NPCs once and resolve compendium folder indexes natively", async () => {
  const f = fixture();
  const one = f.actor("one");
  const two = f.actor("two", {
    compendium: {},
    uuid: "Compendium.creatures.two"
  });
  const hero = f.actor("hero", { type: "character" });
  game.packs.set("creatures", {
    getDocument: async id => (id === "two" ? two : null)
  });
  const folder = {
    type: "Actor",
    contents: [one, hero],
    getSubfolders: recursive => {
      assert.equal(recursive, true);
      return [
        { contents: [one] },
        { pack: "creatures", contents: [{ _id: "two" }] }
      ];
    }
  };
  f.sources.set("Folder.monsters", folder);
  const data = { type: "Folder", uuid: "Folder.monsters" };
  assert.deepEqual(await actorsFromDrop(data), [one, two]);
  await f.drop.drop(data);
  assert.equal(f.calls.find(call => call[0] === "combatants")[1].length, 2);
  assert.deepEqual(f.calls.find(call => call[0] === "import").slice(1), [
    two,
    { renderSheet: false }
  ]);
});

test("Encounter drops expand native quantities without placing the Encounter's own token", async () => {
  const f = fixture();
  const one = f.actor("one");
  const two = f.actor("two");
  let resolutions = 0;
  const encounter = f.actor("encounter", {
    type: "encounter",
    system: {
      getPlaceableMembers: async () => {
        resolutions++;
        return [
          { actor: one, quantity: { value: 3, formula: "1d4" } },
          { actor: two, quantity: { value: 2 } },
          {
            actor: f.actor("hero", { type: "character" }),
            quantity: { value: 1 }
          }
        ];
      }
    }
  });
  await f.drop.drop({ type: "Actor", uuid: encounter.uuid });
  assert.equal(
    resolutions,
    1,
    "quantities resolve once through the native system"
  );
  const enrolled = f.calls.find(call => call[0] === "combatants");
  assert.deepEqual(
    enrolled[1].map(token => token.actor.id),
    ["one", "one", "one", "two", "two"]
  );
  assert.equal(
    f.calls
      .filter(call => call[0] === "prototype")
      .some(call => call[1] === encounter),
    false
  );
});

test("folders expand Encounter members and import repeated compendium NPCs only once", async () => {
  const f = fixture();
  const npc = f.actor("packed", {
    compendium: {},
    uuid: "Compendium.creatures.packed"
  });
  const encounter = f.actor("encounter", {
    type: "encounter",
    system: {
      getPlaceableMembers: async () => [{ actor: npc, quantity: { value: 3 } }]
    }
  });
  f.sources.set("Folder.encounters", {
    type: "Actor",
    contents: [encounter],
    getSubfolders: () => []
  });
  await f.drop.drop({ type: "Folder", uuid: "Folder.encounters" });
  assert.equal(f.calls.filter(call => call[0] === "import").length, 1);
  assert.equal(f.calls.find(call => call[0] === "combatants")[1].length, 3);
});

test("stale drop resolution cannot invoke Encounter imports or quantity rolls", async () => {
  const f = fixture();
  const encounter = f.actor("encounter", {
    type: "encounter",
    system: {
      getPlaceableMembers: () => assert.fail("stale Encounter must not resolve")
    }
  });
  f.Actor.fromDropData = async () => {
    f.setCurrent(false);
    return encounter;
  };
  await f.drop.drop({ type: "Actor", uuid: encounter.uuid });
  assert.equal(f.calls.length, 0);
});

test("disabled, non-GM, unsupported and character drops cannot create tokens", async () => {
  const f = fixture();
  const actor = f.actor("monster");
  const data = { type: "Actor", uuid: actor.uuid };
  f.settings.current.set("gmActorDrop", false);
  await f.drop.drop(data);
  f.settings.current.set("gmActorDrop", true);
  game.user.isGM = false;
  await f.drop.drop(data);
  game.user.isGM = true;
  await f.drop.drop({ type: "Item", uuid: "Item.weapon" });
  const hero = f.actor("hero", { type: "character" });
  await f.drop.drop({ type: "Actor", uuid: hero.uuid });
  assert.equal(f.calls.length, 0);
});

test("cancelled native placement creates neither an encounter nor participants", async () => {
  const f = fixture();
  f.setCombat(null);
  f.setPlacement(async () => []);
  await f.drop.drop({ type: "Actor", uuid: f.actor("one").uuid });
  assert.equal(
    f.calls.some(call => ["create-combat", "combatants"].includes(call[0])),
    false
  );
});

test("first successful drop can create a scene encounter without enrolling unrelated tokens", async () => {
  const f = fixture();
  f.setCombat(null);
  const created = { id: "new" };
  f.Combat.create = async () => created;
  f.controller.chooseCombat = () => {
    f.setCombat(created);
    return true;
  };
  f.scene.tokens.set("unrelated", { id: "unrelated" });
  await f.drop.drop({ type: "Actor", uuid: f.actor("one").uuid });
  const enrolled = f.calls.find(call => call[0] === "combatants");
  assert.equal(enrolled[2].combat, created);
  assert.deepEqual(
    enrolled[1].map(token => token.id),
    ["token-0"]
  );
});

for (const reason of [
  "session",
  "scene",
  "encounter",
  "actor",
  "rights",
  "setting"
]) {
  test(`placement rejects changed ${reason} before native commit`, async () => {
    const f = fixture();
    const actor = f.actor("one");
    f.setPlacement(async (_data, options) => {
      if (reason === "session") f.setCurrent(false);
      if (reason === "scene") canvas.scene = { id: "other" };
      if (reason === "encounter") f.setCombat({ id: "other" });
      if (reason === "actor") f.actors.set(actor.id, { ...actor });
      if (reason === "rights") actor.isOwner = false;
      if (reason === "setting") f.settings.current.set("gmActorDrop", false);
      assert.equal(await options.preCommit(), false);
      return [];
    });
    await f.drop.drop({ type: "Actor", uuid: actor.uuid });
    assert.equal(
      f.calls.some(call => call[0] === "combatants"),
      false
    );
  });
}

test("disposing an in-flight drop cancels its native preview and blocks subsequent enrollment", async () => {
  const f = fixture();
  let release;
  f.setPlacement(
    () =>
      new Promise(resolve => {
        release = resolve;
      })
  );
  const data = { type: "Actor", uuid: f.actor("one").uuid };
  const pending = f.drop.drop(data);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.drop.drop(data);
  assert.equal(f.calls.filter(call => call[0] === "activate").length, 1);
  f.drop.dispose();
  assert.equal(f.calls.filter(call => call[0] === "deactivate").length, 1);
  release([]);
  await pending;
  assert.equal(
    f.calls.some(call => call[0] === "combatants"),
    false
  );
});
