import { bindGmActorDrop } from "../gm/gm-actor-drop.js";
import { bindStatusInteractions } from "../status-interactions.js";
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
import { bindItemLayoutInteractions } from "../items/item-layout-interactions.js";
import {
  synchronizeHudPalette,
  synchronizeHudTypography,
  watchHudTheme
} from "../theme.js";
import {
  effectiveAnimationSettings,
  watchReducedMotion
} from "../animation-settings.js";
import { createItemPreview } from "../items/item-preview.js";
import { watchPlayerLayout } from "./responsive-layout.js";
import { bindGmColumnDividers } from "./gm-column-dividers.js";
import { bindExtraColumn } from "./extra-column.js";
import { synchronizeHudLayout } from "./hud-layout.js";
import { bindHudLayoutDrag } from "./hud-layout-interactions.js";
import { bindHudAxisResize } from "./axis-resize.js";
import { bindRatMemory } from "../rat-memory.js";

export async function activateHudWindow({
  actor,
  isActorCurrent = () => true,
  onActorReplacement,
  getCombat,
  layoutState,
  adapter,
  t = key => key,
  app,
  visualEffectsEnabled = true,
  gmActive = false,
  gmController = null,
  performSceneAction,
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
  let memory = null;
  let itemPreview = null;
  let actorDrop = null;
  let effectsMaster = Boolean(visualEffectsEnabled);
  let reducedMotion = false;
  const animationPreferences = {
    hpAnimation: getSetting(SETTINGS.hpAnimation),
    turnAnimation: getSetting(SETTINGS.turnAnimation)
  };
  let animations = effectiveAnimationSettings({
    ...animationPreferences,
    showVisualEffects: effectsMaster
  });
  let effectsEnabled = animations.enabled;
  let effectsElement = app.element;
  let hpFeedbackTimer = null;
  let flashTimer = null;
  let initiativeFeedbackTimer = null;
  let initiativeFrame = null;
  let turnGlowTimer = null;

  const clearEffects = () => {
    clearTimeout(hpFeedbackTimer);
    clearTimeout(flashTimer);
    clearTimeout(initiativeFeedbackTimer);
    if (initiativeFrame != null) cancelAnimationFrame(initiativeFrame);
    initiativeFrame = null;
    clearTimeout(turnGlowTimer);
    hpFeedbackTimer = null;
    effectsElement?.removeAttribute("data-hp-feedback");
    flashTimer = null;
    initiativeFeedbackTimer = null;
    turnGlowTimer = null;
    effectsElement?.classList.remove(
      "ws-heal-flash",
      "ws-damage-flash",
      "ws-initiative-flash",
      "ws-initiative-rolled",
      "ws-turn-arrival",
      "ws-hp-feedback"
    );
  };

  const syncEffects = () => {
    animations = effectiveAnimationSettings(
      { ...animationPreferences, showVisualEffects: effectsMaster },
      reducedMotion
    );
    effectsEnabled = animations.enabled;
    clearEffects();
    app.clearDiceTrayEffect?.();
    app.element.dataset.hpAnimation = animations.hp;
    app.element.dataset.turnAnimation = animations.turn;
    if (effectsEnabled) {
      app.element.classList.remove("ws-effects-disabled");
    } else {
      app.element.classList.add("ws-effects-disabled");
      clearEffects();
      app.clearDiceTrayEffect?.();
    }
  };

  const syncPalette = (theme = getSetting(SETTINGS.theme)) =>
    synchronizeHudPalette(app.element, {
      theme,
      preset: getSetting(SETTINGS.accentPreset),
      color: getSetting(SETTINGS.accentColor),
      customAccent: getSetting(SETTINGS.customThemeAccent),
      customBackground: getSetting(SETTINGS.customThemeBackground),
      customText: getSetting(SETTINGS.customThemeText)
    });

  const syncTypography = () =>
    synchronizeHudTypography(app.element, {
      size: getSetting(SETTINGS.fontSize),
      pixels: getSetting(SETTINGS.fontSizePx),
      family: getSetting(SETTINGS.fontFamily),
      style: getSetting(SETTINGS.fontStyle)
    });
  const updateWindowSize = () => {
    const header = app.element?.querySelector(".window-header");
    let badge = header?.querySelector(".ws-window-size");
    if (!header || disposed || !getSetting(SETTINGS.debugWindowSize)) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ws-window-size";
      header.querySelector(".window-title")?.after(badge);
    }
    const width = Math.round(Number(app.position?.width) || 0);
    const height = Math.round(Number(app.position?.height) || 0);
    badge.textContent = `${width} × ${height}`;
    badge.title = t("Settings.debugWindowSize.Name");
  };
  app.updateHudWindowSize = updateWindowSize;

  app.applySetting = (key, value) => {
    if (
      [
        SETTINGS.twoColumnMode,
        SETTINGS.twoColumnWidth,
        SETTINGS.playerColumnRatio,
        SETTINGS.gmRosterColumnRatio,
        SETTINGS.gmInfoColumnRatio,
        SETTINGS.playerExtraColumnRatio,
        SETTINGS.gmExtraColumnRatio
      ].includes(key)
    )
      app.syncHudLayout?.();
    if (key === SETTINGS.gmActorDrop) actorDrop?.sync();
    if (key === SETTINGS.debugWindowSize) updateWindowSize();
    if (key === SETTINGS.showItemDescriptions && !value) itemPreview?.close();
    if (key === SETTINGS.closeOnEscape) setCloseOnEscape?.(Boolean(value));
    if (key === SETTINGS.theme) syncPalette(value);
    if (
      [
        SETTINGS.fontFamily,
        SETTINGS.fontStyle,
        SETTINGS.fontSize,
        SETTINGS.fontSizePx
      ].includes(key)
    ) {
      syncTypography();
      app.syncHudLayout?.();
    }
    if (
      [
        SETTINGS.accentPreset,
        SETTINGS.accentColor,
        SETTINGS.customThemeAccent,
        SETTINGS.customThemeBackground,
        SETTINGS.customThemeText
      ].includes(key)
    )
      syncPalette();
    if (key === pinSetting) {
      setPinned(Boolean(value));
      app.updatePinControl();
      app.syncHudLayout?.();
    }
    if (key === SETTINGS.showVisualEffects) {
      effectsMaster = Boolean(value);
      syncEffects();
    }
    if ([SETTINGS.hpAnimation, SETTINGS.turnAnimation].includes(key)) {
      animationPreferences[key] = value;
      syncEffects();
    }
  };

  app.refreshFromSettings = () => {
    memory?.sync();
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
  await app.revealHud?.();
  memory = bindRatMemory({
    app,
    t,
    isActive: () => !disposed && app.rendered && !app.hudStowed
  });
  effectsElement = app.element;
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
  syncPalette(theme);
  syncTypography();
  updateWindowSize();
  const gmLayout = bindGmColumnDividers(app.element, {
    readRatio: key =>
      getSetting(
        key === "roster"
          ? SETTINGS.gmRosterColumnRatio
          : SETTINGS.gmInfoColumnRatio
      ),
    saveRatio: (key, value) => {
      void setSetting(
        key === "roster"
          ? SETTINGS.gmRosterColumnRatio
          : SETTINGS.gmInfoColumnRatio,
        value
      ).catch(error => reportFailure("hud.gm.columns.save", error));
    },
    isPinned: () => app.hudPinState?.() ?? false,
    t
  });
  const extraRatioSetting = gmActive
    ? SETTINGS.gmExtraColumnRatio
    : SETTINGS.playerExtraColumnRatio;
  const extraLayout = bindExtraColumn(app.element, {
    readRatio: () => getSetting(extraRatioSetting),
    saveRatio: value => {
      void setSetting(extraRatioSetting, value).catch(error =>
        reportFailure("hud.columns.extra.save", error)
      );
    },
    isPinned: () => app.hudPinState?.() ?? false
  });
  const layout = watchPlayerLayout(
    app,
    () => getSetting(SETTINGS.twoColumnWidth),
    {
      readMode: () => getSetting(SETTINGS.twoColumnMode),
      readRatio: () => getSetting(SETTINGS.playerColumnRatio),
      saveRatio: value => {
        void setSetting(SETTINGS.playerColumnRatio, value).catch(error =>
          reportFailure("hud.columns.save", error)
        );
      },
      isPinned: () => app.hudPinState?.() ?? false,
      afterSync: () => {
        gmLayout.sync();
        if (layoutState) synchronizeHudLayout(app.element, layoutState, t);
        extraLayout.sync();
      }
    }
  );
  app.syncHudLayout = layout.sync;
  const unwatchTheme = watchHudTheme(app.element, () =>
    getSetting(SETTINGS.theme)
  );
  const unwatchMotion = watchReducedMotion(
    app.element.ownerDocument?.defaultView ?? globalThis.window,
    value => {
      reducedMotion = value;
      syncEffects();
    }
  );

  const sessionElement = app.element;
  const unbindDiceTray = bindHudDiceTray({
    app,
    actor,
    t,
    isActive: () =>
      !disposed && app.rendered && !app.hudStowed && isActorCurrent()
  });
  actorDrop =
    gmActive && gmController && performSceneAction
      ? bindGmActorDrop({
          root: app.element,
          controller: gmController,
          performSceneAction,
          t,
          isCurrent: () => !disposed && app.rendered && !app.hudStowed
        })
      : null;
  const unbindAxisResize = bindHudAxisResize(app, t);
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
    if (disposed || !app.rendered) return;
    const target = event.target?.closest?.("[data-reset-initiative-id]");
    if (disposed || !app.rendered || !gmActive || !target) return;
    event.preventDefault();
    event.stopPropagation();
    void app.hudActions?.gmresetcombatantinitiative?.(event, target);
  };
  app.element.addEventListener("contextmenu", onContextMenu);
  const unbindItemLayout = bindItemLayoutInteractions({
    element: sessionElement,
    isActive: () => !disposed && app.rendered && !app.hudStowed,
    move: (event, target) => app.hudActions?.dropitemlayout?.(event, target)
  });
  const unbindHudLayout = bindHudLayoutDrag({
    element: sessionElement,
    isActive: () =>
      !disposed &&
      app.rendered &&
      !app.hudStowed &&
      Boolean(layoutState?.hudEditing),
    move: (event, target) =>
      app.hudActions?.hudblockmove?.call(app, event, target)
  });
  const unbindStatuses = bindStatusInteractions({
    element: sessionElement,
    isActive: () => !disposed && app.rendered && !app.hudStowed,
    remove: (event, status) => app.hudActions?.removestatus?.(event, status)
  });

  if (!reuse)
    app.addEventListener("position", () => {
      app.storeHudPosition?.(app.position);
      app.updateHudWindowSize?.();
      app.syncHudLayout?.();
    });
  app.storeHudPosition = storePosition;

  const flash = className => {
    if (
      !effectsEnabled ||
      disposed ||
      (turnGlowTimer && className === "ws-initiative-flash")
    )
      return;
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
    if (animations.hp === "off" || disposed) return;
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
    app.element.dataset.hpFeedback = change.kind;
    app.element.classList.remove("ws-hp-feedback");
    void app.element.offsetWidth;
    app.element.classList.add("ws-hp-feedback");
    clearTimeout(hpFeedbackTimer);
    hpFeedbackTimer = setTimeout(() => {
      app.element.classList.remove("ws-hp-feedback");
      app.element.removeAttribute("data-hp-feedback");
      hpFeedbackTimer = null;
    }, 1200);
  };

  const showTurnGlow = () => {
    if (animations.turn === "off" || disposed || !app.element) return;
    if (app.element.classList.contains("ws-initiative-flash")) {
      clearTimeout(flashTimer);
      flashTimer = null;
      app.element.classList.remove("ws-initiative-flash");
    }
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
    isActorCurrent,
    onActorReplacement,
    getCombat,
    hooks: Hooks,
    readHp,
    isCurrentCombatant,
    isPlayersTurn,
    onTurnStart: showTurnGlow,
    onInitiativeRequest: () => flash("ws-initiative-flash"),
    onInitiativeRolled: () => {
      if (!effectsEnabled) return;
      if (initiativeFrame != null) cancelAnimationFrame(initiativeFrame);
      initiativeFrame = requestAnimationFrame(() => {
        initiativeFrame = null;
        if (disposed || !app.rendered || !effectsEnabled) return;
        app.element.classList.remove("ws-initiative-rolled");
        void app.element.offsetWidth;
        app.element.classList.add("ws-initiative-rolled");
        clearTimeout(initiativeFeedbackTimer);
        initiativeFeedbackTimer = setTimeout(() => {
          app.element.classList.remove("ws-initiative-rolled");
          initiativeFeedbackTimer = null;
        }, 1500);
      });
    },
    onHpChange: change => {
      if (animations.hp === "off") return;
      if (animations.hp === "full")
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
    memory?.dispose();
    layout.dispose();
    gmLayout.dispose();
    extraLayout.dispose();
    app.syncHudLayout = null;
    app.updateHudWindowSize = null;
    sessionElement.querySelector(".ws-window-size")?.remove();
    unwatchTheme();
    unwatchMotion();
    unwatchDiagnostics();
    sessionElement.querySelector("[data-diagnostic-recording]")?.remove();
    recordDiagnostic(
      "hud.session.dispose",
      { listeners: 0, timers: 0 },
      { detailed: true }
    );
    sessionElement.classList.remove("ws-actor-turn");
    onDispose?.();
    effectsEnabled = false;
    refreshScheduler.cancel();
    unsubscribeDocuments();
    clearEffects();
    sessionElement.removeEventListener?.("input", onInput);
    sessionElement.removeEventListener?.("change", onChange);
    sessionElement.removeEventListener?.("dblclick", onDoubleClick);
    sessionElement.removeEventListener?.("contextmenu", onContextMenu);
    unbindStatuses();
    unbindItemDescriptions();
    unbindItemLayout();
    unbindHudLayout();
    unbindAxisResize();
    unbindDiceTray();
    actorDrop?.dispose();
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

// Optional tray code is needed only when its player-toolbar button is opened.
export function bindHudDiceTray({
  app,
  actor,
  t,
  isActive,
  load = () => import("../dice-tray.js")
}) {
  const root = app.element;
  let disposed = false,
    loading = null,
    unbind = null;
  const current = () => !disposed && app.element === root && isActive();
  const open = event => {
    const button = event.target?.closest?.('[data-dice-tray="toggle"]');
    if (
      !button ||
      !root.contains(button) ||
      !current() ||
      !(globalThis.game?.user?.isGM || actor?.isOwner)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (loading) return;
    loading = Promise.resolve()
      .then(load)
      .then(({ bindDiceTray }) => {
        if (
          !current() ||
          !(globalThis.game?.user?.isGM || actor?.isOwner) ||
          !button.isConnected
        )
          return;
        unbind = bindDiceTray({ app, actor, t, isActive: current });
        root.removeEventListener("click", open, true);
        button.click();
      })
      .catch(error => reportFailure("hud.dice-tray.load", error))
      .finally(() => {
        loading = null;
      });
  };
  root.addEventListener("click", open, true);
  return () => {
    if (disposed) return;
    disposed = true;
    root.removeEventListener("click", open, true);
    unbind?.();
  };
}
