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
  isPinned
}) {
  return class AdventurerHudDialog extends DialogV2 {
    _onRender(context, options) {
      super._onRender(context, options);
      this.updatePinControl();
    }

    updatePinControl() {
      const pinned = isPinned();
      return syncPinControl({
        document,
        header: this.element?.querySelector(".window-header"),
        label: getPinLabel(pinned),
        pinned
      });
    }

    async close(options = {}) {
      if (isPinned() && options.closeKey) return this;
      return super.close(options);
    }
  };
}
