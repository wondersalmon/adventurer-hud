export const HUD_MODES = Object.freeze(["regular", "combat", "death"]);
export const REGULAR_VIEWS = Object.freeze([
  "main",
  "skills",
  "tools",
  "spells"
]);

export function createHudState(initial = {}) {
  return {
    combatCategory: "weapons",
    currentView: "main",
    editMode: false,
    forcedMode: null,
    preparedSpellsOnly: true,
    resourcesExpanded: false,
    savingThrowsExpanded: true,
    ...initial
  };
}

export function setForcedMode(state, mode) {
  state.forcedMode = HUD_MODES.includes(mode) ? mode : null;
  state.currentView = "main";
}

export function setRegularView(state, view) {
  if (!REGULAR_VIEWS.includes(view)) return false;
  state.currentView = view;
  return true;
}

export function resolveHudMode({
  automaticCombatMode,
  combatAvailable,
  deathAvailable,
  editMode,
  forcedMode,
  isActiveCombatant
}) {
  if (forcedMode === "regular") return "regular";
  if (forcedMode === "combat" && combatAvailable) return "combat";
  if (forcedMode === "death" && (editMode || deathAvailable)) return "death";
  if (deathAvailable) return "death";
  if (automaticCombatMode && isActiveCombatant) return "combat";
  return "regular";
}
