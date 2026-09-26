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
    "data-type"
  ];
  return {
    focus: focused
      ? attributes
          .filter(key => focused.hasAttribute(key))
          .map(key => [key, focused.getAttribute(key)])
      : [],
    scroll: [".ws-gm-roster", ".ws-combat-item-list"].map(selector => [
      selector,
      root?.querySelector(selector)?.scrollTop ?? 0
    ]),
    collapsed: root?.querySelector(".ws-gm-list")?.open === false,
    setupExpanded: root?.querySelector(".ws-gm-encounter-tools")?.open === true
  };
}

export function restoreHudDomState(root, state) {
  if (!root || !state) return;
  for (const [selector, top] of state.scroll) {
    const node = root.querySelector(selector);
    if (node) node.scrollTop = top;
  }
  const list = root.querySelector(".ws-gm-list");
  if (list) list.open = !state.collapsed;
  const setup = root.querySelector(".ws-gm-encounter-tools");
  if (setup) setup.open = state.setupExpanded;
  if (!state.focus.length) return;
  const node = [...root.querySelectorAll("[data-action]")].find(candidate =>
    state.focus.every(([key, value]) => candidate.getAttribute(key) === value)
  );
  node?.focus({ preventScroll: true });
}
