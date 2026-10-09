// @ts-check
/** Drag routing and auto-scroll; saved preferences are owned by the model. */
/** @param {{element:HTMLElement,isActive:()=>boolean,move:(event:Event,target:HTMLElement)=>unknown}} options */
export function bindHudLayoutDrag({ element, isActive, move }) {
  /** @type {HTMLElement|null} */
  let source = null;
  /** @type {HTMLElement|null} */
  let scroller = null;
  let scrollSpeed = 0;
  /** @type {number|null} */
  let scrollFrame = null;
  /** @param {Element|null} node */
  const frame = node =>
    node?.closest(".ws-player-frame") ??
    node?.closest("[data-hud-layout-mode]");
  const stopScroll = () => {
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    scroller = null;
    scrollSpeed = 0;
  };
  const scroll = () => {
    scrollFrame = null;
    if (
      !source?.isConnected ||
      !element.contains(source) ||
      !isActive() ||
      !scroller?.isConnected
    ) {
      stopScroll();
      return;
    }
    const before = scroller.scrollTop;
    scroller.scrollTop += scrollSpeed;
    if (scroller.scrollTop !== before && scrollSpeed)
      scrollFrame = requestAnimationFrame(scroll);
  };
  /** @param {DragEvent} event */
  const updateScroll = event => {
    if (!source?.isConnected || !element.contains(source) || !isActive()) {
      stopScroll();
      return;
    }
    let candidate = /** @type {HTMLElement|null} */ (event.target);
    if (frame(candidate) !== frame(source)) {
      stopScroll();
      return;
    }
    while (candidate && element.contains(candidate)) {
      const overflow = getComputedStyle(candidate).overflowY;
      if (
        candidate.scrollHeight > candidate.clientHeight &&
        /auto|scroll/.test(overflow)
      )
        break;
      candidate = candidate.parentElement;
    }
    if (!candidate || !element.contains(candidate)) {
      stopScroll();
      return;
    }
    const rect = candidate.getBoundingClientRect();
    const edge = Math.min(40, rect.height / 3);
    const y = event.clientY;
    const speed =
      y < rect.top + edge
        ? -18 * Math.min(1, (rect.top + edge - y) / edge)
        : y > rect.bottom - edge
          ? 18 * Math.min(1, (y - rect.bottom + edge) / edge)
          : 0;
    if (!speed) {
      stopScroll();
      return;
    }
    scroller = candidate;
    scrollSpeed = speed;
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(scroll);
  };
  /** @param {Event} event */
  const start = event => {
    const grip = /** @type {Element|null} */ (event.target)?.closest?.(
      ".ws-hud-block-grip"
    );
    if (!grip || !isActive()) return;
    stopScroll();
    source = /** @type {HTMLElement|null} */ (grip.closest("[data-hud-block]"));
    event.stopPropagation();
    /** @type {DragEvent} */ (event).dataTransfer?.setData(
      "text/plain",
      source?.dataset.hudBlock ?? ""
    );
  };
  /** @param {Event} event */
  const destination = event => {
    let node = /** @type {HTMLElement|null} */ (
      /** @type {Element|null} */ (event.target)?.closest?.("[data-hud-block]")
    );
    if (
      source?.dataset.hudBlock?.startsWith("tab:") &&
      !source.parentElement?.hasAttribute("data-hud-lane")
    )
      return source.isConnected &&
        isActive() &&
        node !== source &&
        node?.dataset.hudBlock?.startsWith("tab:") &&
        node.parentElement === source.parentElement
        ? node
        : null;
    while (node && !node.parentElement?.hasAttribute("data-hud-lane"))
      node = /** @type {HTMLElement|null} */ (
        node.parentElement?.closest("[data-hud-block]")
      );
    return source?.isConnected &&
      isActive() &&
      node !== source &&
      node?.parentElement?.hasAttribute("data-hud-lane") &&
      frame(node) === frame(source)
      ? node
      : null;
  };
  /** @param {Event} event */
  const over = event => {
    updateScroll(/** @type {DragEvent} */ (event));
    const lane = /** @type {Element|null} */ (event.target)?.closest?.(
      "[data-hud-lane]"
    );
    if (
      destination(event) ||
      (source?.parentElement?.hasAttribute("data-hud-lane") &&
        lane &&
        frame(lane) === frame(source) &&
        isActive())
    )
      event.preventDefault();
  };
  /** @param {Event} event */
  const drop = event => {
    const node = destination(event);
    const lane = /** @type {HTMLElement|null} */ (
      /** @type {Element|null} */ (event.target)?.closest?.("[data-hud-lane]")
    );
    stopScroll();
    if (
      !source ||
      (!node &&
        (!lane ||
          !source.parentElement?.hasAttribute("data-hud-lane") ||
          frame(lane) !== frame(source) ||
          !isActive()))
    ) {
      source = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = element.ownerDocument.createElement("button");
    target.dataset.hudKey = source.dataset.hudBlock;
    if (node) target.dataset.hudDestination = node.dataset.hudBlock;
    else if (lane) target.dataset.hudLane = lane.dataset.hudLane;
    source = null;
    void move(event, target);
  };
  const end = () => {
    stopScroll();
    source = null;
  };
  /** @param {Event} event */
  const leave = event => {
    if (
      !element.contains(
        /** @type {Node|null} */ (
          /** @type {DragEvent} */ (event).relatedTarget
        )
      )
    )
      stopScroll();
  };
  /** @type {[string,(event:Event)=>void][]} */
  const listeners = [
    ["dragstart", start],
    ["dragover", over],
    ["drop", drop],
    ["dragend", end],
    ["dragleave", leave]
  ];
  for (const [type, handler] of listeners)
    element.addEventListener(type, handler, true);
  return () => {
    end();
    for (const [type, handler] of listeners)
      element.removeEventListener(type, handler, true);
  };
}
