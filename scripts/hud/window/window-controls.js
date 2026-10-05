import { snapWindowPosition } from "./geometry.js";
import { setSetting, SETTINGS } from "../../settings-access.js";
import { flushWindowGeometry } from "../../window-geometry.js";

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

export function syncHeaderEditControl({
  document,
  header,
  enabled,
  editing,
  label,
  action = "togglehudedit",
  icon = "fa-pen-to-square",
  besidePin = false
}) {
  if (!header) return null;
  let control = header.querySelector(`[data-action="${action}"]`);
  if (!enabled) {
    control?.remove();
    return null;
  }
  const menu = header.querySelector(MENU_SELECTOR);
  if (!menu) return null;
  if (!control) {
    control = document.createElement("button");
    control.type = "button";
    control.classList.add("header-control", "icon", "fa-solid", icon);
    control.dataset.action = action;
    const pin = header.querySelector(PIN_SELECTOR);
    if (besidePin && pin) pin.after(control);
    else menu.before(control);
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
  editingCloseConfig = () => ({}),
  allowCloseOnEscape = () => false,
  shouldSlide = () => false
}) {
  return class AdventurerHudDialog extends DialogV2 {
    _onRender(context, options) {
      super._onRender(context, options);
      this.updatePinControl();
      this.updateHudEditControl?.();
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
      return super.setPosition(
        snapWindowPosition(next, this.position, {
          width: window.innerWidth,
          height: window.innerHeight
        })
      );
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
      if (!options.hudForce && this.hudEditingState?.()) {
        const current = this.hudEditingState;
        this.hudEditingCloseTask ??= DialogV2.confirm(editingCloseConfig());
        let accepted;
        try {
          accepted = await this.hudEditingCloseTask;
        } finally {
          this.hudEditingCloseTask = null;
        }
        if (!accepted || this.hudEditingState !== current) return this;
      }
      if (!options.hudForce && shouldSlide() && this.rendered) {
        if (this.hudStowed) return this;
        this.hudStowed = true;
        this.disposeHudSession?.();
        this.element.inert = true;
        this.hudSlideTask = (async () => {
          await this.slideHud(false);
          this.element.hidden = true;
          await flushWindowGeometry();
          await setSetting(SETTINGS.hudClosed, true);
          Hooks.callAll("adventurerHudVisibilityChanged");
        })();
        await this.hudSlideTask;
        return this;
      }
      if (this.hudStowed) await this.hudSlideTask;
      const closed = await super.close(options);
      await this.hudClosePersistence;
      return closed;
    }

    async slideHud(opening) {
      if (
        !this.element.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const rect = this.element.getBoundingClientRect();
      const distances = [
        rect.left,
        window.innerWidth - rect.right,
        rect.top,
        window.innerHeight - rect.bottom
      ];
      const edge = distances.indexOf(Math.min(...distances));
      const transforms = [
        `translateX(${-rect.right - 12}px)`,
        `translateX(${window.innerWidth - rect.left + 12}px)`,
        `translateY(${-rect.bottom - 12}px)`,
        `translateY(${window.innerHeight - rect.top + 12}px)`
      ];
      const frames = [
        { transform: "none", opacity: 1 },
        { transform: transforms[edge], opacity: 0 }
      ];
      const animation = this.element.animate(
        opening ? frames.reverse() : frames,
        { duration: 180, easing: "ease-out" }
      );
      await animation.finished.catch(() => {});
    }

    async revealHud() {
      if (!this.hudStowed) return;
      await this.hudSlideTask;
      this.element.hidden = false;
      this.element.inert = false;
      this.hudStowed = false;
      await this.slideHud(true);
    }
  };
}
