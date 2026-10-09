import { bindPlayerDivider } from "./column-divider.js";

export function bindGmColumnDividers(
  root,
  { readRatio, saveRatio, isPinned, t }
) {
  const columns = [
    {
      key: "roster",
      view: ".ws-gm-view",
      info: ".ws-gm-combat",
      property: "--ws-gm-roster-width",
      min: 0,
      max: 0.85,
      left: 180
    },
    {
      key: "info",
      view: ".ws-gm-body",
      info: ".ws-gm-info",
      property: "--ws-gm-info-width",
      min: 0,
      max: 0.7,
      left: 280
    }
  ];
  const limits = column => ({
    min: column.min,
    max: column.max,
    left: column.left,
    right:
      column.key === "info"
        ? 264
        : root.getBoundingClientRect?.().width >= 900
          ? 560
          : 310
  });
  const sync = () => {
    root
      .querySelector(".ws-gm-view")
      ?.classList.toggle(
        "ws-gm-three-columns",
        root.getBoundingClientRect?.().width >= 900
      );
    for (const column of columns) {
      const view = root.querySelector(column.view);
      if (!view) continue;
      let handle = view.querySelector(
        `:scope > [data-gm-divider="${column.key}"]`
      );
      if (!handle) {
        handle = view.ownerDocument.createElement("button");
        handle.type = "button";
        handle.className = "ws-column-divider ws-gm-column-divider";
        handle.dataset.gmDivider = column.key;
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute(
          "aria-label",
          t(column.key === "roster" ? "GM.ResizeRoster" : "GM.ResizeDetails")
        );
        view.append(handle);
      }
      const ratio = Math.max(
        column.min,
        Math.min(column.max, Number(readRatio(column.key)) || 0)
      );
      const bound = limits(column);
      view.style.setProperty(
        column.property,
        `clamp(${bound.left}px, ${ratio * 100}%, calc(100% - ${bound.right}px))`
      );
      const visible =
        root.ownerDocument.defaultView.getComputedStyle?.(handle)?.display !==
        "none";
      const disabled = isPinned() || !visible;
      handle.setAttribute("aria-disabled", String(disabled));
      handle.setAttribute("aria-valuemin", String(column.min * 100));
      handle.setAttribute("aria-valuemax", String(column.max * 100));
      handle.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      handle.tabIndex = disabled ? -1 : 0;
    }
  };
  const disposers = columns.map(column =>
    bindPlayerDivider(root, {
      handleSelector: `[data-gm-divider="${column.key}"]`,
      viewSelector: column.view,
      infoSelector: column.info,
      widthProperty: column.property,
      limits: () => limits(column),
      readRatio: () => readRatio(column.key),
      saveRatio: value => saveRatio(column.key, value),
      isPinned,
      sync
    })
  );
  return { sync, dispose: () => disposers.forEach(dispose => dispose()) };
}
