import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { escapeHTML, itemCollection } from "./rendering.mjs";
import { installDom, installSettings } from "./foundry.mjs";

let sequence = 0;

export async function hudFixture({
  isGM = false,
  values = {},
  owned = true,
  combat = false
} = {}) {
  ++sequence;
  const settings = installSettings({ values, isGM });
  globalThis.fromUuid = async () => null;
  globalThis.CONFIG = { DND5E: { skills: {}, tools: {} }, statusEffects: [] };
  const { document } = installDom();
  const callbacks = new Map();
  let hookId = 0;
  const hooks = {
    on(name, callback) {
      const key = ++hookId;
      callbacks.set(key, { name, callback });
      return key;
    },
    once(name, callback) {
      const key = hooks.on(name, (...args) => {
        callbacks.delete(key);
        return callback(...args);
      });
      return key;
    },
    off(_name, key) {
      callbacks.delete(key);
    },
    callAll(name, ...args) {
      return [...callbacks.values()]
        .filter(entry => entry.name === name)
        .map(entry => entry.callback(...args));
    }
  };
  globalThis.Hooks = hooks;
  const frames = new Map();
  let frameId = 0;
  globalThis.requestAnimationFrame = callback => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback());
  };
  class DialogV2 {
    constructor(options) {
      this.options = options;
      this.position = options.position;
      this.listeners = new Map();
      this.element = document.createElement("section");
      this.element.className = options.classes.join(" ");
      this.element.innerHTML =
        '<header class="window-header"><h4 class="window-title"></h4><button data-action="toggleControls"></button></header><div class="window-content"></div>';
      this.element.querySelector(".window-content").append(options.content);
    }
    _onRender() {}
    async render() {
      this.rendered = true;
      document.body.append(this.element);
      this._onRender({}, {});
      return this;
    }
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }
    async close() {
      this.rendered = false;
      this.element.remove();
      this.element = null;
      this.listeners.get("close")?.();
      return this;
    }
    setPosition(position) {
      Object.assign(this.position, position);
    }
  }
  Object.assign(foundry.applications.api, { DialogV2 });
  foundry.utils = {
    escapeHTML,
    getRoute: path => path,
    buildRelativeUuid: item => ".Item." + item.id
  };
  globalThis.CONST = { SORT_INTEGER_DENSITY: 100000 };
  foundry.applications.handlebars = {
    renderTemplate: async (_path, context) =>
      Handlebars.compile(
        await readFile(
          new URL("../../templates/rolls-hud.hbs", import.meta.url),
          "utf8"
        )
      )(context)
  };
  globalThis.fetch = async url => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(
          new URL(
            `../../${String(url).replace(/^.*modules\/adventurer-hud\//, "")}`,
            import.meta.url
          ),
          "utf8"
        )
      )
  });
  const actor = {
    id: "hero",
    uuid: "Actor.hero",
    name: "Hero <One>",
    type: "character",
    isOwner: owned,
    items: itemCollection(),
    statuses: new Set(),
    effects: [],
    hp: { value: 12, max: 20, temp: 2 },
    system: {
      favorites: [],
      abilities: {},
      skills: {},
      details: {},
      tools: {},
      spells: {},
      resources: {},
      attributes: {
        ac: { value: 16 },
        prof: 2,
        hp: { value: 12, max: 20, temp: 2 },
        movement: { walk: 30, units: "ft" }
      }
    }
  };
  actor.system.hasFavorite = id =>
    actor.system.favorites.some(f => f.id === id);
  actor.system.addFavorite = async favorite => {
    if (actor.system.hasFavorite(favorite.id)) return;
    const max = Math.max(0, ...actor.system.favorites.map(f => f.sort));
    return actor.update({
      "system.favorites": [
        ...actor.system.favorites,
        { ...favorite, sort: max + 100000 }
      ]
    });
  };
  actor.system.removeFavorite = id =>
    actor.update({
      "system.favorites": actor.system.favorites.filter(f => f.id !== id)
    });
  const nativeCalls = [];
  actor.update = async changes => {
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split(".");
      let target = actor;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
    nativeCalls.push(["update", changes]);
  };
  actor.rollInitiative = (...args) => nativeCalls.push(["initiative", ...args]);
  const combatant = { id: "hero-turn", actorId: actor.id, initiative: null };
  game.modules = new Map([["adventurer-hud", {}]]);
  const keybindings = new Map();
  game.keybindings = {
    register(_module, key, config) {
      keybindings.set(key, config);
    }
  };
  game.user = { character: actor, isGM };
  game.actors = itemCollection([actor]);
  game.combat = combat
    ? { started: true, combatant, combatants: [combatant] }
    : null;
  globalThis.canvas = { tokens: { controlled: [] } };
  globalThis.__adventurerHud = {};
  await import(`../../scripts/adventurer-hud.js?test=${sequence}`);
  const readyUser = game.user;
  game.user = null;
  hooks.callAll("init");
  game.user = readyUser;
  return {
    ...settings,
    actor,
    nativeCalls,
    hooks,
    callbacks,
    keybindings,
    flushFrames,
    api: game.modules.get("adventurer-hud").api
  };
}

export async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error("HUD operation did not finish");
}
