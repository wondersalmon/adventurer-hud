import { flushWindowGeometry, SETTINGS } from "../settings.js";
import { subscribeHudDocuments } from "./subscriptions.js";

export async function activateHudWindow({
  actor,
  app,
  canRollActor,
  changeResource,
  isCloseAfterRoll,
  visualEffectsEnabled = true,
  isCurrentCombatant,
  onSearchInput,
  readHp,
  readVisibility,
  syncPreferences,
  refreshHud,
  refreshScheduler,
  setCloseAfterRoll,
  setPinned,
  state,
  storePosition,
  visibility
}) {
  let effectsEnabled = Boolean(visualEffectsEnabled);
  let hpFeedbackTimer = null;
  let initiativeFeedbackTimer = null;

  const clearEffects = () => {
    clearTimeout(hpFeedbackTimer);
    clearTimeout(initiativeFeedbackTimer);
    app.element.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash",
      "ws-initiative-rolled",
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
    if (key === SETTINGS.closeAfterRoll) {
      setCloseAfterRoll(Boolean(value));
      const control = app.options?.window?.controls?.find(
        entry => entry.action === "togglecloseafterroll"
      );
      if (control) {
        control.icon = isCloseAfterRoll()
          ? "fa-solid fa-toggle-on"
          : "fa-solid fa-toggle-off";
      }
    }
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

  app.addEventListener("position", () => storePosition(app.position));

  const flash = className => {
    if (!effectsEnabled) return;
    app.element.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash"
    );
    void app.element.offsetWidth;
    app.element.classList.add(className);
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

  const unsubscribeDocuments = subscribeHudDocuments({
    actor,
    hooks: Hooks,
    readHp,
    isCurrentCombatant,
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
      if (!effectsEnabled) return;
      flash(change.kind === "heal" ? "ws-heal-flash" : "ws-damage-flash");
      showHpFeedback(change);
    },
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
