import assert from "node:assert/strict";
import test from "node:test";

import {
  createHudState,
  resolveHudMode,
  setForcedMode,
  setRegularView,
  syncHudPreferences
} from "../scripts/hud/state.js";
import { renderHudMode, renderRegularView } from "../scripts/render/index.js";
import {
  panelStateForActor,
  panelStateSnapshot
} from "../scripts/hud/panel-state.js";

test("panel layout is restored per actor and ignores transient state", () => {
  const state = createHudState({
    combatAbilitiesExpanded: true,
    conditionsExpanded: true,
    combatCategory: "spells",
    currentView: "inventory",
    searchQuery: "sword",
    openActivityItemId: "item-1"
  });
  const stored = { "Actor.hero": panelStateSnapshot(state) };
  assert.deepEqual(panelStateForActor(stored, "Actor.hero"), {
    abilitiesExpanded: true,
    combatAbilitiesExpanded: true,
    conditionsExpanded: true,
    actionMenuOpen: false,
    favoritesExpanded: true,
    preparedSpellsOnly: true,
    combatCategory: "spells",
    currentView: "inventory",
    inventoryCategory: "equipped"
  });
  assert.deepEqual(panelStateForActor(stored, "Actor.other"), {});
  assert.equal(
    panelStateForActor(
      { "Actor.hero": { combatCategory: "resources" } },
      "Actor.hero"
    ).combatCategory,
    "features"
  );
  state.combatCategory = "features";
  assert.equal(
    panelStateForActor(
      { "Actor.hero": panelStateSnapshot(state) },
      "Actor.hero"
    ).combatCategory,
    "features"
  );
  assert.equal(stored["Actor.hero"].searchQuery, undefined);
  assert.equal(stored["Actor.hero"].openActivityItemId, undefined);
  assert.deepEqual(
    panelStateForActor(
      { "Actor.hero": { combatCategory: "invalid" } },
      "Actor.hero"
    ),
    {}
  );
});

test("manual mode is limited to exploration and combat", () => {
  const state = createHudState({ currentView: "skills" });
  assert.equal(state.abilitiesExpanded, true);
  assert.equal(state.proficientSkillsOnly, true);
  assert.equal(state.combatAbilitiesExpanded, false);
  assert.equal(state.conditionsExpanded, false);
  assert.equal(state.combatCategory, null);
  setForcedMode(state, "combat");
  assert.equal(state.forcedMode, "combat");
  assert.equal(state.currentView, "main");

  assert.equal(
    resolveHudMode({
      combatAvailable: true,
      forcedMode: state.forcedMode,
      isActiveCombatant: false
    }),
    "combat"
  );
  setForcedMode(state, "death");
  assert.equal(state.forcedMode, null);
});

test("automatic mode chooses combat for active combatants", () => {
  const base = {
    combatAvailable: true,
    forcedMode: null,
    isActiveCombatant: true
  };
  assert.equal(resolveHudMode(base), "combat");
  assert.equal(
    resolveHudMode({
      ...base,
      combatAvailable: false
    }),
    "regular"
  );
});

test("hiding mode buttons restores automatic mode without losing the selected view", () => {
  const state = createHudState({
    forcedMode: "regular",
    currentView: "inventory"
  });
  const mode = () =>
    resolveHudMode({
      combatAvailable: true,
      isActiveCombatant: true,
      forcedMode: state.forcedMode
    });
  syncHudPreferences(state, {
    modeNavigation: true,
    proficientSkillsOnly: false
  });
  assert.equal(mode(), "regular");
  syncHudPreferences(state, {
    modeNavigation: false,
    proficientSkillsOnly: true
  });
  assert.equal(state.forcedMode, null);
  assert.equal(mode(), "combat");
  assert.equal(state.currentView, "inventory");
  assert.equal(state.proficientSkillsOnly, true);
  syncHudPreferences(state, {
    modeNavigation: true,
    proficientSkillsOnly: true
  });
  assert.equal(mode(), "combat");
});

test("regular views are validated and rendered on demand", () => {
  const state = createHudState();
  assert.equal(state.inventoryCategory, "equipped");
  assert.equal(setRegularView(state, "skills"), true);
  assert.equal(setRegularView(state, "inventory"), true);
  assert.equal(state.currentView, "inventory");
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
