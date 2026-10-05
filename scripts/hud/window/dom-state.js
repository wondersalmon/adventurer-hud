import { synchronizeStatusLayout } from "./status-layout.js";
import { applyPlayerLayout } from "./responsive-layout.js";

export function captureHudDomState(root) {
  const activeElement = root?.ownerDocument?.activeElement;
  const focused =
    activeElement && root.contains(activeElement) ? activeElement : null;
  const attributes = [
    "data-action",
    "data-status-id",
    "data-combatant-id",
    "data-item-id",
    "data-activity-id",
    "data-key",
    "data-companion-uuid",
    "data-companion-direction",
    "data-companion-filter",
    "data-category",
    "data-type",
    "data-proficient",
    "data-prepared",
    "data-spell-level",
    "data-layout-key",
    "data-view",
    "data-scope",
    "data-reroll",
    "data-reset-initiative-id",
    "data-gm-combat-select",
    "data-gm-initiative-options",
    "data-open-actor-sheet",
    "name",
    "id"
  ];
  return {
    spellLevels: Array.from(
      root?.querySelectorAll("details[data-spell-level]") ?? [],
      node => [node.dataset.spellLevel, node.open]
    ),
    playerColumns:
      root
        ?.querySelector(".ws-player-layout")
        ?.classList.contains("ws-player-columns") === true,
    focus: focused
      ? attributes
          .filter(key => focused.hasAttribute(key))
          .map(key => [key, focused.getAttribute(key)])
      : [],
    selection:
      focused && typeof focused.selectionStart === "number"
        ? [
            focused.selectionStart,
            focused.selectionEnd,
            focused.selectionDirection
          ]
        : null,
    scroll: [
      ".ws-gm-roster",
      ".ws-combat-item-list",
      ".ws-player-layout",
      ".ws-player-info",
      ".ws-player-actions",
      ".ws-gm-content",
      ".ws-gm-combat",
      ".ws-gm-body",
      ".ws-gm-info",
      ".ws-gm-action-column",
      ".ws-gm-more-actions"
    ].map(selector => {
      const node = root?.querySelector(selector);
      return [selector, node?.scrollTop ?? 0, node];
    }),
    collapsed: root?.querySelector(".ws-gm-list")?.open === false,
    playersCollapsed:
      root?.querySelector(".ws-gm-player-roster")?.open === false,
    setupExpanded: root?.querySelector(".ws-gm-encounter-tools")?.open === true,
    initiativeOptionsExpanded:
      root?.querySelector(".ws-gm-initiative-options")?.open === true,
    moreExpanded:
      root?.querySelector(".ws-gm-more")?.open === true ||
      root?.querySelector(".ws-gm-more")?.classList.contains("ws-expanded") ===
        true
  };
}

export function restoreHudDomState(root, state) {
  if (!root || !state) return;
  applyPlayerLayout(
    root.querySelector(".ws-player-layout"),
    Boolean(state.playerColumns)
  );
  const defaultBody = root.querySelector("[data-exploration-default-body]");
  if (defaultBody) defaultBody.hidden = !state.playerColumns;
  synchronizeStatusLayout(root);
  for (const [level, open] of state.spellLevels ?? []) {
    const group = Array.from(
      root.querySelectorAll("details[data-spell-level]")
    ).find(node => node.dataset.spellLevel === level);
    if (group) group.open = open;
  }
  for (const [selector, top, previous] of state.scroll) {
    const node = root.querySelector(selector);
    // A freshly rendered scroller already starts at zero. Assigning zero still
    // forces synchronous layout; retain writes for reused nodes and saved offsets.
    if (node && (top !== 0 || !previous || previous === node))
      node.scrollTop = top;
  }
  const list = root.querySelector(".ws-gm-list");
  if (list?.tagName === "DETAILS") list.open = !state.collapsed;
  const players = root.querySelector(".ws-gm-player-roster");
  if (players) players.open = !state.playersCollapsed;
  const setup = root.querySelector(".ws-gm-encounter-tools");
  if (setup) setup.open = state.setupExpanded;
  const initiativeOptions = root.querySelector(".ws-gm-initiative-options");
  if (initiativeOptions)
    initiativeOptions.open = Boolean(state.initiativeOptionsExpanded);
  const more = root.querySelector(".ws-gm-more");
  if (more) {
    if (more.tagName === "DETAILS") more.open = Boolean(state.moreExpanded);
    else more.classList.toggle("ws-expanded", Boolean(state.moreExpanded));
    more
      .querySelector(".ws-gm-more-toggle")
      ?.setAttribute("aria-expanded", String(Boolean(state.moreExpanded)));
  }
  if (!state.focus.length) return;
  const node = [
    ...root.querySelectorAll(
      "button, input, select, textarea, summary, [tabindex], [data-action]"
    )
  ].find(
    candidate =>
      !candidate.disabled &&
      state.focus.every(([key, value]) => candidate.getAttribute(key) === value)
  );
  node?.focus({ preventScroll: true });
  if (state.selection) node?.setSelectionRange?.(...state.selection);
}
