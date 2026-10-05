export function expandedHudSection(root, action, target) {
  const sections = {
    togglecompanions: ".ws-companions-panel",
    togglefavorites: ".ws-favorites",
    toggleconditions: ".ws-combat-statuses"
  };
  const section = sections[action]
    ? root?.querySelector(sections[action])
    : null;
  if (section?.querySelector('[aria-expanded="true"]')) return section;
  if (action === "view") {
    const selected = [
      ...(root?.querySelectorAll("[data-exploration-section]") ?? [])
    ].find(
      header =>
        header.dataset.view === target?.dataset.view &&
        header.getAttribute("aria-expanded") === "true"
    );
    return selected
      ?.closest(".ws-exploration-section")
      ?.querySelector(".ws-exploration-section-body");
  }
  if (action === "combatfilter") {
    const header = [
      ...(root?.querySelectorAll(".ws-combat-filter[data-category]") ?? [])
    ].find(
      node =>
        node.dataset.category === target?.dataset.category &&
        node.getAttribute("aria-expanded") === "true"
    );
    return header
      ?.closest(".ws-combat-actions")
      ?.querySelector(":scope > .ws-combat-item-list");
  }
  return null;
}

// Remember where an expansion began so collapsing returns within the same column.
export function createHudSectionReveal() {
  const positions = new Map();
  const capture = (root, action, target) => {
    if (
      !root ||
      ![
        "view",
        "combatfilter",
        "togglecompanions",
        "togglefavorites",
        "toggleconditions"
      ].includes(action)
    )
      return null;
    const control = target?.isConnected
      ? target
      : root.querySelector(`[data-action="${action}"]`);
    if (!control) return null;
    const column = control.closest(
      ".ws-player-info, .ws-player-actions, .ws-gm-info, .ws-gm-action-column"
    );
    const columns = root.querySelector(".ws-player-columns, .ws-gm-body");
    const scroller = columns ? column : control.closest(".ws-player-layout");
    if (!scroller) return null;
    return {
      key: `${action}:${target?.dataset.view ?? target?.dataset.category ?? ""}`,
      selector: `.${[...scroller.classList].find(name => ["ws-player-info", "ws-player-actions", "ws-gm-info", "ws-gm-action-column", "ws-player-layout"].includes(name))}`,
      top: scroller.scrollTop,
      expanded: control.getAttribute("aria-expanded") === "true"
    };
  };
  const finish = (root, action, target, before, enabled) => {
    if (!enabled) {
      positions.clear();
      return;
    }
    if (!before) return;
    const section = expandedHudSection(root, action, target);
    if (section) {
      if (!before.expanded) positions.set(before.key, before);
      revealHudSection(section, root, true);
    } else if (before.expanded) {
      const saved = positions.get(before.key);
      positions.delete(before.key);
      if (saved) {
        const scroller = root.querySelector(saved.selector);
        if (scroller) scroller.scrollTop = saved.top;
      }
    }
  };
  return { capture, finish };
}

// Scroll the nearest overflow container, preserving the other column and the page.
export function revealHudSection(section, root, enabled = true) {
  if (!enabled || !section || !root || !root.contains(section)) return;
  const view = section.ownerDocument.defaultView;
  if (!view?.getComputedStyle) return;
  for (
    let scroller = section.parentElement;
    scroller;
    scroller = scroller.parentElement
  ) {
    const overflow = view.getComputedStyle(scroller).overflowY;
    if (
      /auto|scroll/.test(overflow) &&
      scroller.scrollHeight > scroller.clientHeight
    ) {
      const box = scroller.getBoundingClientRect();
      const content = section.getBoundingClientRect();
      const header = section.matches(".ws-exploration-section-body")
        ? section
            .closest(".ws-exploration-section")
            ?.querySelector("[data-exploration-section]")
        : section.matches(".ws-combat-item-list")
          ? [
              ...(section
                .closest(".ws-combat-actions")
                ?.querySelectorAll('.ws-combat-filter[aria-expanded="true"]') ??
                [])
            ].find(node => node.getClientRects().length)
          : null;
      const start = Math.min(
        content.top,
        header?.getBoundingClientRect().top ?? content.top
      );
      const top = box.top + scroller.clientTop + 6;
      const bottom = top + scroller.clientHeight - 12;
      const delta =
        content.bottom - start > bottom - top || start < top
          ? start - top
          : Math.max(0, Math.min(content.bottom - bottom, start - top));
      if (delta)
        scroller.scrollTo({
          top: scroller.scrollTop + delta,
          behavior: "instant"
        });
      return;
    }
    if (scroller === root) return;
  }
}
