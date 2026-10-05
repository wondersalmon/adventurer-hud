// @ts-check
/** @param {any} app Native ApplicationV2. @param {(key:string)=>string} t */
export function bindHudAxisResize(app, t) {
  const root = /** @type {HTMLElement} */ (app.element);
  const doc = root.ownerDocument;
  /** @type {HTMLElement[]} */
  const handles = ["east", "west", "south", "north"].map(edge => {
    const handle = doc.createElement("div");
    handle.className = `ws-axis-resize ws-axis-${edge}`;
    handle.dataset.resizeAxis = edge;
    handle.setAttribute("role", "separator");
    handle.setAttribute(
      "aria-orientation",
      edge === "east" || edge === "west" ? "vertical" : "horizontal"
    );
    handle.setAttribute(
      "aria-label",
      t(
        edge === "east" || edge === "west"
          ? "Window.ResizeWidth"
          : "Window.ResizeHeight"
      )
    );
    handle.title = handle.getAttribute("aria-label") ?? "";
    handle.tabIndex = 0;
    root.append(handle);
    return handle;
  });
  /** @type {{edge:string,x:number,y:number,left:number,top:number,width:number,height:number,pointerId:number,handle:HTMLElement}|null} */
  let drag = null;
  const enabled = () =>
    app.rendered && !app.hudStowed && !app.hudPinState?.() && root.isConnected;
  /** @param {string} edge @param {number} dx @param {number} dy @param {{left:number,top:number,width:number,height:number}} start */
  const resize = (edge, dx, dy, start) => {
    if (edge === "east")
      app.setPosition({ width: Math.max(270, start.width + dx) });
    else if (edge === "west") {
      const width = Math.max(270, start.width - dx);
      app.setPosition({ width, left: start.left + start.width - width });
    } else if (edge === "south")
      app.setPosition({
        height: Math.max(app.hudMinimumHeight?.() ?? 180, start.height + dy)
      });
    else {
      const height = Math.max(
        app.hudMinimumHeight?.() ?? 180,
        start.height - dy
      );
      app.setPosition({ height, top: start.top + start.height - height });
    }
  };
  const cancel = () => {
    if (drag?.handle.hasPointerCapture?.(drag.pointerId))
      drag.handle.releasePointerCapture(drag.pointerId);
    drag = null;
  };
  /** @param {PointerEvent} event */
  const down = event => {
    const handle = /** @type {HTMLElement|null} */ (
      /** @type {Element|null} */ (event.target)?.closest?.(".ws-axis-resize")
    );
    if (
      !handle ||
      !handles.includes(handle) ||
      event.button !== 0 ||
      !enabled()
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const rect = root.getBoundingClientRect();
    drag = {
      edge: handle.dataset.resizeAxis ?? "east",
      x: event.clientX,
      y: event.clientY,
      left: Number(app.position.left ?? rect.left),
      top: Number(app.position.top ?? rect.top),
      width: rect.width || app.position.width,
      height: rect.height || app.position.height,
      pointerId: event.pointerId,
      handle
    };
    handle.setPointerCapture?.(event.pointerId);
  };
  /** @param {PointerEvent} event */
  const move = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!enabled()) return cancel();
    resize(drag.edge, event.clientX - drag.x, event.clientY - drag.y, drag);
  };
  /** @param {KeyboardEvent} event */
  const key = event => {
    const handle = /** @type {HTMLElement|null} */ (event.target);
    if (!handle || !handles.includes(handle) || !enabled()) return;
    const horizontal = ["east", "west"].includes(
      handle.dataset.resizeAxis ?? ""
    );
    if (
      !(
        horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]
      ).includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 20 : 5;
    const delta = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -step : step;
    const rect = root.getBoundingClientRect();
    resize(
      handle.dataset.resizeAxis ?? "east",
      horizontal ? delta : 0,
      horizontal ? 0 : delta,
      {
        left: Number(app.position.left ?? rect.left),
        top: Number(app.position.top ?? rect.top),
        width: rect.width || app.position.width,
        height: rect.height || app.position.height
      }
    );
  };
  root.addEventListener("pointerdown", down);
  root.addEventListener("keydown", key);
  doc.addEventListener("pointermove", move);
  doc.addEventListener("pointerup", cancel);
  doc.addEventListener("pointercancel", cancel);
  return () => {
    cancel();
    handles.forEach(handle => handle.remove());
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("keydown", key);
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", cancel);
    doc.removeEventListener("pointercancel", cancel);
  };
}
