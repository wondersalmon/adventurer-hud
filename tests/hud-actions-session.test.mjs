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

test("window session updates live settings and releases document hooks", async () => {
  const previousHooks = globalThis.Hooks;
  const hookIds = [];
  const removed = [];
  globalThis.Hooks = {
    on(name) {
      hookIds.push(name);
      return name;
    },
    off(name, id) {
      removed.push([name, id]);
    }
  };

  try {
    const listeners = new Map();
    const elementListeners = new Map();
    const control = { action: "togglecloseafterroll", icon: "" };
    const app = {
      options: { window: { controls: [control] } },
      element: {
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
