export function captureHudDomState(root) {
  const activeElement = root?.ownerDocument?.activeElement;
  const focused =
    activeElement && root.contains(activeElement) ? activeElement : null;
  const attributes = [
    "data-action",
    "data-combatant-id",
    "data-item-id",
    "data-activity-id",
    "data-key",
    "data-category",
    "data-type",
    "data-gm-combat-select",
    "data-open-actor-sheet",
    "name",
    "id"
  ];
  return {
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
      ".ws-gm-content",
      ".ws-gm-combat",
      ".ws-gm-body",
      ".ws-gm-info",
      ".ws-gm-action-column",
      ".ws-gm-more-actions"
    ].map(selector => [
      selector,
      root?.querySelector(selector)?.scrollTop ?? 0
    ]),
    collapsed: root?.querySelector(".ws-gm-list")?.open === false,
    playersCollapsed:
      root?.querySelector(".ws-gm-player-roster")?.open === false,
    setupExpanded: root?.querySelector(".ws-gm-encounter-tools")?.open === true,
    moreExpanded:
      root?.querySelector(".ws-gm-more")?.open === true ||
      root?.querySelector(".ws-gm-more")?.classList.contains("ws-expanded") ===
        true
  };
}

export function restoreHudDomState(root, state) {
  if (!root || !state) return;
  for (const [selector, top] of state.scroll) {
    const node = root.querySelector(selector);
    if (node) node.scrollTop = top;
  }
  const list = root.querySelector(".ws-gm-list");
  if (list?.tagName === "DETAILS") list.open = !state.collapsed;
  const players = root.querySelector(".ws-gm-player-roster");
  if (players) players.open = !state.playersCollapsed;
  const setup = root.querySelector(".ws-gm-encounter-tools");
  if (setup) setup.open = state.setupExpanded;
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
  ].find(candidate =>
    state.focus.every(([key, value]) => candidate.getAttribute(key) === value)
  );
  node?.focus({ preventScroll: true });
  if (state.selection) node?.setSelectionRange?.(...state.selection);
}
