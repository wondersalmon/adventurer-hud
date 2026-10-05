export function synchronizeStatusLayout(root) {
  const view = root?.ownerDocument?.defaultView ?? root?.defaultView;
  if (!view?.getComputedStyle) return;
  for (const panel of root.querySelectorAll(".ws-combat-statuses")) {
    const row = panel.querySelector(".ws-active-conditions");
    const extra = panel.querySelector(".ws-status-extra");
    const more = panel.querySelector(".ws-status-more");
    const icons = [...panel.querySelectorAll(".ws-status")];
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
}
