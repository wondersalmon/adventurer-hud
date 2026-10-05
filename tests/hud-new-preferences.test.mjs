import assert from "node:assert/strict";
import test from "node:test";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { familiarFixture, target } from "./helpers/companions.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import {
  settingsBackup,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
import { snapWindowPosition } from "../scripts/hud/window/geometry.js";
import { useFamiliarSenses } from "../scripts/dnd5e/familiar.js";

restoreGlobalsAfterEach();

test("settings backup round-trips preferences and windows; invalid input writes nothing", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      language: "ru",
      windowGeometry: { width: 800, height: 560, left: 22, top: 33 }
    }
  });
  const backup = await settingsBackup();
  f.current.set("language", "en");
  f.current.set("windowGeometry", {});
  await restoreSettingsBackup(JSON.stringify(backup));
  assert.equal(f.current.get("language"), "ru");
  assert.deepEqual(
    f.current.get("windowGeometry"),
    backup.settings.windowGeometry
  );
  const before = JSON.stringify([...f.current]);
  backup.settings.fontSize = "invalid";
  await assert.rejects(restoreSettingsBackup(JSON.stringify(backup)));
  await assert.rejects(
    restoreSettingsBackup(
      '{"module":"adventurer-hud","format":1,"settings":{"panelStates":{"__proto__":{}}}}'
    )
  );
  assert.equal(JSON.stringify([...f.current]), before);
});

test("window resets are independent and clear separate player mode sizes", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      pinWindow: true,
      gmPinWindow: true,
      windowGeometry: { width: 800 },
      gmWindowGeometry: { width: 1000 },
      windowModeSizes: { combat: { width: 900, height: 500 } }
    }
  });
  const App = f.menus.get("troubleshooting").type;
  const app = new App();
  app.t = key => key;
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  await App.DEFAULT_OPTIONS.actions.resetplayerwindow.call(app);
  assert.deepEqual(f.current.get("windowGeometry"), {});
  assert.deepEqual(f.current.get("windowModeSizes"), {});
  assert.equal(f.current.get("pinWindow"), false);
  assert.deepEqual(f.current.get("gmWindowGeometry"), { width: 1000 });
  assert.equal(f.current.get("gmPinWindow"), true);
  await App.DEFAULT_OPTIONS.actions.resetgmwindow.call(app);
  assert.deepEqual(f.current.get("gmWindowGeometry"), {});
  assert.equal(f.current.get("gmPinWindow"), false);
});

test("player geometry reset moves and resizes an open pinned HUD immediately through its current session", async () => {
  const f = await hudFixture({
    values: {
      pinWindow: true,
      windowGeometry: { left: 80, top: 70, width: 800, height: 600 },
      gmWindowGeometry: { left: 200, top: 100, width: 1000, height: 500 },
      separateModeSizes: true,
      windowModeSizes: {
        regular: { width: 810, height: 610 },
        combat: { width: 900, height: 700 }
      }
    }
  });
  await f.api.open(f.actor);
  const hud = __adventurerHud.app;
  hud.element.getBoundingClientRect = () => ({
    width: 650,
    height: 430
  });
  const App = f.menus.get("troubleshooting").type,
    troubleshooting = new App();
  troubleshooting.t = key => key;
  foundry.applications.api.DialogV2.confirm = async () => true;
  const reset =
    App.DEFAULT_OPTIONS.actions.resetplayerwindow.call(troubleshooting);
  await waitFor(() => hud.position.width === 640);
  f.flushFrames();
  await reset;
  assert.deepEqual(hud.position, {
    width: 640,
    height: 500,
    left: 0,
    top: Math.min(710, window.innerHeight - 500)
  });
  assert.equal(hud.hudPinState(), false);
  assert.deepEqual(f.current.get("windowGeometry"), hud.position);
  assert.equal(f.current.get("windowModeSizes").combat, undefined);
  assert.deepEqual(f.current.get("gmWindowGeometry"), {
    left: 200,
    top: 100,
    width: 1000,
    height: 500
  });
  await hud.close();
  await f.api.open(f.actor);
  assert.equal(__adventurerHud.app.position.width, 640);
  assert.equal(__adventurerHud.app.position.height, 500);
  await __adventurerHud.app.close();
});

test("edge snapping catches nearby edges and preserves freely positioned axes and size", () => {
  const current = { width: 640, height: 560 };
  const viewport = { width: 1280, height: 900 };
  assert.deepEqual(
    snapWindowPosition({ left: 8, top: 332 }, current, viewport),
    { left: 0, top: 340 }
  );
  assert.deepEqual(
    snapWindowPosition({ left: 633, top: 40, width: 640 }, current, viewport),
    { left: 640, top: 40, width: 640 }
  );
  assert.deepEqual(snapWindowPosition({ width: 600 }, current, viewport), {
    width: 600
  });
});

test("slide mode stows the same window, disposes its session and restores it on reopening", async () => {
  const f = await hudFixture({ values: { slidePanel: true } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const position = { ...app.position };
  await app.close();
  assert.equal(app.rendered, true);
  assert.equal(app.element.hidden, true);
  assert.equal(app.hudStowed, true);
  assert.equal(f.current.get("hudClosed"), true);
  await f.api.open(f.actor);
  assert.equal(__adventurerHud.app, app);
  assert.equal(app.element.hidden, false);
  assert.equal(app.hudStowed, false);
  assert.deepEqual(app.position, position);
  assert.equal(f.current.get("hudClosed"), false);
  await app.close({ hudForce: true });
});

test("2024 mode requires native familiar provenance and rejects incapacitated casters", async () => {
  const f = await familiarFixture();
  f.current.set("familiarVision2024", true);
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.visionSources.has(f.familiar.uuid), false);
  const item = {
    id: "familiar",
    uuid: `${f.actor.uuid}.Item.familiar`,
    isOwner: true,
    system: {
      identifier: "find-familiar",
      activities: itemCollection([
        {
          id: "hudFamiliarSight",
          activation: { type: "bonus" },
          use: async () => ({})
        }
      ])
    }
  };
  f.actor.items.set(item.id, item);
  f.familiar.actor.flags = { dnd5e: { summon: { origin: item.uuid } } };
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.visionSources.has(f.familiar.uuid), true);
  f.actor.statuses = new Set(["incapacitated"]);
  f.hooks.callAll("updateActor", f.actor, {});
  await waitFor(() => !f.visionSources.has(f.familiar.uuid));
  await f.app.close();
});

test("familiar bonus activity is native, consumes no spell slot and respects cancellation and stale sessions", async () => {
  const f = await hudFixture();
  const event = { type: "click", ctrlKey: true };
  const item = {
    id: "familiar",
    uuid: `${f.actor.uuid}.Item.familiar`,
    isOwner: true,
    system: { identifier: "find-familiar", activities: itemCollection() }
  };
  const familiar = { flags: { dnd5e: { summon: { origin: item.uuid } } } };
  f.actor.items.set(item.id, item);
  const calls = [];
  item.update = async changes => {
    const data = changes["system.activities.hudFamiliarSight"];
    assert.equal(data.activation.type, "bonus");
    assert.equal(data.consumption.spellSlot, false);
    item.system.activities.set(data._id, {
      id: data._id,
      use: (...options) => {
        calls.push(options);
        return null;
      }
    });
  };
  assert.equal(
    await useFamiliarSenses(f.actor, familiar, {
      event,
      label: "Senses",
      isCurrent: () => true
    }),
    null
  );
  assert.deepEqual(calls, [[{ event }, {}, { create: false }]]);
  await useFamiliarSenses(f.actor, familiar, {
    event,
    label: "Senses",
    isCurrent: () => false
  });
  assert.equal(calls.length, 1);
});

test("Ctrl-click removes effects and HUD leaves undo shortcuts alone", async () => {
  const f = await hudFixture();
  CONFIG.statusEffects = [{ id: "poisoned", name: "Poisoned" }];
  f.actor.statuses = new Set(["poisoned"]);
  f.actor.toggleStatusEffect = async (_id, { active }) => {
    if (active) f.actor.statuses.add("poisoned");
    else f.actor.statuses.delete("poisoned");
    return [];
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.removestatus(
    { type: "click", ctrlKey: true, button: 0 },
    { dataset: { statusId: "poisoned" } }
  );
  assert.equal(f.actor.statuses.size, 0);
  const key = new document.defaultView.Event("keydown", {
    bubbles: true,
    cancelable: true
  });
  Object.assign(key, { key: "z", ctrlKey: true, altKey: false });
  app.element.dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
  const undo = new document.defaultView.Event("keydown", {
    bubbles: true,
    cancelable: true
  });
  Object.assign(undo, { key: "z", ctrlKey: true, altKey: true });
  document.body.dispatchEvent(undo);
  assert.equal(undo.defaultPrevented, false);
  assert.equal(f.actor.statuses.has("poisoned"), false);
  assert.equal(app.hudActions.restorestatus, undefined);
  await app.close();
});

test("combat auto-opening is opt-in and only opens for the assigned character on this scene", async () => {
  const f = await hudFixture({ values: { openPlayerOnCombat: true } });
  canvas.scene = { id: "scene" };
  const token = { actor: f.actor, baseActor: f.actor };
  const combatant = {
    token,
    actor: f.actor,
    actorId: f.actor.id,
    parent: { scene: canvas.scene }
  };
  game.combat = {
    started: false,
    scene: canvas.scene,
    combatants: [combatant]
  };
  await Promise.all(f.hooks.callAll("createCombatant", combatant));
  await waitFor(() => __adventurerHud.app?.rendered);
  await waitFor(() =>
    Boolean(__adventurerHud.app.element.querySelector(".ws-combat-view"))
  );
  await __adventurerHud.app.close();
  f.current.set("openPlayerOnCombat", false);
  f.hooks.callAll("createCombatant", {
    token,
    parent: { scene: canvas.scene }
  });
  assert.equal(__adventurerHud.app, null);
});
