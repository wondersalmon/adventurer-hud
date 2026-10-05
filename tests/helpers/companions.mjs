import assert from "node:assert/strict";
import { hudFixture } from "./hud.mjs";
import { itemCollection } from "./rendering.mjs";
export async function placementFixture() {
  const f = await fixture();
  const base = f.npc();
  let permission = true;
  CONFIG.Token = { documentClass: { canUserCreate: () => permission } };
  base.getTokenDocument = async (options, context) => {
    f.calls.push(["prototype", options, context]);
    return {
      toObject: () => ({
        _id: "prototype",
        actorId: base.id,
        name: "Owl",
        actorLink: false
      })
    };
  };
  canvas.level = { id: "level" };
  canvas.tokens.activate = () => f.calls.push(["activate"]);
  canvas.tokens.deactivate = () => f.calls.push(["cancel"]);
  canvas.tokens.placeTokens = async () => [];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  await app.hudActions.companionfilter(null, {
    dataset: { companionFilter: "all" }
  });
  return {
    ...f,
    base,
    app,
    revoke: () => {
      permission = false;
    }
  };
}
export async function familiarFixture() {
  const f = await fixture({
    values: { showModeNavigation: true, companionVisionPan: true }
  });
  const hero = f.token(f.actor, "hero", true);
  const familiar = f.token(f.npc(), "owl");
  const summon = f.token(f.npc("wolf"), "wolf");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  game.time = { worldTime: 100 };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const eye = () =>
    app.element.querySelector('[data-action="companionvision"]');
  return { ...f, app, hero, familiar, summon, eye };
}
export function combatFor(f, tokens) {
  const entries = tokens.map(token => ({
    id: token.id,
    actorId: token.actorId,
    tokenId: token.id,
    sceneId: token.parent.id,
    token,
    actor: token.actor,
    getInitiativeRoll: () => token.actor.getInitiativeRoll(),
    isOwner: true,
    initiative: null
  }));
  const combat = {
    started: true,
    combatants: entries,
    rollInitiative: async (ids, options) => {
      f.calls.push(["initiative", ids, options]);
      for (const id of ids) {
        entries.find(entry => entry.id === id).getInitiativeRoll();
        entries.find(entry => entry.id === id).initiative =
          12 + entries.findIndex(entry => entry.id === id);
      }
      f.hooks.callAll(
        "updateCombatant",
        entries.find(entry => entry.id === ids[0])
      );
    }
  };
  for (const entry of entries) entry.parent = combat;
  game.combat = combat;
  return { combat, entries };
}
export async function fixture(options = {}) {
  const f = await hudFixture({
    ...options,
    values: { companionAutoFocus: false, ...options.values }
  });
  const documents = new Map([[f.actor.uuid, f.actor]]);
  const pickers = [];
  const NativeDialog = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = class extends NativeDialog {
    constructor(options) {
      super(options);
      pickers.push(this);
    }
  };
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  const calls = [];
  const npc = (id = "owl") => {
    const actor = {
      ...f.actor,
      id,
      uuid: `Actor.${id}`,
      name: `Familiar <${id}>`,
      type: "npc",
      system: JSON.parse(JSON.stringify(f.actor.system)),
      items: itemCollection(),
      sheet: { render: () => calls.push(["sheet", actor.uuid]) }
    };
    actor.update = async changes => {
      calls.push(["update", actor.uuid, changes]);
      for (const [key, value] of Object.entries(changes)) {
        const path = key.split(".");
        let target = actor;
        for (const part of path.slice(0, -1)) target = target[part];
        target[path.at(-1)] = value;
      }
    };
    actor.rollAbilityCheck = () => calls.push(["roll", actor.uuid]);
    actor.getInitiativeRoll = options => ({ actor, options });
    game.actors.set(id, actor);
    documents.set(actor.uuid, actor);
    return actor;
  };
  canvas.scene = { id: "scene", name: "Forest", tokens: itemCollection() };
  game.scenes = itemCollection([canvas.scene]);
  const placeables = new Map();
  const visionSources = new Map();
  const visionCalls = [];
  canvas.ready = true;
  canvas.visibility = { tokenVision: true };
  canvas.perception = {
    update: flags => {
      visionCalls.push(flags);
      for (const placeable of placeables.values())
        placeable.initializeVisionSource();
    }
  };
  const tokenPrototype = {
    _isVisionSource() {
      const token = this.document;
      return Boolean(
        token.actor.isOwner &&
        token.sight.enabled &&
        (!token.hidden || game.user.isGM) &&
        (!canvas.tokens.controlled.length ||
          canvas.tokens.controlled.includes(this))
      );
    },
    initializeVisionSource() {
      if (this._isVisionSource())
        visionSources.set(this.document.uuid, {
          object: this,
          center: { ...this.center },
          sight: structuredClone(this.document.sight)
        });
      else visionSources.delete(this.document.uuid);
    }
  };
  canvas.tokens.get = id => placeables.get(id);
  canvas.animatePan = center => calls.push(["pan", center]);
  canvas.ping = center => calls.push(["ping", center]);
  const token = (base, id, linked = false) => {
    const actor = linked ? base : npc(id + "-synthetic");
    if (!linked) {
      game.actors.delete(actor.id);
      documents.delete(actor.uuid);
      actor.id = base.id;
      actor.uuid = `Scene.scene.Token.${id}.Actor.${base.id}`;
    }
    const doc = {
      id,
      uuid: `Scene.scene.Token.${id}`,
      name: `Owl ${id}`,
      actorId: base.id,
      baseActor: base,
      actor,
      actorLink: linked,
      parent: canvas.scene,
      texture: { src: "icons/svg/mystery-man.svg" },
      sight: { enabled: true }
    };
    if (!linked) actor.token = doc;
    canvas.scene.tokens.set(id, doc);
    documents.set(doc.uuid, doc);
    documents.set(actor.uuid, actor);
    placeables.set(
      id,
      Object.assign(Object.create(tokenPrototype), {
        document: doc,
        actor,
        visible: true,
        center: { x: id.length * 100, y: 100 },
        control: options => {
          assert.deepEqual(options, {
            releaseOthers: options.releaseOthers,
            ...(placeables.get(id).visible ? {} : { force: true })
          });
          calls.push(["control", doc.uuid]);
          canvas.tokens.controlled = options.releaseOthers
            ? []
            : canvas.tokens.controlled.filter(
                p => p.document.uuid !== doc.uuid
              );
          canvas.tokens.controlled.push(placeables.get(id));
          for (const placeable of placeables.values())
            placeable.initializeVisionSource();
          f.hooks.callAll("controlToken", { document: doc, actor }, true);
          return true;
        },
        release: () => {
          canvas.tokens.controlled = canvas.tokens.controlled.filter(
            p => p.document.uuid !== doc.uuid
          );
          for (const placeable of placeables.values())
            placeable.initializeVisionSource();
          f.hooks.callAll("controlToken", placeables.get(id), false);
        }
      })
    );
    return doc;
  };
  return {
    ...f,
    documents,
    calls,
    npc,
    token,
    placeables,
    pickers,
    visionSources,
    visionCalls
  };
}
export const select = async (dialog, index, kind = "companion") =>
  dialog.options.buttons[0].callback(
    {},
    {
      form: {
        elements: {
          namedItem: name => ({ value: name === "kind" ? kind : String(index) })
        }
      }
    }
  );
export const target = uuid => ({
  dataset: {
    companionUuid: uuid.startsWith("Scene.")
      ? (canvas.scene.tokens.get(uuid.split(".")[3])?.baseActor?.uuid ?? uuid)
      : uuid
  }
});
