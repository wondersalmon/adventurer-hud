import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAnimationSettings } from "../scripts/hud/animation-settings.js";
import { hudFixture } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();

test("master and reduced motion override fine preferences without mutating saved values", () => {
  const preferences = {
    showVisualEffects: true,
    hpAnimation: "bar",
    turnAnimation: "soft"
  };
  assert.deepEqual(effectiveAnimationSettings(preferences), {
    enabled: true,
    hp: "bar",
    turn: "soft",
    diceTray: "full"
  });
  assert.deepEqual(effectiveAnimationSettings(preferences, true), {
    enabled: false,
    hp: "off",
    turn: "off",
    diceTray: "off"
  });
  assert.deepEqual(
    effectiveAnimationSettings({ ...preferences, showVisualEffects: false }),
    { enabled: false, hp: "off", turn: "off", diceTray: "off" }
  );
  assert.equal(preferences.hpAnimation, "bar");
});

test("HP modes and live reduced motion clear feedback and queued initiative frames while retaining the turn marker", async () => {
  const f = await hudFixture({ combat: true, values: { hpAnimation: "bar" } });
  const listeners = new Set();
  const media = {
    matches: false,
    addEventListener(_name, fn) {
      listeners.add(fn);
    },
    removeEventListener(_name, fn) {
      listeners.delete(fn);
    }
  };
  document.defaultView.matchMedia = () => media;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const root = app.element;
  const hp = value => {
    f.actor.system.attributes.hp.value = value;
    f.hooks.callAll("updateActor", f.actor, {
      system: { attributes: { hp: { value } } }
    });
  };
  hp(6);
  assert.ok(root.classList.contains("ws-hp-feedback"));
  assert.equal(root.classList.contains("ws-damage-flash"), false);
  app.applySetting("hpAnimation", "off");
  assert.equal(root.classList.contains("ws-hp-feedback"), false);
  hp(5);
  assert.equal(root.hasAttribute("data-hp-feedback"), false);
  app.applySetting("hpAnimation", "full");
  hp(4);
  assert.ok(root.classList.contains("ws-damage-flash"));
  const combatant = game.combat.combatant;
  combatant.initiative = 20;
  f.hooks.callAll("updateCombatant", combatant, { initiative: 20 });
  media.matches = true;
  for (const fn of listeners) fn();
  f.flushFrames();
  assert.equal(root.classList.contains("ws-initiative-rolled"), false);
  assert.equal(root.classList.contains("ws-damage-flash"), false);
  assert.equal(root.classList.contains("ws-hp-feedback"), false);
  assert.ok(root.classList.contains("ws-effects-disabled"));
  assert.ok(root.classList.contains("ws-actor-turn"));
  hp(3);
  assert.equal(root.classList.contains("ws-hp-feedback"), false);
  media.matches = false;
  for (const fn of listeners) fn();
  hp(2);
  assert.ok(root.classList.contains("ws-hp-feedback"));
  await app.close();
  assert.equal(listeners.size, 0);
  assert.equal(root.classList.contains("ws-hp-feedback"), false);
});
