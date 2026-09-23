import assert from "node:assert/strict";
import test from "node:test";

import { createHudActions } from "../scripts/hud/actions.js";
import { activateHudWindow } from "../scripts/hud/window-session.js";

test("extracted HUD actions forward roll events through the adapter", async () => {
  const calls = [];
  const event = { altKey: true };
  const actions = createHudActions({
    actor: { id: "hero" },
    adapter: {
      rollAbility: (actor, options) => {
        calls.push([actor.id, options]);
        return true;
      }
    },
    canRollActor: true,
    rollAndClose: callback => callback()
  });

  assert.equal(
    await actions.ability(event, { dataset: { type: "save", key: "dex" } }),
    true
  );
  assert.deepEqual(calls, [["hero", { type: "save", key: "dex", event }]]);
});

test("skill filter saves the user's choice and refreshes the HUD", async () => {
  const previousGame = globalThis.game;
  const writes = [];
  let refreshed = 0;
  globalThis.game = {
    settings: {
      set: async (_module, key, value) => writes.push([key, value])
    }
  };

  try {
    const hudState = { proficientSkillsOnly: true };
    const actions = createHudActions({
      hudState,
      refreshHud: () => refreshed++
    });
    await actions.skillfilter(null, { dataset: { proficient: "false" } });
    assert.equal(hudState.proficientSkillsOnly, false);
    assert.deepEqual(writes, [["proficientSkillsOnly", false]]);
    assert.equal(refreshed, 1);
  } finally {
    globalThis.game = previousGame;
  }
});

test("window session updates live settings and releases document hooks", async () => {
  const previousHooks = globalThis.Hooks;
  const hookIds = [];
  const hookCallbacks = new Map();
  const removed = [];
  globalThis.Hooks = {
    on(name, callback) {
      hookIds.push(name);
      hookCallbacks.set(name, callback);
      return name;
    },
    off(name, id) {
      removed.push([name, id]);
    }
  };

  try {
    const listeners = new Map();
    const elementListeners = new Map();
    const elementClasses = new Set();
    const control = { action: "togglecloseafterroll", icon: "" };
    const app = {
      options: { window: { controls: [control] } },
      element: {
        classList: {
          add: name => elementClasses.add(name),
          remove: (...names) =>
            names.forEach(name => elementClasses.delete(name))
        },
        offsetWidth: 100,
        addEventListener(name, callback) {
          elementListeners.set(name, callback);
        }
      },
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      async render() {},
      updatePinControl() {}
    };
    const actor = { uuid: "Actor.hero" };
    const state = { app: null, actor, actorUuid: actor.uuid };
    const visibility = { itemDetails: true };
    let closeAfterRoll = false;
    let pinned = false;
    let refreshed = 0;
    let canceled = 0;
    const searches = [];

    await activateHudWindow({
      actor,
      app,
      canRollActor: true,
      isCloseAfterRoll: () => closeAfterRoll,
      visualEffectsEnabled: false,
      isCurrentCombatant: combatant => combatant.id === "own",
      onSearchInput: query => searches.push(query),
      readVisibility: () => ({ itemDetails: false }),
      refreshHud: () => refreshed++,
      refreshScheduler: { schedule() {}, cancel: () => canceled++ },
      setCloseAfterRoll: value => {
        closeAfterRoll = value;
      },
      setPinned: value => {
        pinned = value;
      },
      state,
      visibility
    });

    assert.equal(state.app, app);
    app.applySetting("closeAfterRoll", true);
    app.applySetting("pinWindow", true);
    app.refreshFromSettings();
    assert.equal(closeAfterRoll, true);
    assert.equal(control.icon, "fa-solid fa-toggle-on");
    assert.equal(pinned, true);
    assert.equal(visibility.itemDetails, false);
    assert.equal(refreshed, 1);

    assert.equal(elementClasses.has("ws-effects-disabled"), true);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    app.applySetting("showVisualEffects", true);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), true);
    app.applySetting("showVisualEffects", false);
    assert.equal(elementClasses.has("ws-effects-disabled"), true);
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    app.applySetting("showVisualEffects", true);
    assert.equal(elementClasses.has("ws-effects-disabled"), false);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), true);

    elementListeners.get("input")({
      target: { matches: () => true, value: "sword" }
    });
    assert.deepEqual(searches, ["sword"]);

    listeners.get("close")();
    assert.equal(canceled, 1);
    assert.equal(state.app, null);
    assert.equal(state.actor, null);
    assert.equal(removed.length, hookIds.length);
  } finally {
    globalThis.Hooks = previousHooks;
  }
});
