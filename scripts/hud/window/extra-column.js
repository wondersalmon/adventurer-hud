import { bindPlayerDivider } from "./column-divider.js";

/** @param {HTMLElement} view @param {import('../../../types/hud.js').HudState} state @param {string} mode @param {(key:string)=>string} t */
export function synchronizeExtraColumn(view, state, mode, t) {
  const enabled = Boolean(state.hudLayouts[`${mode}:extra`]);
  let wrapper = view.querySelector(":scope > .ws-hud-secondary-columns");
  if (!enabled) {
    if (wrapper) {
      const actions = wrapper.querySelector(
        ".ws-player-actions, .ws-gm-action-column"
      );
      const extra = wrapper.querySelector('[data-hud-lane="extra"]');
      if (actions) {
        for (const node of [...(extra?.children ?? [])])
          if (node.hasAttribute("data-hud-block")) actions.append(node);
        wrapper.before(actions);
      }
      wrapper.remove();
    }
    return;
  }
  if (!wrapper) {
    const actions = view.querySelector(
      ".ws-player-actions, .ws-gm-action-column"
    );
    if (!actions) return;
    wrapper = view.ownerDocument.createElement("div");
    wrapper.className = "ws-hud-secondary-columns";
    actions.before(wrapper);
    wrapper.append(actions);
    const divider = view.ownerDocument.createElement("button");
    divider.type = "button";
    divider.className = "ws-column-divider ws-extra-column-divider";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");
    divider.setAttribute("aria-label", t("HudLayout.ResizeExtraColumn"));
    wrapper.append(divider);
    const lane = view.ownerDocument.createElement("section");
    lane.className = "ws-hud-extra-lane";
    lane.dataset.hudLane = "extra";
    lane.setAttribute("aria-label", t("HudLayout.ExtraColumn"));
    const hint = view.ownerDocument.createElement("span");
    hint.className = "ws-extra-column-hint";
    hint.textContent = t("HudLayout.DropHere");
    lane.append(hint);
    wrapper.append(lane);
  }
}

export function bindExtraColumn(root, { readRatio, saveRatio, isPinned }) {
  const observed = new Set();
  const sync = () => {
    for (const wrapper of observed) {
      if (root.contains(wrapper)) continue;
      observer?.unobserve(wrapper);
      observed.delete(wrapper);
    }
    for (const wrapper of root.querySelectorAll(".ws-hud-secondary-columns")) {
      const wide = wrapper.clientWidth >= 420;
      wrapper.classList.toggle("ws-hud-secondary-wide", wide);
      const ratio = Math.max(0.25, Math.min(0.7, Number(readRatio()) || 0.5));
      wrapper.style.setProperty(
        "--ws-hud-main-width",
        `clamp(180px, ${ratio * 100}%, calc(100% - 196px))`
      );
      const divider = wrapper.querySelector(".ws-extra-column-divider");
      divider.setAttribute("aria-disabled", String(isPinned() || !wide));
      divider.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      divider.setAttribute("aria-valuemin", "25");
      divider.setAttribute("aria-valuemax", "70");
      divider.tabIndex = wide && !isPinned() ? 0 : -1;
      if (!observed.has(wrapper)) {
        observer?.observe(wrapper);
        observed.add(wrapper);
      }
    }
  };
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
  const unbind = bindPlayerDivider(root, {
    readRatio,
    saveRatio,
    isPinned,
    sync,
    handleSelector: ".ws-extra-column-divider",
    viewSelector: ".ws-hud-secondary-columns",
    infoSelector: ".ws-player-actions, .ws-gm-action-column",
    widthProperty: "--ws-hud-main-width",
    limits: () => ({ min: 0.25, max: 0.7, left: 180, right: 196 })
  });
  return {
    sync,
    dispose: () => {
      observer?.disconnect();
      observed.clear();
      unbind();
    }
  };
}
