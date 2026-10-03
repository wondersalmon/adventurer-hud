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

export function syncFavoriteEditControl({
  document,
  header,
  enabled,
  editing,
  label
}) {
  if (!header) return null;
  let control = header.querySelector('[data-action="togglefavoriteedit"]');
  if (!enabled) {
    control?.remove();
    return null;
  }
  const menu = header.querySelector(MENU_SELECTOR);
  if (!menu) return null;
  if (!control) {
    control = document.createElement("button");
    control.type = "button";
    control.classList.add("header-control", "icon", "fa-solid", "fa-star");
    control.dataset.action = "togglefavoriteedit";
    menu.before(control);
  }
  control.classList.toggle("ws-active", editing);
  control.title = label;
  control.setAttribute("aria-label", label);
  control.setAttribute("aria-pressed", String(editing));
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
      this.updateFavoriteEditControl?.();
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
