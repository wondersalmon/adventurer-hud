export const HUD_MODES = Object.freeze(["regular", "combat"]);
export const REGULAR_VIEWS = Object.freeze([
  "main",
  "skills",
  "tools",
  "spells",
  "inventory"
]);

export function createHudState(initial = {}) {
  return {
    abilitiesExpanded: true,
    combatAbilitiesExpanded: false,
    combatCategory: "weapons",
    actionMenuOpen: false,
    currentView: "main",
    favoritesExpanded: true,
    forcedMode: null,
    inventoryCategory: "equipped",
    preparedSpellsOnly: true,
    proficientSkillsOnly: true,
    resourcesExpanded: false,
    renderedMode: null,
    searchQuery: "",
    openActivityItemId: null,
    favoriteEntries: [],
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
  combatAvailable,
  forcedMode,
  isActiveCombatant
}) {
  if (forcedMode === "regular") return "regular";
  if (forcedMode === "combat" && combatAvailable) return "combat";
  if (combatAvailable && isActiveCombatant) return "combat";
  return "regular";
}
