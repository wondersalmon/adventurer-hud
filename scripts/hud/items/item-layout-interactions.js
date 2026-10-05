// @ts-check
/** Session-owned drag routing; only the explicit edit handle starts a move.
 * @param {{element: HTMLElement, isActive: () => boolean, move: (event: Event, target: {dataset: {layoutKey: string, layoutTarget: string}, closest: () => HTMLElement}) => unknown}} options
 */
export function bindItemLayoutInteractions({ element, isActive, move }) {
  /** @type {{list: HTMLElement, key: string} | null} */
  let drag = null;
  /** @param {Event} event @param {string} selector @returns {HTMLElement | null} */
  const closest = (event, selector) =>
    /** @type {HTMLElement | null} */ (
      /** @type {Element | null} */ (event.target)?.closest?.(selector)
    );
  /** @param {Event} event */
  const start = event => {
    const handle = closest(event, ".ws-item-drag");
    if (!handle || !isActive()) return;
    const list = /** @type {HTMLElement | null} */ (
      handle.closest(".ws-items-editing[data-layout-scope]")
    );
    if (!list || !handle.dataset.layoutKey) return;
    event.stopPropagation();
    drag = { list, key: handle.dataset.layoutKey };
    const transfer = /** @type {DragEvent} */ (event).dataTransfer;
    transfer?.setData("text/plain", drag.key);
    if (transfer) transfer.effectAllowed = "move";
  };
  /** @param {Event} event */
  const destination = event => {
    if (!drag || !isActive() || !drag.list.isConnected) return null;
    const entry = closest(event, ".ws-organized-entry");
    return entry?.closest("[data-layout-scope]") === drag.list ? entry : null;
  };
  /** @param {Event} event */
  const over = event => {
    if (destination(event)) event.preventDefault();
  };
  /** @param {Event} event */
  const drop = event => {
    const entry = destination(event);
    if (!entry || !drag || !entry.dataset.layoutKey) return;
    event.preventDefault();
    event.stopPropagation();
    const source = drag;
    drag = null;
    void move(event, {
      dataset: { layoutKey: source.key, layoutTarget: entry.dataset.layoutKey },
      closest: () => source.list
    });
  };
  const end = () => {
    drag = null;
  };
  /** @param {Event} event */
  const click = event => {
    if (!isActive() || !closest(event, ".ws-items-editing .ws-combat-item"))
      return;
    // Editing is presentation-only: moving a card must never roll or use it.
    event.preventDefault();
    event.stopPropagation();
  };
  /** @type {[string, (event: Event) => void][]} */
  const listeners = [
    ["dragstart", start],
    ["dragover", over],
    ["drop", drop],
    ["dragend", end],
    ["click", click]
  ];
  for (const [type, handler] of listeners)
    element.addEventListener(type, handler, true);
  return () => {
    drag = null;
    for (const [type, handler] of listeners)
      element.removeEventListener(type, handler, true);
  };
}
