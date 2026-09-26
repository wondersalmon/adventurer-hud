import { renderHudMode } from "../render/index.js";
import { setRegularView } from "./state.js";

const REFRESH_PRIORITY = Object.freeze({
  actions: 1,
  full: 2
});

export function createRefreshScheduler(
  refresh,
  {
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle)
  } = {}
) {
  let frame = null;
  let pending = null;

  const schedule = (region = "full") => {
    const requested = REFRESH_PRIORITY[region] ? region : "full";
    if (!pending || REFRESH_PRIORITY[requested] > REFRESH_PRIORITY[pending]) {
      pending = requested;
    }

    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      const next = pending;
      pending = null;
      refresh(next === "full" ? null : next);
    });
  };

  const flush = () => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }
    if (!pending) return;
    const next = pending;
    pending = null;
    refresh(next === "full" ? null : next);
  };

  const cancel = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    pending = null;
  };

  return { cancel, flush, schedule };
}

export function refreshHudView({
  app,
  availableViews,
  hudState,
  mode,
  region,
  renderers,
  setView,
  title
}) {
  if (!app?.rendered) return;
  const shell = app.element.querySelector(".ws-shell");
  if (!shell) return;

  if (hudState.renderedMode && hudState.renderedMode !== mode) {
    setRegularView(hudState, "main");
  }

  if (mode === "regular" && hudState.currentView !== "main") {
    if (!availableViews()[hudState.currentView]) {
      setRegularView(hudState, "main");
    }
  }

  if (mode === "combat" && region === "actions") {
    const current = shell.querySelector(".ws-combat-actions");
    if (current) {
      const template = document.createElement("template");
      template.innerHTML = renderers.actions();
      const next = template.content.firstElementChild;
      if (next) current.replaceWith(next);
      else current.remove();
      return;
    }
  }

  shell.innerHTML = renderHudMode(mode, renderers);
  hudState.renderedMode = mode;
  const windowTitle = app.element.querySelector(".window-title");
  if (windowTitle) windowTitle.textContent = title;

  if (mode === "regular") setView(hudState.currentView);
  else hudState.currentView = "main";
}
