// @ts-check
/** Saved layout model; no DOM, native documents or storage writes. */
/** @type {[string, string, string][]} */
export const HUD_LAYOUT_BLOCKS = [
  ["shared-senses", ".ws-familiar-vision", "Companions.VisionAction"],
  ["identity", ".ws-actor-header, .ws-gm-identity", "HudLayout.Identity"],
  ["token-controls", ".ws-gm-identity-actions", "GM.CreatureControls"],
  ["return", ".ws-companion-navigation", "HudLayout.Return"],
  ["hp", ".ws-regular-health, .ws-health-stack", "Combat.HP"],
  ["rests", ".ws-exploration-rests", "Labels.Rests"],
  ["effects", ".ws-combat-statuses", "HudLayout.Effects"],
  ["favorites", ".ws-player-favorites", "Quick.Favorites"],
  [
    "stats",
    ".ws-regular-stats, .ws-player-stats, .ws-gm-info > .ws-combat-stats",
    "HudLayout.Stats"
  ],
  ["abilities", ".ws-ability-table, .ws-gm-saves", "HudLayout.Abilities"],
  ["companions", ".ws-companions-panel", "Companions.Title"],
  ["actions", ".ws-combat-actions, .ws-exploration-nav", "HudLayout.Actions"],
  ["resources", ".ws-gm-resources", "HudLayout.Resources"],
  ["traits", ".ws-gm-traits", "HudLayout.Traits"],
  ["search", ".ws-global-search, .ws-item-search", "Quick.Search"],
  ["hints", ".ws-shortcuts", "HudLayout.Hints"],
  ["setup", ".ws-gm-encounter-tools", "GM.CombatSetup"],
  ["creatures", ".ws-gm-preparation-creatures", "GM.Creatures"],
  ["players", ".ws-gm-preparation-players", "GM.Players"]
];

/** @param {Partial<import('../../../types/hud.js').HudState>|undefined} state @param {string} key */
export const hudElementHidden = (state, key) =>
  Object.entries(state?.hudLayouts ?? {}).some(
    ([scope, preference]) =>
      /^(regular|combat|preparation):(info|actions|extra|footer|tabs|expanded)$/.test(
        scope
      ) && preference.hidden.includes(key)
  );

/** @param {import('../../../types/hud.js').ItemLayouts} layouts */
const copyLayouts = layouts =>
  Object.fromEntries(
    Object.entries(layouts ?? {}).map(([key, value]) => [
      key,
      { order: [...value.order], hidden: [...value.hidden] }
    ])
  );

/** @param {import('../../../types/hud.js').HudState} state @param {string} mode @returns {import('../../../types/hud.js').HudLayoutUndo} */
export const captureHudLayoutUndo = (state, mode) => ({
  mode,
  hudLayouts: copyLayouts(state.hudLayouts),
  itemLayouts: copyLayouts(state.itemLayouts),
  viewState: {
    currentView: state.currentView,
    combatCategory: state.combatCategory,
    explorationSkillsCollapsed: state.explorationSkillsCollapsed,
    searchQuery: state.searchQuery
  }
});

/** @param {import('../../../types/hud.js').HudState} state @param {import('../../../types/hud.js').HudLayoutUndo} snapshot */
export function rememberHudLayoutChange(state, snapshot) {
  for (const key of /** @type {(keyof typeof snapshot.viewState)[]} */ (
    Object.keys(snapshot.viewState)
  ))
    if (snapshot.viewState[key] === state[key]) delete snapshot.viewState[key];
  state.hudLayoutUndo = snapshot;
}

/** @param {import('../../../types/hud.js').HudState} state */
export function restoreHudLayoutSnapshot(state) {
  const snapshot = state.hudLayoutUndo;
  if (!snapshot) return;
  state.hudLayouts = copyLayouts(snapshot.hudLayouts);
  state.itemLayouts = copyLayouts(snapshot.itemLayouts);
  Object.assign(state, snapshot.viewState);
  state.hudLayoutUndo = null;
}

/** Interpret released grouped ordering without changing saved preferences.
 * @param {import('../../../types/hud.js').HudState} state
 * @param {string} mode @param {string} lane @param {string[]} sectionKeys
 */
export function hudLaneOrder(state, mode, lane, sectionKeys) {
  const explicitlyPlaced = new Set(
    ["info", "actions", "extra"].flatMap(
      name => state.hudLayouts[`${mode}:${name}`]?.order ?? []
    )
  );
  const order = state.hudLayouts[`${mode}:tabs`]?.order ?? [];
  const grouped = [
    ...order,
    ...sectionKeys.filter(key => !order.includes(key))
  ].filter(key => sectionKeys.includes(key) && !explicitlyPlaced.has(key));
  return (state.hudLayouts[`${mode}:${lane}`]?.order ?? []).flatMap(key =>
    key === "actions" && sectionKeys.length ? grouped : [key]
  );
}

/** @param {import('../../../types/hud.js').HudState} state @param {string} mode @param {string} key @param {string} laneName @param {string[]} sectionKeys */
export function toggleHudBlockHidden(state, mode, key, laneName, sectionKeys) {
  const shared = key === "search" || key === "hints";
  if (mode === "regular" && key.startsWith("tab:")) {
    for (const [scope, preference] of Object.entries(state.hudLayouts)) {
      if (scope.startsWith("regular:") && preference.hidden.includes("actions"))
        preference.hidden = [
          ...new Set([
            ...preference.hidden.filter(id => id !== "actions"),
            ...sectionKeys
          ])
        ];
    }
  }
  const scope = `${mode}:${laneName}`;
  const preference = state.hudLayouts[scope] ?? { order: [], hidden: [] };
  const wasHidden = Object.entries(state.hudLayouts).some(
    ([scope, value]) =>
      (shared || scope.startsWith(`${mode}:`)) && value.hidden.includes(key)
  );
  if (wasHidden)
    for (const [scope, value] of Object.entries(state.hudLayouts)) {
      if (shared || scope.startsWith(`${mode}:`))
        value.hidden = value.hidden.filter(id => id !== key);
    }
  else
    state.hudLayouts[scope] = {
      ...preference,
      hidden: [...preference.hidden, key]
    };
  if (key === "search") state.searchQuery = "";
  if (!wasHidden && key.startsWith("tab:")) {
    const category = key.slice(4);
    if (state.combatCategory === category) state.combatCategory = null;
    if (state.currentView === category) {
      state.currentView = "main";
      if (category === "skills") state.explorationSkillsCollapsed = true;
    }
  }
}

/** @param {import('../../../types/hud.js').HudState} state @param {string} mode @param {string} key */
export function resetHudBlockPreferences(state, mode, key) {
  const shared = key === "search" || key === "hints";
  for (const [scope, value] of Object.entries(state.hudLayouts)) {
    if (!scope.startsWith(`${mode}:`) && !shared) continue;
    if (scope.startsWith(`${mode}:`))
      value.order = value.order.filter(id => id !== key);
    value.hidden = value.hidden.filter(id => id !== key);
  }
}
