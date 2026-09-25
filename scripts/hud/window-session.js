import { flushWindowGeometry, SETTINGS } from "../settings.js";
import { subscribeHudDocuments } from "./subscriptions.js";

export async function activateHudWindow({
  actor,
  app,
  canRollActor,
  changeResource,
  visualEffectsEnabled = true,
  isCurrentCombatant,
  isPlayersTurn,
  onSearchInput,
  onToolsChange,
  readHp,
  readVisibility,
  syncPreferences,
  refreshHud,
  refreshScheduler,
  setPinned,
  state,
  storePosition,
  visibility
}) {
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

  app.applySetting = (key, value) => {
    if (key === SETTINGS.pinWindow) {
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

  await app.render({ force: true });
  state.app = app;
  syncEffects();

  app.element.addEventListener("contextmenu", event => {
    const target = event.target.closest?.(".ws-resource-link");
    if (!target || !event.shiftKey || !canRollActor) return;

    event.preventDefault();
    const item = target.dataset.itemId
      ? actor.items.get(target.dataset.itemId)
      : null;

    void changeResource({
      amount: 1,
      direction: "restore",
      item,
      resourceId: target.dataset.resourceId
    }).catch(error => {
      console.error("Rolls HUD | quick resource restore", error);
      ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
    });
  });

  app.element.addEventListener("input", event => {
    if (event.target?.matches?.('[data-action="searchitems"]')) {
      onSearchInput(event.target.value);
    }
  });

  app.element.addEventListener("dblclick", event => {
    if (!event.target?.closest?.("[data-open-actor-sheet]")) return;
    void actor.sheet?.render({ force: true });
  });

  app.addEventListener("position", () => storePosition(app.position));

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
    scheduleRefresh: refreshScheduler.schedule
  });

  app.addEventListener(
    "close",
    () => {
      effectsEnabled = false;
      void flushWindowGeometry();
      refreshScheduler.cancel();
      unsubscribeDocuments();
      clearEffects();

      if (state.app === app) {
        state.app = null;
        state.actor = null;
        state.actorUuid = null;
        state.tokenUuid = null;
      }
    },
    { once: true }
  );
}
