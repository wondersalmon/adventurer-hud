const PIN_SELECTOR = '[data-action="togglepin"]';
const MENU_SELECTOR = [
  'button[data-action="toggleControls"]',
  'button[data-action="controls"]',
  "button.fa-ellipsis-vertical"
].join(", ");

export function syncPinControl({ document, header, label, pinned }) {
  if (!header) return null;

  const menu = header.querySelector(MENU_SELECTOR);
  if (!menu) return null;

  let control = header.querySelector(PIN_SELECTOR);

  if (!control) {
    control = document.createElement("button");
    control.type = "button";
    control.classList.add("header-control", "icon", "fa-solid");
    control.dataset.action = "togglepin";
    menu.before(control);
  }

  control.classList.toggle("fa-thumbtack", pinned);
  control.classList.toggle("fa-thumbtack-slash", !pinned);
  control.classList.toggle("ws-active", pinned);
  control.title = label;
  control.setAttribute("aria-label", label);
  control.setAttribute("aria-pressed", String(pinned));
  return control;
}

export function createHudApplicationClass({
  DialogV2,
  document,
  getPinLabel,
  isPinned,
  allowCloseOnEscape = () => false
}) {
  return class AdventurerHudDialog extends DialogV2 {
    _onRender(context, options) {
      super._onRender(context, options);
      this.updatePinControl();
      this.updateHudDimensions?.();
    }

    setPosition(position = {}) {
      const next = { ...position };
      if (this.rendered && isPinned()) {
        delete next.width;
        delete next.height;
        delete next.left;
        delete next.top;
      }
      const minimum = this.hudMinimumHeight?.() ?? 180;
      if (Number.isFinite(next.height))
        next.height = Math.max(minimum, next.height);
      return super.setPosition(next);
    }

    updatePinControl() {
      const pinned = isPinned();
      this.element?.classList.toggle("ws-pinned", pinned);
      if (this.options?.window) this.options.window.resizable = !pinned;
      return syncPinControl({
        document,
        header: this.element?.querySelector(".window-header"),
        label: getPinLabel(pinned),
        pinned
      });
    }

    async close(options = {}) {
      if (options.closeKey && !allowCloseOnEscape()) return this;
      const closed = await super.close(options);
      await this.hudClosePersistence;
      return closed;
    }
  };
}

export function syncHudDimensions({ element, enabled, label }) {
  const header = element?.querySelector(".window-header");
  const previous = header?.querySelector(".ws-window-size");
  if (!enabled) {
    previous?.remove();
    return;
  }
  const title = header?.querySelector(".window-title");
  if (!title) return;
  const rect = element.getBoundingClientRect?.();
  if (!(rect?.width > 0 && rect?.height > 0)) return;
  const badge = previous ?? element.ownerDocument.createElement("span");
  if (!previous) {
    badge.className = "ws-window-size";
    title.after(badge);
  }
  const text = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
  if (badge.textContent !== text) badge.textContent = text;
  badge.title = label;
}
