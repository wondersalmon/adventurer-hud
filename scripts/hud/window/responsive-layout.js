import { bindPlayerDivider } from "./column-divider.js";
import { synchronizeStatusLayout } from "./status-layout.js";

export function applyPlayerLayout(view, columns) {
  view?.classList.toggle("ws-player-columns", columns);
  const inspiration = view?.querySelector(".ws-inspiration");
  const inspirationSlot = view?.querySelector(".ws-actor-inspiration-slot");
  if (
    inspiration &&
    inspirationSlot &&
    inspiration.parentElement !== inspirationSlot
  ) {
    const focused = inspiration.ownerDocument.activeElement;
    inspirationSlot.prepend(inspiration);
    if (focused === inspiration) inspiration.focus?.({ preventScroll: true });
  }
  const footer = view
    ?.closest(".ws-player-frame")
    ?.querySelector(".ws-player-footer");
  if (footer) {
    for (const [selector, targetSelector] of [
      [".ws-combat-statuses", ".ws-footer-effects"],
      [".ws-header-end-turn", ".ws-footer-controls"],
      ['[data-action="actorcenter"]', ".ws-footer-controls"]
    ]) {
      const control = view.querySelector(selector);
      const target = footer.querySelector(targetSelector);
      if (!control || !target) continue;
      const focused = control.ownerDocument.activeElement;
      const preserveFocus = focused && control.contains(focused);
      if (selector === ".ws-header-end-turn") target.prepend(control);
      else target.append(control);
      if (preserveFocus) focused.focus?.({ preventScroll: true });
    }
  }
  if (view && !view.querySelector(".ws-column-divider")) {
    const divider = view.ownerDocument.createElement("button");
    divider.type = "button";
    divider.className = "ws-column-divider";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");
    divider.setAttribute(
      "aria-label",
      view.dataset.dividerLabel || "Resize columns"
    );
    view.append(divider);
  }
  const initiative = view?.querySelector(".ws-header-initiative");
  const slot = view?.querySelector(".ws-player-initiative-slot");
  if (initiative && slot && initiative.parentElement !== slot) {
    const focused = initiative.ownerDocument?.activeElement;
    const preserveFocus = focused && initiative.contains(focused);
    slot.replaceChildren(initiative);
    if (preserveFocus) focused.focus?.({ preventScroll: true });
  }
  const favorites = view?.querySelector(".ws-player-favorites");
  const destination = view?.querySelector(
    columns ? ".ws-player-actions" : ".ws-player-info"
  );
  if (favorites && destination && favorites.parentElement !== destination) {
    const focused = favorites.ownerDocument?.activeElement;
    const preserveFocus = focused && favorites.contains(focused);
    if (columns) destination.prepend(favorites);
    else {
      const anchor =
        destination.querySelector(".ws-combat-statuses") ??
        destination.querySelector(".ws-regular-health, .ws-health-stack");
      anchor?.after(favorites);
    }
    if (preserveFocus) focused.focus?.({ preventScroll: true });
  }
  const companions = view?.querySelector(".ws-companions-panel");
  if (companions && destination && companions.parentElement !== destination) {
    const focused = companions.ownerDocument?.activeElement;
    const preserveFocus = focused && companions.contains(focused);
    const anchor = destination.querySelector(
      columns ? ".ws-player-favorites" : ".ws-ability-table"
    );
    if (anchor) anchor.after(companions);
    else destination.prepend(companions);
    if (preserveFocus) focused.focus?.({ preventScroll: true });
  }
}

export function synchronizePlayerLayout(
  root,
  threshold = 450,
  fallbackWidth = 0,
  ratio = 0.48
) {
  const shell = root?.querySelector(".ws-shell");
  const panel = shell?.closest(".ws-rolls-dialog");
  const width = panel?.getBoundingClientRect?.().width || fallbackWidth;
  for (const view of shell?.querySelectorAll(".ws-player-layout") ?? []) {
    const columns =
      width >= Math.min(1200, Math.max(450, Number(threshold) || 450));
    applyPlayerLayout(view, columns);
    view.classList.toggle("ws-player-actions-compact", width <= 700);
    const safeRatio = Math.min(0.7, Math.max(0.25, Number(ratio) || 0.48));
    view.style.setProperty(
      "--ws-player-left-width",
      safeRatio === 0.52
        ? "clamp(210px, 52%, min(400px, calc(100% - 232px)))"
        : `clamp(210px, ${safeRatio * 100}%, calc(100% - 232px))`
    );
    const divider = view.querySelector(".ws-column-divider");
    const pinned = panel?.classList.contains("ws-pinned");
    divider.setAttribute("aria-valuenow", String(Math.round(safeRatio * 100)));
    divider.setAttribute("aria-valuemin", "25");
    divider.setAttribute("aria-valuemax", "70");
    divider.setAttribute("aria-disabled", String(Boolean(pinned || !columns)));
    divider.tabIndex = columns && !pinned ? 0 : -1;
    const header = view.querySelector('[data-exploration-default="true"]');
    const body = view.querySelector("[data-exploration-default-body]");
    if (header && body) {
      body.hidden = !columns;
      header.setAttribute("aria-expanded", String(columns));
      header.classList.toggle("ws-active", columns);
      header
        .closest(".ws-exploration-section")
        ?.classList.toggle("ws-expanded", columns);
      const arrow = header.querySelector(".ws-arrow");
      arrow?.classList.toggle("fa-chevron-up", columns);
      arrow?.classList.toggle("fa-chevron-down", !columns);
    }
  }
  synchronizeStatusLayout(root);
}

export function watchPlayerLayout(app, readThreshold, options = {}) {
  const sync = () => {
    synchronizePlayerLayout(
      app.element,
      readThreshold(),
      Number(app.position?.width) || 0,
      options.readRatio?.() ?? 0.48
    );
    options.afterSync?.();
  };
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
  if (app.element) observer?.observe(app.element);
  const unbind = bindPlayerDivider(app.element, { ...options, sync });
  sync();
  return {
    sync,
    dispose: () => {
      observer?.disconnect();
      unbind();
    }
  };
}
