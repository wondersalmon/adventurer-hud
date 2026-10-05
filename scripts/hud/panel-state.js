import { REGULAR_VIEWS } from "./state.js";
import { normalizeItemLayouts } from "./items/item-layout.js";

const BOOLEAN_KEYS = [
  "companionsExpanded",
  "conditionsExpanded",
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
  "skills",
  "inventory"
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
  if (saved.itemLayouts)
    state.itemLayouts = normalizeItemLayouts(saved.itemLayouts);
  if (saved.hudLayouts)
    state.hudLayouts = normalizeItemLayouts(saved.hudLayouts);
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
    ...(Object.keys(state.hudLayouts ?? {}).length
      ? { hudLayouts: normalizeItemLayouts(state.hudLayouts) }
      : {}),
    ...(Object.keys(state.itemLayouts ?? {}).length
      ? { itemLayouts: normalizeItemLayouts(state.itemLayouts) }
      : {}),
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
