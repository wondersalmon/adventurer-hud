import assert from "node:assert/strict";
import test from "node:test";

import { normalizeModeLayout } from "../scripts/hud/layout.js";
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
      deathAvailable: true,
      editMode: false,
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
    editMode: false,
    forcedMode: null,
    isActiveCombatant: true
  };
  assert.equal(resolveHudMode({ ...base, deathAvailable: true }), "death");
  assert.equal(resolveHudMode({ ...base, deathAvailable: false }), "combat");
  assert.equal(
    resolveHudMode({
      ...base,
      automaticCombatMode: false,
      deathAvailable: false
    }),
    "regular"
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

test("saved layouts are normalized against the current schema", () => {
  assert.deepEqual(
    normalizeModeLayout("regular", {
      order: ["shortcuts", "removed", "abilities"],
      hidden: ["destinations", "removed"]
    }),
    {
      order: ["shortcuts", "abilities", "navigation", "destinations"],
      hidden: ["destinations"]
    }
  );
});
