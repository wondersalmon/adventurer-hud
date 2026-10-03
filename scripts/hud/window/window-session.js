import { flushWindowGeometry } from "../../window-geometry.js";
import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";
import { subscribeHudDocuments } from "../subscriptions.js";
import { captureHudDomState, restoreHudDomState } from "./dom-state.js";
import {
  reportFailure,
  recordDiagnostic,
  subscribeDiagnostics,
  diagnosticsRecording
} from "../../diagnostics.js";
import { bindItemDescriptionInteractions } from "../items/item-interactions.js";
import { synchronizeHudTheme, watchHudTheme } from "../theme.js";
import { createItemPreview } from "../items/item-preview.js";

export async function activateHudWindow({
  actor,
  adapter,
  t = key => key,
  app,
  visualEffectsEnabled = true,
  gmActive = false,
  pinned = false,
  pinSetting = SETTINGS.pinWindow,
  setCloseOnEscape,
  isCurrentCombatant,
  isPlayersTurn,
  onSearchInput,
  onToolsChange,
  onStatusChange,
  onCombatChange,
  onCombatSelection,
  onDispose,
  readHp,
  readVisibility,
  syncPreferences,
  refreshHud,
  refreshScheduler,
  setPinned,
  state,
  storePosition,
  visibility,
  reuse = false,
  fontSize = "medium",
  theme = "auto",
  content,
  title
}) {
  app.disposeHudSession?.();
  let disposed = false;
  let itemPreview = null;
  let effectsEnabled = Boolean(visualEffectsEnabled);
  let hpFeedbackTimer = null;
  let flashTimer = null;
  let initiativeFeedbackTimer = null;
  let turnGlowTimer = null;

  const clearEffects = () => {
    clearTimeout(hpFeedbackTimer);
    clearTimeout(flashTimer);
    clearTimeout(initiativeFeedbackTimer);
    clearTimeout(turnGlowTimer);
    hpFeedbackTimer = null;
    flashTimer = null;
    initiativeFeedbackTimer = null;
    turnGlowTimer = null;
    app.element?.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash",
      "ws-initiative-rolled",
      "ws-turn-arrival",
      "ws-hp-feedback"
    );
  };

  const syncEffects = () => {
    if (effectsEnabled) {
      app.element.classList.remove("ws-effects-disabled");
    } else {
      app.element.classList.add("ws-effects-disabled");
      clearEffects();
    }
  };

  const syncTheme = value => {
    synchronizeHudTheme(app.element, value);
  };

  app.applySetting = (key, value) => {
    if (key === SETTINGS.showItemDescriptions && !value) itemPreview?.close();
    if (key === SETTINGS.closeOnEscape) setCloseOnEscape?.(Boolean(value));
    if (key === SETTINGS.theme) syncTheme(value);
    if (key === pinSetting) {
      setPinned(Boolean(value));
      app.updatePinControl();
    }
    if (key === SETTINGS.showVisualEffects) {
      effectsEnabled = Boolean(value);
      syncEffects();
    }
  };

  app.refreshFromSettings = () => {
    Object.assign(visibility, readVisibility());
    syncPreferences?.();
    refreshHud();
  };

  if (reuse) {
    const domState = captureHudDomState(app.element);
    app.element.querySelector(".ws-shell").innerHTML =
      content.querySelector(".ws-shell").innerHTML;
    app.element.querySelector(".window-title").textContent = title;
    restoreHudDomState(app.element, domState);
  } else await app.render({ force: true });
  for (const name of Array.from(app.element.classList)) {
    if (name.startsWith("ws-font-")) app.element.classList.remove(name);
  }
  app.element.classList.add(`ws-font-${String(fontSize).toLowerCase()}`);
  state.app = app;
  if (getSetting(SETTINGS.hudClosed))
    await setSetting(SETTINGS.hudClosed, false);
  app.element.classList.toggle("ws-player-mode", !gmActive);
  setPinned?.(pinned);
  app.updatePinControl();
  syncTheme(theme);
  const unwatchTheme = watchHudTheme(app.element, () =>
    getSetting(SETTINGS.theme)
  );
  syncEffects();

  const sessionElement = app.element;
  const showRecording = () => {
    if (disposed) return;
    const previous = sessionElement?.querySelector(
      "[data-diagnostic-recording]"
    );
    if (!diagnosticsRecording()) {
      previous?.remove();
      return;
    }
    if (previous) return;
    const badge = document.createElement("span");
    badge.dataset.diagnosticRecording = "true";
    badge.className = "ws-diagnostic-recording";
    badge.setAttribute("role", "status");
    badge.textContent = t("Diagnostics.Recording");
    (sessionElement?.querySelector(".window-header") ?? sessionElement)?.append(
      badge
    );
  };
  const unwatchDiagnostics = subscribeDiagnostics(showRecording);
  showRecording();
  recordDiagnostic("hud.session.ready", { listeners: 5 }, { detailed: true });
  if (actor && adapter?.itemDescription)
    itemPreview = createItemPreview({
      element: sessionElement,
      getItem: id => actor.items.get(id),
      enrich: item => adapter.itemDescription(item),
      enabled: () => getSetting(SETTINGS.showItemDescriptions),
      isActive: () => !disposed && app.rendered,
      t,
      onError: error =>
        reportFailure("hud.item.description", error, { level: "warn" })
    });
  const onInput = event => {
    if (event.target?.matches?.('[data-action="searchitems"]')) {
      onSearchInput(event.target.value);
    }
  };
  app.element.addEventListener("input", onInput);
  const onChange = event => {
    if (event.target?.matches?.("[data-gm-combat-select]"))
      void onCombatSelection?.(event.target.value);
  };
  app.element.addEventListener("change", onChange);

  const onDoubleClick = event => {
    if (!event.target?.closest?.("[data-open-actor-sheet]")) return;
    // Buttons already route mouse and keyboard activation through HUD actions.
    if (event.target.closest('[data-action="gmsheet"]')) return;
    void app.hudActions?.gmsheet?.();
  };
  app.element.addEventListener("dblclick", onDoubleClick);
  const unbindItemDescriptions = bindItemDescriptionInteractions({
    element: sessionElement,
    isActive: () => !disposed && app.rendered,
    openItem: (event, target) => app.hudActions?.openitem?.(event, target)
  });
  const onContextMenu = event => {
    const target = event.target?.closest?.("[data-reset-initiative-id]");
    if (disposed || !app.rendered || !gmActive || !target) return;
    event.preventDefault();
    event.stopPropagation();
    void app.hudActions?.gmresetcombatantinitiative?.(event, target);
  };
  app.element.addEventListener("contextmenu", onContextMenu);

  if (!reuse)
    app.addEventListener("position", () => {
      app.storeHudPosition?.(app.position);
    });
  app.storeHudPosition = storePosition;

  const flash = className => {
    if (!effectsEnabled || turnGlowTimer) return;
    clearTimeout(flashTimer);
    app.element.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash"
    );
    void app.element.offsetWidth;
    app.element.classList.add(className);
    flashTimer = setTimeout(() => {
      app.element?.classList.remove(className);
      flashTimer = null;
    }, 1450);
  };

  const showHpFeedback = change => {
    if (!effectsEnabled) return;
    const style = app.element.style;
    style.setProperty(
      "--ws-hp-delta",
      `"${change.delta > 0 ? "+" : "−"}${Math.abs(change.delta)}"`
    );
    for (const [name, widths] of [
      ["old", change.previousWidths],
      ["new", change.nextWidths]
    ]) {
      style.setProperty(`--ws-hp-${name}-normal`, `${widths.normal}%`);
      style.setProperty(`--ws-hp-${name}-temp`, `${widths.temp}%`);
    }
    app.element.classList.remove("ws-hp-feedback");
    void app.element.offsetWidth;
    app.element.classList.add("ws-hp-feedback");
    clearTimeout(hpFeedbackTimer);
    hpFeedbackTimer = setTimeout(() => {
      app.element.classList.remove("ws-hp-feedback");
    }, 1200);
  };

  const showTurnGlow = () => {
    if (!effectsEnabled || !app.element) return;
    clearTimeout(flashTimer);
    flashTimer = null;
    app.element.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash",
      "ws-hp-feedback"
    );
    clearTimeout(hpFeedbackTimer);
    hpFeedbackTimer = null;
    app.element.classList.remove("ws-turn-arrival");
    void app.element.offsetWidth;
    app.element.classList.add("ws-turn-arrival");
    clearTimeout(turnGlowTimer);
    turnGlowTimer = setTimeout(() => {
      app.element?.classList.remove("ws-turn-arrival");
      turnGlowTimer = null;
    }, 1500);
  };

  const unsubscribeDocuments = subscribeHudDocuments({
    actor,
    hooks: Hooks,
    readHp,
    isCurrentCombatant,
    isPlayersTurn,
    onTurnStart: showTurnGlow,
    onInitiativeRequest: () => flash("ws-initiative-flash"),
    onInitiativeRolled: () => {
      if (!effectsEnabled) return;
      requestAnimationFrame(() => {
        if (!app.rendered || !effectsEnabled) return;
        app.element.classList.remove("ws-initiative-rolled");
        void app.element.offsetWidth;
        app.element.classList.add("ws-initiative-rolled");
        clearTimeout(initiativeFeedbackTimer);
        initiativeFeedbackTimer = setTimeout(() => {
          app.element.classList.remove("ws-initiative-rolled");
        }, 1500);
      });
    },
    onHpChange: change => {
      if (!effectsEnabled || turnGlowTimer) return;
      flash(change.kind === "heal" ? "ws-heal-flash" : "ws-damage-flash");
      showHpFeedback(change);
    },
    onToolsChange,
    onStatusChange,
    onCombatChange,
    scheduleRefresh: refreshScheduler.schedule
  });
  Hooks.callAll("adventurerHudVisibilityChanged");

  app.disposeHudSession = () => {
    if (disposed) return;
    disposed = true;
    unwatchTheme();
    unwatchDiagnostics();
    sessionElement.querySelector("[data-diagnostic-recording]")?.remove();
    recordDiagnostic(
      "hud.session.dispose",
      { listeners: 0, timers: 0 },
      { detailed: true }
    );
    onDispose?.();
    effectsEnabled = false;
    refreshScheduler.cancel();
    unsubscribeDocuments();
    clearEffects();
    sessionElement.removeEventListener?.("input", onInput);
    sessionElement.removeEventListener?.("change", onChange);
    sessionElement.removeEventListener?.("dblclick", onDoubleClick);
    sessionElement.removeEventListener?.("contextmenu", onContextMenu);
    unbindItemDescriptions();
    itemPreview?.dispose();
  };
  if (!reuse)
    app.addEventListener(
      "close",
      () => {
        app.disposeHudSession?.();
        void flushWindowGeometry().catch(error =>
          reportFailure("hud.geometry.flush", error, { level: "warn" })
        );
        if (state.app === app) {
          app.hudClosePersistence = setSetting(SETTINGS.hudClosed, true).catch(
            error => reportFailure("hud.closed-state", error)
          );
          state.app = null;
          state.actor = null;
          state.actorUuid = null;
          state.tokenUuid = null;
          state.companionNavigation = null;
          Hooks.callAll("adventurerHudVisibilityChanged");
        }
      },
      { once: true }
    );
}
