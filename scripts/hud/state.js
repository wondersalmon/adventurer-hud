export const HUD_MODES = Object.freeze(["regular", "combat"]);
export const REGULAR_VIEWS = Object.freeze([
  "main",
  "skills",
  "tools",
  "spells",
  "inventory"
]);

/**
 * @param {Partial<import('../../types/hud.js').HudState>} initial
 * @returns {import('../../types/hud.js').HudState}
 */
export function createHudState(initial = {}) {
  return {
    explorationSkillsCollapsed: false,
    combatCategory: null,
    conditionsExpanded: false,
    currentView: "main",
    favoritesExpanded: true,
    itemLayouts: {},
    hudLayouts: {},
    hudEditing: false,
    itemHiddenExpanded: null,
    companionsExpanded: false,
    companionFilter: "scene",
    forcedMode: null,
    inventoryCategory: "equipped",
    preparedSpellsOnly: true,
    showPassiveFeatures: false,
    proficientSkillsOnly: true,
    renderedMode: null,
    searchQuery: "",
    openActivityItemId: null,
    favoriteEntries: [],
    ...initial,
    currentView:
      initial.currentView === "tools"
        ? "skills"
        : (initial.currentView ?? "main")
  };
}

export function setForcedMode(state, mode) {
  state.forcedMode = HUD_MODES.includes(mode) ? mode : null;
  state.currentView = "main";
}

export function syncHudPreferences(
  state,
  { modeNavigation, proficientSkillsOnly }
) {
  state.proficientSkillsOnly = proficientSkillsOnly;
  if (!modeNavigation) state.forcedMode = null;
}

export function setRegularView(state, view) {
  if (!REGULAR_VIEWS.includes(view)) return false;
  state.currentView = view === "tools" ? "skills" : view;
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
