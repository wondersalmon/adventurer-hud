import { REGULAR_VIEWS } from "./state.js";

const BOOLEAN_KEYS = [
  "companionsExpanded",
  "abilitiesExpanded",
  "combatAbilitiesExpanded",
  "conditionsExpanded",
  "actionMenuOpen",
  "favoritesExpanded",
  "preparedSpellsOnly",
  "showPassiveFeatures"
];

const COMBAT_CATEGORIES = new Set([
  "weapons",
  "spells",
  "action",
  "bonus",
  "reaction",
  "special",
  "features",
  "skills"
]);
const INVENTORY_CATEGORIES = new Set(["equipped", "consumables", "other"]);

// Dynamic action kinds come from the system; availability is checked by the renderer.
const validCombatCategory = value =>
  COMBAT_CATEGORIES.has(value) ||
  (typeof value === "string" &&
    value.startsWith("activation:") &&
    value.length > 11 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value));

export function panelStateForActor(stored, actorUuid) {
  const saved = stored?.[actorUuid];
  if (!saved || typeof saved !== "object") return {};

  const state = {};
  if (saved.combatCategory === "resources") state.combatCategory = "features";
  for (const key of BOOLEAN_KEYS) {
    if (typeof saved[key] === "boolean") state[key] = saved[key];
  }
  if (
    saved.combatCategory === null ||
    validCombatCategory(saved.combatCategory)
  ) {
    state.combatCategory = saved.combatCategory;
  }
  if (INVENTORY_CATEGORIES.has(saved.inventoryCategory)) {
    state.inventoryCategory = saved.inventoryCategory;
  }
  if (REGULAR_VIEWS.includes(saved.currentView)) {
    state.currentView = saved.currentView;
  }
  if (
    typeof saved.companionsExpanded !== "boolean" &&
    ["character", "companions"].includes(saved.companionTab)
  )
    state.companionsExpanded = saved.companionTab === "companions";
  return state;
}

export function panelStateSnapshot(state) {
  return {
    ...Object.fromEntries(BOOLEAN_KEYS.map(key => [key, Boolean(state[key])])),
    combatCategory: validCombatCategory(state.combatCategory)
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
