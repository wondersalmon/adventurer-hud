import { REGULAR_VIEWS } from "./state.js";

const BOOLEAN_KEYS = [
  "abilitiesExpanded",
  "combatAbilitiesExpanded",
  "actionMenuOpen",
  "favoritesExpanded",
  "preparedSpellsOnly",
  "resourcesExpanded"
];

const COMBAT_CATEGORIES = new Set([
  "weapons",
  "spells",
  "action",
  "bonus",
  "reaction",
  "special"
]);
const INVENTORY_CATEGORIES = new Set(["equipped", "consumables", "other"]);

export function panelStateForActor(stored, actorUuid) {
  const saved = stored?.[actorUuid];
  if (!saved || typeof saved !== "object") return {};

  const state = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof saved[key] === "boolean") state[key] = saved[key];
  }
  if (
    saved.combatCategory === null ||
    COMBAT_CATEGORIES.has(saved.combatCategory)
  ) {
    state.combatCategory = saved.combatCategory;
  }
  if (INVENTORY_CATEGORIES.has(saved.inventoryCategory)) {
    state.inventoryCategory = saved.inventoryCategory;
  }
  if (REGULAR_VIEWS.includes(saved.currentView)) {
    state.currentView = saved.currentView;
  }
  return state;
}

export function panelStateSnapshot(state) {
  return {
    ...Object.fromEntries(BOOLEAN_KEYS.map(key => [key, Boolean(state[key])])),
    combatCategory: COMBAT_CATEGORIES.has(state.combatCategory)
      ? state.combatCategory
      : null,
    currentView: REGULAR_VIEWS.includes(state.currentView)
      ? state.currentView
      : "main",
    inventoryCategory: INVENTORY_CATEGORIES.has(state.inventoryCategory)
      ? state.inventoryCategory
      : "equipped"
  };
}
