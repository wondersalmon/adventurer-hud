export function synchronizeStatusLayout(root) {
  const view = root?.ownerDocument?.defaultView ?? root?.defaultView;
  if (!view?.getComputedStyle) return;
  synchronizeCompanionEffectsLayout(root, view);
  for (const panel of root.querySelectorAll(".ws-combat-statuses")) {
    const row = panel.querySelector(".ws-active-conditions");
    const extra = panel.querySelector(".ws-status-extra");
    const more = panel.querySelector(".ws-status-more");
    const icons = [...panel.querySelectorAll(".ws-status")].sort(
      (left, right) =>
        Number(right.classList.contains("ws-status-concentrating")) -
        Number(left.classList.contains("ws-status-concentrating"))
    );
    if (!row?.clientWidth || !extra || !more || !icons.length) continue;
    const gap = Number.parseFloat(view.getComputedStyle(row).columnGap) || 0;
    const iconWidth =
      Number.parseFloat(view.getComputedStyle(icons[0]).width) || 30;
    const expanded = more.getAttribute("aria-expanded") === "true";
    const limit = panel.closest(".ws-player-footer") ? 5 : icons.length;
    let count = Math.min(limit, icons.length);
    if (
      count < icons.length ||
      count * (iconWidth + gap) - gap > row.clientWidth
    ) {
      more.hidden = false;
      more.textContent = expanded ? "−" : `+${icons.length}`;
      for (let pass = 0; pass < 2; pass++) {
        count = Math.max(
          0,
          Math.min(
            limit,
            icons.length - 1,
            Math.floor(
              (row.clientWidth - more.getBoundingClientRect().width) /
                (iconWidth + gap)
            )
          )
        );
        more.textContent = expanded ? "−" : `+${icons.length - count}`;
      }
    }
    if (icons[0]?.classList.contains("ws-status-concentrating")) {
      count = Math.max(1, count);
      more.textContent = expanded ? "−" : `+${icons.length - count}`;
    }
    const focused = panel.ownerDocument.activeElement;
    for (const icon of icons.slice(0, count)) {
      if (icon.parentElement !== row) row.insertBefore(icon, more);
    }
    for (const icon of icons.slice(count).reverse()) {
      if (icon.parentElement !== extra) extra.prepend(icon);
    }
    if (
      icons.includes(focused) &&
      panel.ownerDocument.activeElement !== focused
    )
      focused.focus({ preventScroll: true });
    more.hidden = count === icons.length;
    more.classList.toggle(
      "ws-status-new",
      icons.slice(count).some(icon => icon.classList.contains("ws-status-new"))
    );
    extra.hidden = more.hidden || !expanded;
  }

  /** Reserve the actual control widths before deciding how many effects fit.
   * Reuse the existing resize/refresh synchronizer and native details state.
   */
  function synchronizeCompanionEffectsLayout(root, view) {
    for (const controls of root.querySelectorAll(".ws-companion-controls")) {
      const effects = controls.querySelector(".ws-companion-effects");
      const more = effects?.querySelector("details");
      const summary = more?.querySelector("summary");
      const extra = more?.querySelector(".ws-companion-effects-extra");
      if (!controls.clientWidth || !effects || !more || !summary || !extra)
        continue;
      const icons = [...effects.querySelectorAll('span[role="img"]')];
      if (!icons.length) continue;
      const buttons = [...controls.children].filter(
        node => node.tagName === "BUTTON"
      );
      const gap = parseFloat(view.getComputedStyle(controls).columnGap) || 0;
      const effectGap =
        parseFloat(view.getComputedStyle(effects).columnGap) || 0;
      const available = Math.max(
        0,
        controls.clientWidth -
          buttons.reduce(
            (total, button) => total + button.getBoundingClientRect().width,
            0
          ) -
          gap * buttons.length
      );
      const iconWidth = parseFloat(view.getComputedStyle(icons[0]).width) || 20;
      const label = summary.querySelector(".ws-companion-effects-count");
      let count = Math.min(3, icons.length);
      if (
        count < icons.length ||
        count * (iconWidth + effectGap) - effectGap > available
      ) {
        more.hidden = false;
        for (let pass = 0; pass < 2; pass++) {
          if (label) label.textContent = `+${icons.length - count}`;
          const summaryWidth = summary.getBoundingClientRect().width;
          count = Math.min(
            count,
            Math.max(
              0,
              Math.floor((available - summaryWidth) / (iconWidth + effectGap))
            )
          );
        }
      }
      for (const icon of icons.slice(0, count))
        if (icon.parentElement !== effects) effects.insertBefore(icon, more);
      for (const icon of icons.slice(count).reverse())
        if (icon.parentElement !== extra) extra.prepend(icon);
      more.hidden = count === icons.length;
      if (label) label.textContent = `+${icons.length - count}`;
    }
  }
}
