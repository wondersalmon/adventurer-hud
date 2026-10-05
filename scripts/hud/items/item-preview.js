/**
 * Read-only descriptions, with delayed hover/focus and an explicit pinned view.
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
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let revision = 0;
  /** @type {HTMLElement | null} */
  let anchor = null;
  /** @type {any} Foundry Item document. */
  let currentItem = null;
  /** @type {HTMLElement | null} */
  let popup = null;
  let pinned = false;
  let ownerPermission = false;
  let disposed = false;
  let restoringFocus = false;
  const restoreFocus = card => {
    restoringFocus = true;
    (card?.querySelector("button:not([disabled])") ?? card)?.focus();
    restoringFocus = false;
  };
  const id = `ws-item-preview-${Math.random().toString(36).slice(2)}`;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const close = () => {
    revision++;
    clearTimer();
    const described = anchor
      ?.getAttribute("aria-describedby")
      ?.split(/\s+/)
      .filter(value => value !== id);
    if (described?.length)
      anchor.setAttribute("aria-describedby", described.join(" "));
    else anchor?.removeAttribute("aria-describedby");
    popup?.remove();
    popup = anchor = currentItem = null;
    pinned = false;
  };
  const valid = () =>
    !disposed &&
    isActive() &&
    anchor?.isConnected &&
    Boolean(currentItem?.isOwner ?? currentItem?.actor?.isOwner) ===
      ownerPermission &&
    getItem(anchor.dataset.descriptionItemId) === currentItem;
  const position = () => {
    if (!popup || !anchor) return;
    const box = anchor.getBoundingClientRect();
    const width = Math.max(0, Math.min(360, view.innerWidth - 16));
    popup.style.width = `${width}px`;
    const right = box.right + 8;
    const left =
      right + width <= view.innerWidth - 8 ? right : box.left - width - 8;
    popup.style.left = `${Math.max(8, Math.min(left, view.innerWidth - width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(box.top, view.innerHeight - popup.getBoundingClientRect().height - 8))}px`;
  };
  const show = async (card, pin = false) => {
    if (disposed || !isActive() || !card?.isConnected) return;
    close();
    anchor = card;
    currentItem = getItem(card.dataset.descriptionItemId);
    if (!currentItem) return close();
    ownerPermission = Boolean(
      currentItem.isOwner ?? currentItem.actor?.isOwner
    );
    pinned = pin;
    const operation = revision;
    try {
      const html = await enrich(currentItem);
      if (operation !== revision) return;
      if (!valid()) return close();
      popup = doc.createElement("section");
      popup.className = "ws-item-preview";
      popup.id = id;
      popup.setAttribute("popover", "manual");
      popup.setAttribute("role", pinned ? "dialog" : "region");
      popup.setAttribute("aria-label", currentItem.name);
      const header = doc.createElement("header");
      const title = doc.createElement("strong");
      title.textContent = currentItem.name;
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
          pinned = !pinned;
          pinButton.setAttribute("aria-pressed", String(pinned));
          popup.setAttribute("role", pinned ? "dialog" : "region");
        }
      );
      pinButton.setAttribute("aria-pressed", String(pinned));
      button(t("Window.Close"), "fa-xmark", () => {
        const focus = anchor;
        close();
        restoreFocus(focus);
      });
      const body = doc.createElement("div");
      body.className = "ws-item-preview-body";
      // Enrichment is owned by Foundry's TextEditor, with document-relative links.
      if (html?.trim()) body.innerHTML = html;
      else body.textContent = t("Combat.NoDescription");
      popup.append(header, body);
      (card.closest(".ws-view") ?? card.closest(".ws-shell") ?? element).append(
        popup
      );
      popup.showPopover?.();
      const described = anchor.getAttribute("aria-describedby");
      anchor.setAttribute(
        "aria-describedby",
        [described, id].filter(Boolean).join(" ")
      );
      position();
      if (pin) pinButton.focus();
    } catch (error) {
      if (operation === revision) close();
      onError(error);
    }
  };
  const schedule = card => {
    if (!enabled() || !isActive() || pinned || !card || card === anchor) return;
    close();
    timer = setTimeout(() => {
      timer = null;
      if (enabled()) void show(card);
    }, delay);
  };
  const cardFor = target =>
    target?.closest?.(".ws-item-side-actions")
      ? null
      : target?.closest?.("[data-description-item-id]");
  const enter = event => {
    if (event.type === "focusin" && restoringFocus) return;
    if (popup?.contains(event.target)) return clearTimer();
    if (event.target?.closest?.(".ws-item-side-actions")) {
      if (!pinned) close();
      return;
    }
    schedule(cardFor(event.target));
  };
  const leave = event => {
    if (pinned) return;
    const from = cardFor(event.target);
    const to = cardFor(event.relatedTarget);
    if ((from && from === to) || popup?.contains(event.relatedTarget)) return;
    clearTimer();
    timer = setTimeout(close, 150);
  };
  const keydown = event => {
    if (event.key === "Escape" && (popup || anchor)) {
      event.preventDefault();
      event.stopPropagation();
      const focus = anchor;
      close();
      restoreFocus(focus);
    }
  };
  const changed = () => {
    if (anchor && !valid()) close();
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
    ["keydown", keydown]
  ];
  for (const [type, handler] of listeners)
    element.addEventListener(type, handler);
  view.addEventListener?.("resize", position);
  const scroll = event => {
    if (popup?.contains(event.target)) return;
    if (pinned) position();
    else close();
  };
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
      view.removeEventListener?.("resize", position);
    }
  };
}
