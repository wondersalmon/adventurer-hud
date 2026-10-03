import { renderHudMode } from "../render/index.js";
import { setRegularView } from "./state.js";
import { captureHudDomState, restoreHudDomState } from "./window/dom-state.js";
import {
  reportFailure,
  beginDiagnostic,
  recordDiagnostic
} from "../diagnostics.js";

const REFRESH_PRIORITY = Object.freeze({
  actions: 1,
  full: 2
});
const renderedMarkup = new WeakMap();

export function refreshHudShell(shell, body) {
  if (!shell) return;
  if (renderedMarkup.get(shell) === body) return;
  const domState = captureHudDomState(shell);
  shell.innerHTML = body;
  renderedMarkup.set(shell, body);
  restoreHudDomState(shell, domState);
}

export function createRefreshScheduler(
  refresh,
  {
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle)
  } = {}
) {
  let frame = null;
  let pending = null;
  let requests = 0;
  const runRefresh = region => {
    const trace = beginDiagnostic(
      "hud.refresh",
      { scope: region, coalesced: requests },
      { detailed: true }
    );
    requests = 0;
    try {
      refresh(region === "full" ? null : region);
      trace.finish();
    } catch (error) {
      trace.finish("error", "render-failed");
      reportFailure("hud.refresh", error);
    }
  };

  const schedule = (region = "full") => {
    requests++;
    recordDiagnostic(
      "hud.refresh.request",
      { scope: region },
      { detailed: true }
    );
    const requested = REFRESH_PRIORITY[region] ? region : "full";
    if (!pending || REFRESH_PRIORITY[requested] > REFRESH_PRIORITY[pending]) {
      pending = requested;
    }

    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      const next = pending;
      pending = null;
      runRefresh(next);
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
    runRefresh(next);
  };

  const cancel = () => {
    requests = 0;
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
  const domState = captureHudDomState(shell);

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
      const markup = renderers.actions();
      if (renderedMarkup.get(current) === markup) return;
      template.innerHTML = markup;
      const next = template.content.firstElementChild;
      if (next) {
        current.replaceWith(next);
        renderedMarkup.set(next, markup);
      } else current.remove();
      renderedMarkup.delete(shell);
      restoreHudDomState(shell, domState);
      return;
    }
  }

  const markup = renderHudMode(mode, renderers);
  if (renderedMarkup.get(shell) !== markup) {
    shell.innerHTML = markup;
    renderedMarkup.set(shell, markup);
    restoreHudDomState(shell, domState);
  }
  hudState.renderedMode = mode;
  const windowTitle = app.element.querySelector(".window-title");
  if (windowTitle) windowTitle.textContent = title;

  if (mode === "regular") setView(hudState.currentView);
  else hudState.currentView = "main";
}
