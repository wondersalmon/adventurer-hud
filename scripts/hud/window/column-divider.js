export function bindPlayerDivider(
  root,
  {
    readRatio = () => 0.48,
    saveRatio,
    isPinned = () => false,
    sync,
    handleSelector = ".ws-player-layout > .ws-column-divider",
    viewSelector = ".ws-player-layout",
    infoSelector = ".ws-player-info",
    widthProperty = "--ws-player-left-width",
    limits = () => ({ min: 0.25, max: 0.7, left: 210, right: 232 })
  } = {}
) {
  const doc = root?.ownerDocument;
  let drag = null;
  const contentWidth = view => {
    const style = doc.defaultView.getComputedStyle(view);
    return (
      view.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0)
    );
  };
  const apply = (view, ratio) => {
    const width = contentWidth(view);
    if (!width) return readRatio();
    const bounds = limits(view);
    const boundedRatio = Math.max(bounds.min, Math.min(bounds.max, ratio));
    const left = Math.max(
      bounds.left,
      Math.min(width - bounds.right, width * boundedRatio)
    );
    const value = Math.max(bounds.min, Math.min(bounds.max, left / width));
    view.style.setProperty(widthProperty, `${left}px`);
    view
      .querySelector(handleSelector)
      ?.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    return value;
  };
  const move = event => {
    if (!drag || isPinned()) return;
    if (
      drag.view.querySelector(handleSelector)?.getAttribute("aria-disabled") ===
      "true"
    )
      return cancel();
    if (!root.contains(drag.view)) return cancel();
    drag.ratio = apply(
      drag.view,
      (drag.left + event.clientX - drag.startX) / contentWidth(drag.view)
    );
  };
  const end = () => {
    if (!drag) return;
    const { ratio, view } = drag;
    drag = null;
    if (
      !isPinned() &&
      root.contains(view) &&
      view.querySelector(handleSelector)?.getAttribute("aria-disabled") !==
        "true"
    )
      saveRatio?.(ratio);
  };
  const cancel = () => {
    drag = null;
    sync?.();
  };
  const down = event => {
    const handle = event.target?.closest?.(handleSelector);
    if (
      !handle ||
      !root.contains(handle) ||
      isPinned() ||
      handle.getAttribute("aria-disabled") === "true" ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture?.(event.pointerId);
    const view = handle.closest(viewSelector);
    drag = {
      view,
      ratio: readRatio(),
      startX: event.clientX,
      left: view.querySelector(infoSelector).getBoundingClientRect().width
    };
  };
  const key = event => {
    const handle = event.target?.closest?.(handleSelector);
    if (
      !handle ||
      !root.contains(handle) ||
      isPinned() ||
      handle.getAttribute("aria-disabled") === "true" ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    const view = handle.closest(viewSelector);
    const width = contentWidth(view);
    const left = view.querySelector(infoSelector).getBoundingClientRect().width;
    const current = width && left ? left / width : Number(readRatio());
    const ratio = apply(
      view,
      current + (event.key === "ArrowRight" ? 0.02 : -0.02)
    );
    saveRatio?.(ratio);
  };
  root?.addEventListener("pointerdown", down);
  root?.addEventListener("keydown", key);
  doc?.addEventListener("pointermove", move);
  doc?.addEventListener("pointerup", end);
  doc?.addEventListener("pointercancel", cancel);
  return () => {
    drag = null;
    root?.removeEventListener("pointerdown", down);
    root?.removeEventListener("keydown", key);
    doc?.removeEventListener("pointermove", move);
    doc?.removeEventListener("pointerup", end);
    doc?.removeEventListener("pointercancel", cancel);
  };
}
