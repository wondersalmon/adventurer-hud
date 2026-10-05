export function bindPlayerDivider(
  root,
  { readRatio = () => 0.48, saveRatio, isPinned = () => false, sync } = {}
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
    const boundedRatio = Math.max(0.25, Math.min(0.7, ratio));
    const left = Math.max(210, Math.min(width - 232, width * boundedRatio));
    const value = Math.max(0.25, Math.min(0.7, left / width));
    view.style.setProperty("--ws-player-left-width", `${left}px`);
    view
      .querySelector(".ws-column-divider")
      ?.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    return value;
  };
  const move = event => {
    if (!drag || isPinned()) return;
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
    if (!isPinned() && root.contains(view)) saveRatio?.(ratio);
  };
  const cancel = () => {
    drag = null;
    sync?.();
  };
  const down = event => {
    const handle = event.target?.closest?.(".ws-column-divider");
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
    const view = handle.closest(".ws-player-layout");
    drag = {
      view,
      ratio: readRatio(),
      startX: event.clientX,
      left: view.querySelector(".ws-player-info").getBoundingClientRect().width
    };
  };
  const key = event => {
    const handle = event.target?.closest?.(".ws-column-divider");
    if (
      !handle ||
      isPinned() ||
      handle.getAttribute("aria-disabled") === "true" ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    const view = handle.closest(".ws-player-layout");
    const width = contentWidth(view);
    const left = view
      .querySelector(".ws-player-info")
      .getBoundingClientRect().width;
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
