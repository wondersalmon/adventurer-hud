import { getSetting, SETTINGS } from "../settings-access.js";
import { reportFailure } from "../diagnostics.js";

export const ratActive = () =>
  Boolean(globalThis.game?.modules?.get("probably-just-a-rat")?.active);

export function ratMemoryAPI() {
  if (!ratActive()) return null;
  const api = game.modules.get("probably-just-a-rat").api?.memory;
  return api?.version === 1 &&
    ["list", "subscribe", "ping", "center", "forget"].every(
      key => typeof api[key] === "function"
    )
    ? api
    : null;
}

/** Optional client-local integration; no Actor or TokenDocument reads. */
export function bindRatMemory({ app, t, isActive = () => app.rendered }) {
  const root = app.element;
  const document = root.ownerDocument;
  const view = document.defaultView;
  let disposed = false;
  let api = null;
  let unsubscribe = null;
  let toggle = null;
  let panel = null;
  let open = false;
  let listening = false;
  let clearing = false;
  const pending = new Set();
  const position = () => {
    if (!panel || !open) return;
    const header = root
      .querySelector(".window-header")
      ?.getBoundingClientRect?.();
    if (!header) return;
    const margin = 8,
      gap = 0;
    const bounds = root.getBoundingClientRect();
    const width = Math.min(bounds.width, Math.max(0, view.innerWidth));
    panel.style.width = `${width}px`;
    const above = Math.max(0, header.top - gap - margin);
    const below = Math.max(0, view.innerHeight - header.bottom - gap - margin);
    panel.style.maxHeight = `${Math.max(above, below)}px`;
    const height = panel.getBoundingClientRect().height;
    const useAbove = height <= above || above >= below;
    panel.style.maxHeight = `${useAbove ? above : below}px`;
    panel.dataset.placement = useAbove ? "above" : "below";
    const actualHeight = panel.getBoundingClientRect().height;
    panel.style.left = `${Math.max(0, Math.min(bounds.left, view.innerWidth - width))}px`;
    panel.style.top = `${useAbove ? Math.max(margin, header.top - gap - actualHeight) : header.bottom + gap}px`;
  };
  const button = (label, action, icon = null) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = icon ? `ws-button icon fa-solid ${icon}` : "ws-button";
    element.title = label;
    element.setAttribute("aria-label", label);
    if (!icon) element.textContent = label;
    element.dataset.memoryAction = action;
    element.dataset.tooltip = label;
    return element;
  };
  const close = (focus = false) => {
    open = false;
    panel?.remove();
    panel = null;
    toggle?.setAttribute("aria-expanded", "false");
    if (focus) toggle?.focus();
  };
  const sync = () => {
    if (disposed) return;
    const next = getSetting(SETTINGS.showRatMemory) ? ratMemoryAPI() : null;
    if (next !== api) {
      unsubscribe?.();
      unsubscribe = null;
      api = next;
      close();
      if (api) unsubscribe = api.subscribe(sync);
    }
    setListening(Boolean(api) && isActive());
    if (!api || !isActive()) {
      close();
      toggle?.remove();
      toggle = null;
      return;
    }
    const header = root.querySelector(".window-header");
    if (!header) return;
    if (!toggle) {
      toggle = button(t("Memory.Title"), "toggle", "fa-mouse-field");
      toggle.classList.add("header-control", "ws-rat-memory-toggle");
      toggle.dataset.ratMemoryToggle = "";
      toggle.setAttribute("aria-haspopup", "dialog");
      toggle.addEventListener("click", event => {
        event.stopPropagation();
        open = !open;
        sync();
        if (open)
          panel?.querySelector('[data-memory-action="settings"]')?.focus();
      });
      const menu = header.querySelector(
        '[data-action="toggleControls"], [data-action="controls"], button.fa-ellipsis-vertical'
      );
      if (menu) menu.before(toggle);
      else header.append(toggle);
    }
    const records = api.list();
    const label = `${t("Memory.Title")} · ${records.length}`;
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.dataset.tooltip = label;
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) return close();
    const focus = document.activeElement;
    const focusedId = focus?.closest?.("[data-memory-id]")?.dataset.memoryId;
    const focusedAction = focus?.dataset.memoryAction;
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "ws-rat-memory";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("popover", "manual");
      // Override native popover centering even when an older manifest is cached.
      Object.assign(panel.style, {
        position: "fixed",
        inset: "auto",
        margin: "0",
        boxSizing: "border-box"
      });
      panel.setAttribute("aria-label", t("Memory.Title"));
      panel.addEventListener("click", onAction);
      root.append(panel);
    }
    panel.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "ws-rat-memory-heading";
    const title = document.createElement("strong");
    title.textContent = t("Memory.Title");
    const settings = button(t("Memory.Settings"), "settings");
    const gear = document.createElement("i");
    gear.className = "fa-solid fa-gear";
    gear.setAttribute("aria-hidden", "true");
    settings.prepend(gear);
    const clearAll = button(t("Memory.ClearAll"), "clear");
    clearAll.disabled = clearing || !records.length || pending.size > 0;
    heading.append(title, clearAll, settings);
    panel.append(heading);
    const entries = document.createElement("div");
    entries.className = "ws-rat-memory-entries";
    panel.append(entries);
    for (const record of records) {
      const row = document.createElement("div");
      row.className = "ws-rat-memory-record";
      row.dataset.memoryId = record.id;
      const name = document.createElement("strong");
      name.textContent = record.name;
      name.title = record.name;
      const detail = document.createElement("small");
      detail.textContent =
        !record.label || /^RAT\./.test(record.label)
          ? t("Memory.LastPosition")
          : record.label;
      detail.title = detail.textContent;
      const description = document.createElement("div");
      description.className = "ws-rat-memory-description";
      description.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "ws-rat-memory-actions";
      for (const action of ["ping", "center", "forget"]) {
        const control = button(
          t(`Memory.${action}`),
          action,
          {
            ping: "fa-tower-broadcast",
            center: "fa-location-crosshairs",
            forget: "fa-eraser"
          }[action]
        );
        control.disabled = clearing || pending.has(record.id);
        actions.append(control);
      }
      row.append(description, actions);
      entries.append(row);
    }
    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = t("Memory.Empty");
      empty.setAttribute("role", "status");
      panel.append(empty);
    }
    panel.showPopover?.();
    position();
    if (focusedAction) {
      const rows = [...panel.querySelectorAll("[data-memory-id]")];
      const row = rows.find(element => element.dataset.memoryId === focusedId);
      const control = [...(row ?? panel).querySelectorAll("button")].find(
        element => element.dataset.memoryAction === focusedAction
      );
      (control && !control.disabled ? control : toggle).focus();
    }
  };
  async function onAction(event) {
    const control = event.target.closest("button[data-memory-action]");
    if (!control) return;
    event.stopPropagation();
    const action = control.dataset.memoryAction;
    if (action === "settings") {
      close();
      try {
        const sheet = game.settings.sheet;
        await sheet.render({ force: true });
        if (disposed || !isActive()) return;
        sheet.search("");
        sheet.changeTab("probably-just-a-rat", "categories");
        sheet.bringToFront();
      } catch (error) {
        reportFailure("hud.memory.settings", error, { t });
      }
      return;
    }
    if (action === "clear") {
      const provider = api;
      if (
        disposed ||
        !isActive() ||
        provider !== ratMemoryAPI() ||
        clearing ||
        pending.size
      )
        return;
      const records = provider.list();
      if (!records.length) return;
      clearing = true;
      sync();
      try {
        for (const record of records) {
          if (
            disposed ||
            !isActive() ||
            api !== provider ||
            provider !== ratMemoryAPI()
          )
            break;
          try {
            await provider.forget(record.id);
          } catch (error) {
            reportFailure("hud.memory.clear", error, { t });
          }
        }
      } finally {
        clearing = false;
        sync();
      }
      return;
    }
    if (!["ping", "center", "forget"].includes(action)) return;
    const id = control.closest("[data-memory-id]")?.dataset.memoryId;
    const provider = api;
    if (
      !id ||
      !isActive() ||
      provider !== ratMemoryAPI() ||
      clearing ||
      pending.has(id)
    )
      return;
    pending.add(id);
    sync();
    try {
      await provider[action](id, event);
    } catch (error) {
      reportFailure("hud.memory.action", error, { t });
    } finally {
      pending.delete(id);
      sync();
    }
  }
  const outside = event => {
    if (
      open &&
      !panel?.contains(event.target) &&
      !toggle?.contains(event.target)
    )
      close();
  };
  const keydown = event => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
    }
  };
  function setListening(active) {
    if (active === listening) return;
    listening = active;
    if (active) {
      document.addEventListener("pointerdown", outside);
      root.addEventListener("keydown", keydown, true);
      view.addEventListener?.("resize", position);
      app.addEventListener?.("position", position);
    } else {
      document.removeEventListener("pointerdown", outside);
      root.removeEventListener("keydown", keydown, true);
      view.removeEventListener?.("resize", position);
      app.removeEventListener?.("position", position);
    }
  }
  sync();
  return {
    sync,
    dispose() {
      disposed = true;
      unsubscribe?.();
      close();
      toggle?.remove();
      setListening(false);
    }
  };
}
