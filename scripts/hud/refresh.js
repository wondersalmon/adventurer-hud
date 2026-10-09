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
  search: 2,
  full: 3
});
const renderedMarkup = new WeakMap();

export function refreshHudShell(shell, body, { syncLayout } = {}) {
  if (!shell) return;
  if (renderedMarkup.get(shell) === body) {
    syncLayout?.();
    return;
  }
  const domState = captureHudDomState(shell);

  shell.innerHTML = body;
  renderedMarkup.set(shell, body);
  syncLayout?.();
  restoreHudDomState(shell, domState, { layoutApplied: Boolean(syncLayout) });
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
  title,
  syncLayout,
  beforeReplace
}) {
  if (!app?.rendered) return;
  const shell = app.element.querySelector(".ws-shell");
  if (!shell) return;
  const domState = captureHudDomState(shell);
  const restore = () => {
    syncLayout?.();
    restoreHudDomState(shell, domState, { layoutApplied: Boolean(syncLayout) });
  };

  if (
    region === "search" &&
    (!hudState.renderedMode || hudState.renderedMode === mode)
  ) {
    const panel = shell.querySelector(".ws-global-search");
    if (panel) {
      const template = document.createElement("template");
      template.innerHTML = renderers.search();
      const next = template.content.querySelector(".ws-search-results");
      const previous = panel.querySelector(".ws-search-results");
      const input = panel.querySelector('[data-action="searchitems"]');
      if (input && input.value !== hudState.searchQuery)
        input.value = hudState.searchQuery;
      if (previous?.outerHTML !== next?.outerHTML) {
        beforeReplace?.();
        if (previous && next) previous.replaceWith(next);
        else if (next) panel.append(next);
        else previous?.remove();
        renderedMarkup.delete(shell);
      }
      // Keep the input node, selection and IME session throughout typing.
      return;
    }
  }

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
      const sections = [
        ...template.content.querySelectorAll(".ws-combat-category-section")
      ];
      const previous = [
        ...shell.querySelectorAll(".ws-combat-category-section")
      ];
      if (previous.length) {
        const updates = sections
          .map(next => ({
            next,
            old: previous.find(
              node =>
                node.getAttribute("data-hud-block") ===
                next.getAttribute("data-hud-block")
            )
          }))
          .filter(
            ({ next, old }) =>
              !old || renderedMarkup.get(old) !== next.outerHTML
          );
        const removed = previous.filter(
          old =>
            !sections.some(
              next =>
                next.getAttribute("data-hud-block") ===
                old.getAttribute("data-hud-block")
            )
        );
        if (updates.length || removed.length) {
          beforeReplace?.();
          for (const { next, old } of updates) {
            renderedMarkup.set(next, next.outerHTML);
            if (old) old.replaceWith(next);
            else
              (
                current.querySelector(".ws-combat-category-sections") ?? current
              ).append(next);
          }
          for (const old of removed) old.remove();
          if (!sections.length) {
            const next = template.content.firstElementChild;
            if (next) current.replaceWith(next);
            else current.remove();
          }
          renderedMarkup.delete(shell);
        }
        renderedMarkup.set(current, markup);
        restore();
        return;
      }
      beforeReplace?.();
      const next = template.content.firstElementChild;
      if (next) {
        current.replaceWith(next);
        renderedMarkup.set(next, markup);
      } else current.remove();
      renderedMarkup.delete(shell);
      restore();
      return;
    }
  }

  const markup = renderHudMode(mode, renderers);
  if (renderedMarkup.get(shell) !== markup) {
    beforeReplace?.();
    shell.innerHTML = markup;
    renderedMarkup.set(shell, markup);
    for (const section of shell.querySelectorAll(".ws-combat-category-section"))
      renderedMarkup.set(section, section.outerHTML);
  }
  restore();
  hudState.renderedMode = mode;
  const windowTitle = app.element.querySelector(".window-title");
  if (windowTitle && windowTitle.textContent !== title)
    windowTitle.textContent = title;

  if (mode === "regular") setView(hudState.currentView);
  else hudState.currentView = "main";
}
