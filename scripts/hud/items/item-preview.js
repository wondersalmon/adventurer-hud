/**
 * Read-only descriptions, with independent movable pinned views.
 * @param {{element: HTMLElement, getItem: (id: string) => any, enrich: (item: any) => Promise<string>, enabled: () => boolean, isActive: () => boolean, t: (key: string) => string, onError: (error: unknown) => void, delay?: number}} options
 */
export function createItemPreview({
  element,
  getItem,
  enrich,
  enabled,
  isActive,
  t,
  onError,
  delay = 400
}) {
  const doc = element.ownerDocument,
    view = doc.defaultView;
  /** @typedef {{anchor: HTMLElement, item: any, owner: boolean, popup: HTMLElement|null, id: string, pinned: boolean, left: number|null, top: number|null}} Preview */
  /** @type {Preview|null} */
  let active = null;
  /** @type {Set<Preview>} */
  const locked = new Set();
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  /** @type {{entry: Preview, x: number, y: number, left: number, top: number}|null} */
  let drag = null;
  let disposed = false,
    restoringFocus = false;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const restoreFocus = card => {
    restoringFocus = true;
    (card?.querySelector("button:not([disabled])") ?? card)?.focus();
    restoringFocus = false;
  };
  const entries = () => [...locked, ...(active ? [active] : [])];
  /** @param {Preview} entry */
  const remove = entry => {
    if (entry === active) {
      clearTimer();
      active = null;
    }
    if (drag?.entry === entry) drag = null;
    locked.delete(entry);
    const described = entry.anchor
      .getAttribute("aria-describedby")
      ?.split(/\s+/)
      .filter(id => id !== entry.id);
    if (described?.length)
      entry.anchor.setAttribute("aria-describedby", described.join(" "));
    else entry.anchor.removeAttribute("aria-describedby");
    entry.popup?.remove();
  };
  const closeActive = () => {
    clearTimer();
    if (active) remove(active);
  };
  const close = () => {
    clearTimer();
    for (const entry of entries()) remove(entry);
  };
  /** @param {Preview} entry */
  const valid = entry =>
    !disposed &&
    isActive() &&
    entry.anchor.isConnected &&
    Boolean(entry.item?.isOwner ?? entry.item?.actor?.isOwner) ===
      entry.owner &&
    getItem(entry.anchor.dataset.descriptionItemId) === entry.item;
  /** @param {Preview} entry */
  const position = entry => {
    if (!entry.popup) return;
    const box = entry.anchor.getBoundingClientRect();
    const width = Math.max(0, Math.min(360, view.innerWidth - 16));
    entry.popup.style.width = `${width}px`;
    const right = box.right + 8;
    const left =
      entry.left ??
      (right + width <= view.innerWidth - 8 ? right : box.left - width - 8);
    const top = entry.top ?? box.top;
    const boundedLeft = Math.max(
      8,
      Math.min(left, view.innerWidth - width - 8)
    );
    const boundedTop = Math.max(
      8,
      Math.min(
        top,
        view.innerHeight - entry.popup.getBoundingClientRect().height - 8
      )
    );
    entry.popup.style.left = `${boundedLeft}px`;
    entry.popup.style.top = `${boundedTop}px`;
    if (entry.pinned) {
      entry.left = boundedLeft;
      entry.top = boundedTop;
    }
  };
  const show = async card => {
    if (disposed || !isActive() || !card?.isConnected) return;
    closeActive();
    const item = getItem(card.dataset.descriptionItemId);
    if (!item) return;
    /** @type {Preview} */
    const entry = {
      anchor: card,
      item,
      owner: Boolean(item.isOwner ?? item.actor?.isOwner),
      popup: null,
      id: `ws-item-preview-${Math.random().toString(36).slice(2)}`,
      pinned: false,
      left: null,
      top: null
    };
    active = entry;
    try {
      const html = await enrich(item);
      if (active !== entry) return;
      if (!valid(entry)) return remove(entry);
      const popup = doc.createElement("section");
      entry.popup = popup;
      popup.className = "ws-item-preview";
      popup.id = entry.id;
      popup.setAttribute("popover", "manual");
      popup.setAttribute("role", "region");
      popup.setAttribute("aria-label", item.name);
      const header = doc.createElement("header");
      const title = doc.createElement("strong");
      title.textContent = item.name;
      header.append(title);
      const button = (label, icon, callback) => {
        const control = doc.createElement("button");
        control.type = "button";
        control.className = "ws-button";
        control.title = label;
        control.setAttribute("aria-label", label);
        control.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
        control.addEventListener("click", event => {
          event.stopPropagation();
          callback();
        });
        header.append(control);
        return control;
      };
      const pinButton = button(
        t("Combat.PinDescription"),
        "fa-thumbtack",
        () => {
          if (!valid(entry)) return remove(entry);
          entry.pinned = !entry.pinned;
          if (entry.pinned) {
            clearTimer();
            active = null;
            locked.add(entry);
            position(entry);
            header.tabIndex = 0;
            header.title = t("Combat.MoveDescription");
            header.setAttribute("aria-label", t("Combat.MoveDescription"));
          } else {
            closeActive();
            locked.delete(entry);
            active = entry;
            entry.left = entry.top = null;
            header.removeAttribute("tabindex");
            header.removeAttribute("title");
            header.removeAttribute("aria-label");
          }
          pinButton.setAttribute("aria-pressed", String(entry.pinned));
          popup.setAttribute("role", entry.pinned ? "dialog" : "region");
        }
      );
      pinButton.setAttribute("aria-pressed", "false");
      button(t("Window.Close"), "fa-xmark", () => {
        remove(entry);
        restoreFocus(card);
      });
      const body = doc.createElement("div");
      body.className = "ws-item-preview-body";
      // Native TextEditor enrichment preserves document-relative links.
      if (html?.trim()) body.innerHTML = html;
      else body.textContent = t("Combat.NoDescription");
      popup.append(header, body);
      (card.closest(".ws-view") ?? card.closest(".ws-shell") ?? element).append(
        popup
      );
      popup.showPopover?.();
      card.setAttribute(
        "aria-describedby",
        [card.getAttribute("aria-describedby"), entry.id]
          .filter(Boolean)
          .join(" ")
      );
      position(entry);
    } catch (error) {
      if (active === entry) remove(entry);
      onError(error);
    }
  };
  const excluded = target =>
    target?.closest?.(".ws-item-side-actions, .ws-item-open");
  const cardFor = target =>
    excluded(target) ? null : target?.closest?.("[data-description-item-id]");
  const previewFor = target =>
    entries().find(entry => entry.popup?.contains(target));
  const schedule = card => {
    if (card && card === active?.anchor) return clearTimer();
    if (!enabled() || !isActive() || !card) return;
    closeActive();
    if ([...locked].some(entry => entry.anchor === card)) return;
    timer = setTimeout(() => {
      timer = null;
      if (enabled()) void show(card);
    }, delay);
  };
  const enter = event => {
    if (event.type === "focusin" && restoringFocus) return;
    if (previewFor(event.target)) return clearTimer();
    if (excluded(event.target)) {
      clearTimer();
      timer = setTimeout(closeActive, 500);
      return;
    }
    schedule(cardFor(event.target));
  };
  const leave = event => {
    const from = cardFor(event.target),
      to = cardFor(event.relatedTarget);
    if ((from && from === to) || previewFor(event.relatedTarget)) return;
    clearTimer();
    timer = setTimeout(closeActive, 500);
  };
  const keydown = event => {
    const entry = previewFor(event.target);
    if (
      entry?.pinned &&
      event.target === entry.popup?.querySelector("header") &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 40 : 10;
      entry.left +=
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0;
      entry.top +=
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      position(entry);
      return;
    }
    if (event.key === "Escape" && entries().length) {
      event.preventDefault();
      event.stopPropagation();
      const closing = entry ?? active ?? [...locked].at(-1);
      remove(closing);
      restoreFocus(closing.anchor);
    }
  };
  const down = event => {
    const entry = previewFor(event.target);
    if (
      !entry?.pinned ||
      event.button !== 0 ||
      event.target.closest("button, a") ||
      !event.target.closest(".ws-item-preview > header")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    drag = {
      entry,
      x: event.clientX,
      y: event.clientY,
      left: entry.left,
      top: entry.top
    };
    entry.popup.classList.add("ws-preview-dragging");
    entry.popup.querySelector("header").focus({ preventScroll: true });
  };
  const move = event => {
    if (!drag) return;
    if (!valid(drag.entry)) return remove(drag.entry);
    drag.entry.left = drag.left + event.clientX - drag.x;
    drag.entry.top = drag.top + event.clientY - drag.y;
    position(drag.entry);
  };
  const end = () => {
    drag?.entry.popup?.classList.remove("ws-preview-dragging");
    drag = null;
  };
  const changed = () => {
    for (const entry of entries()) if (!valid(entry)) remove(entry);
  };
  const observer = view.MutationObserver
    ? new view.MutationObserver(changed)
    : null;
  observer?.observe(element, { childList: true, subtree: true });
  const listeners = [
    ["mouseover", enter],
    ["focusin", enter],
    ["mouseout", leave],
    ["focusout", leave],
    ["keydown", keydown],
    ["pointerdown", down]
  ];
  for (const [type, handler] of listeners)
    element.addEventListener(type, handler);
  const resize = () => {
    for (const entry of entries()) position(entry);
  };
  const scroll = event => {
    if (!previewFor(event.target)) closeActive();
  };
  view.addEventListener?.("resize", resize);
  doc.addEventListener("pointermove", move);
  doc.addEventListener("pointerup", end);
  doc.addEventListener("pointercancel", end);
  element.addEventListener("scroll", scroll, true);
  return {
    close,
    dispose() {
      disposed = true;
      close();
      observer?.disconnect();
      for (const [type, handler] of listeners)
        element.removeEventListener(type, handler);
      element.removeEventListener("scroll", scroll, true);
      view.removeEventListener?.("resize", resize);
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerup", end);
      doc.removeEventListener("pointercancel", end);
    }
  };
}
