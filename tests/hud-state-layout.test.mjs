import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  createHudState,
  resolveHudMode,
  setForcedMode,
  setRegularView
} from "../scripts/hud/state.js";
import { renderHudMode, renderRegularView } from "../scripts/render/index.js";

test("one forced mode replaces the former three-flag state", () => {
  const state = createHudState({ currentView: "skills" });
  setForcedMode(state, "combat");
  assert.equal(state.forcedMode, "combat");
  assert.equal(state.currentView, "main");

  assert.equal(
    resolveHudMode({
      automaticCombatMode: false,
      combatAvailable: true,
      deathActive: false,
      deathAvailable: true,
      forcedMode: state.forcedMode,
      isActiveCombatant: false
    }),
    "combat"
  );
});

test("automatic mode priority remains death, combat, regular", () => {
  const base = {
    automaticCombatMode: true,
    combatAvailable: true,
    deathAvailable: true,
    forcedMode: null,
    isActiveCombatant: true
  };
  assert.equal(resolveHudMode({ ...base, deathActive: true }), "death");
  assert.equal(resolveHudMode({ ...base, deathActive: false }), "combat");
  assert.equal(
    resolveHudMode({
      ...base,
      automaticCombatMode: false,
      deathActive: false
    }),
    "regular"
  );
});

test("manual death mode remains available before death saves are active", () => {
  assert.equal(
    resolveHudMode({
      automaticCombatMode: false,
      combatAvailable: true,
      deathActive: false,
      deathAvailable: true,
      forcedMode: "death",
      isActiveCombatant: false
    }),
    "death"
  );
});

test("regular views are validated and rendered on demand", () => {
  const state = createHudState();
  assert.equal(setRegularView(state, "skills"), true);
  assert.equal(setRegularView(state, "unknown"), false);
  assert.equal(
    renderRegularView(state.currentView, {
      main: () => "main",
      skills: () => "skills"
    }),
    "skills"
  );
  assert.equal(
    renderHudMode("combat", {
      regular: () => "regular",
      combat: () => "combat"
    }),
    "combat"
  );
});

test("regular HUD keeps initiative beside the actor controls", async () => {
  const source = await readFile(
    new URL("../scripts/rolls-hud.js", import.meta.url),
    "utf8"
  );
  const regularView = source.slice(
    source.indexOf("function normalHTML()"),
    source.indexOf("function combatHTML()")
  );

  assert.match(
    regularView,
    /actorHeader\(`\$\{combatInitiative\(\)\}\$\{inspirationControl\(\)\}`\)/
  );
});

test("extra-large typography and resource shortcut keys have dedicated styles", async () => {
  const css = await readFile(
    new URL("../styles/adventurer-hud.css", import.meta.url),
    "utf8"
  );
  const source = await readFile(
    new URL("../scripts/rolls-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(css, /\.ws-font-extralarge \.ws-view/);
  assert.match(source, /ws-resource-shortcuts ws-shortcuts/);
  assert.match(source, /<kbd>\$\{t\("Combat\.ResourceConsumeKeys"\)\}<\/kbd>/);
});
