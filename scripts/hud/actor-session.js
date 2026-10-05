// @ts-check
import { createHudState, setRegularView, syncHudPreferences } from "./state.js";
import { createHudActions } from "./actions.js";
import { createGmSelection } from "./gm/gm-selection.js";
import { createHpDialogController } from "./hp-dialog.js";
import { syncHealthAppearance as syncHealthAppearanceClass } from "./health-feedback.js";
import { createRefreshScheduler, refreshHudView } from "./refresh.js";
import { createHudRollRunner } from "./roll-runner.js";
import { createHudToolState } from "./tool-state.js";
import {
  favoriteEntries,
  addFavorite,
  removeFavorite,
  queueFavoriteChange
} from "../dnd5e/favorites.js";
import { createHudPresentation } from "./presentation.js";
import { createPanelPreferences } from "./panel-preferences.js";
import { pruneItemLayouts } from "./items/item-layout.js";
import { createHudWindow } from "./window/window.js";
import { syncHeaderEditControl } from "./window/window-controls.js";
import { readHudVisibility } from "./visibility.js";
import { getSetting, SETTINGS } from "../settings-access.js";
import { actorActionCooldown } from "./action-cooldown.js";
import { reportFailure } from "../diagnostics.js";
import { createCompanionPanel } from "./companions/companion-panel.js";
import { focusHudToken } from "./token-focus.js";
import { createActorSessionGuard } from "./session-guard.js";

/**
 * @param {import('../../types/hud.js').ActorOpenContext} context
 * @param {import('../../types/hud.js').SessionCallbacks} callbacks
 * @returns {Promise<void>}
 */
export async function openActorHud(
  {
    state,
    reusedApp,
    gmActive,
    DialogV2,
    t,
    tf,
    adapter,
    actorContext,
    session,
    gmController,
    gmCombatant,
    companionOwner = null,
    focusToken = false,
    companion = null
  },
  { openHud }
) {
  const { actor, getCombatState } = actorContext;
  /** @type {any} Foundry ApplicationV2 instance. */
  let app = null;
  let disposed = false;
  const isSessionCurrent = () => !disposed && state.session === session;
  const isActorCurrent = createActorSessionGuard({
    actorContext,
    isCurrent: isSessionCurrent
  });
  const canRollActor = actor.isOwner;
  const canStartMutation = actorActionCooldown(actor);

  const readVisibility = () => ({
    ...readHudVisibility(),
    ...(companion ? { favorites: false } : {}),
    ...(gmActive
      ? {
          modeNavigation: false,
          favorites: false,
          combatSkills: false,
          gm: true,
          search: !getSetting(SETTINGS.gmHideSearch),
          filterActions: getSetting(SETTINGS.gmFilterActions),
          actionTypesOnly: getSetting(SETTINGS.gmActionTypesOnly),
          showActionTypes: true,
          itemDetails: getSetting(SETTINGS.gmShowItemDetails),
          attackDetails: getSetting(SETTINGS.gmShowAttackDetails)
        }
      : {})
  });
  const visibility = readVisibility();

  const panelPreferences = createPanelPreferences({
    actorUuid: companion
      ? `companion:${companionOwner.uuid}:${companion.uuid}:${actorContext.tokenUuid ?? actor.uuid}`
      : actor.uuid,
    tokenUuid: actorContext.tokenUuid,
    gmActive
  });
  const hudState = createHudState({
    ...panelPreferences.initialState,
    favoriteEntries: favoriteEntries(actor)
  });
  if (companionOwner && !companion) hudState.companionsExpanded = true;
  const savePanelState = () => panelPreferences.save(hudState);
  const cleanItemLayouts = () => {
    if (!Object.keys(hudState.itemLayouts).length) return;
    const items = [...actor.items.values()].map(item => ({
      id: item.id,
      activityIds: adapter.itemActivities(item).map(activity => activity.id)
    }));
    if (pruneItemLayouts(hudState, items))
      void savePanelState().catch(() => {});
  };
  cleanItemLayouts();
  const companions =
    !gmActive && (actor.type === "character" || companion)
      ? await createCompanionPanel({
          owner: companionOwner ?? actor,
          companion,
          actorContext,
          hudState,
          adapter,
          DialogV2,
          t,
          tf,
          escapeHTML: value => foundry.utils.escapeHTML(String(value ?? "")),
          isCurrent: isSessionCurrent,
          refreshHud: () => refreshHud(),
          navigate: navigation => openHud(null, navigation),
          ownerTokenUuid:
            state.companionNavigation?.ownerTokenUuid ??
            (!companion ? actorContext.ownerTokenUuid : null),
          savePanelState,
          currentMode: () => currentMode(),
          closeHud: () => app?.close()
        })
      : null;

  const { toolState, refreshTools } = await createHudToolState({
    actor,
    adapter,
    isRendered: () => app?.rendered && isSessionCurrent(),
    scheduleRefresh: () => refreshScheduler.schedule()
  });

  const hpDialog = createHpDialogController({
    actor,
    adapter,
    canStartMutation,
    DialogV2,
    canEditActor: async () =>
      isActorCurrent() &&
      (!companions || (await companions.validateActorAction())) &&
      isActorCurrent(),
    t
  });
  const { openHpDialog } = hpDialog;
  const {
    combatModeAvailable,
    canRollDeathSave,
    currentMode,
    combatHTML,
    globalSearchPanel,
    combatActions,
    availableViews,
    normalHTML,
    dialogTitle,
    createContent
  } = createHudPresentation({
    actorContext,
    companions,
    companion: Boolean(companion),
    adapter,
    gmActive,
    gmCombatant,
    gmController,
    hudState,
    visibility,
    toolState,
    t,
    tf
  });

  // =========================================================
  // Content
  // =========================================================

  const content = await createContent();

  const setView = view => {
    const previousView = hudState.currentView;
    if (!setRegularView(hudState, view)) {
      return;
    }

    if (previousView !== hudState.currentView && app?.rendered) {
      refreshHud();
      return;
    }

    app.element
      .querySelectorAll(".ws-view")
      .forEach(element => element.classList.add("ws-hidden"));

    const visible =
      app.element.querySelector(".ws-player-layout") ??
      app.element.querySelector(`#ws-${view}`);
    visible?.classList.remove("ws-hidden");
  };

  const syncHealthAppearance = () => {
    syncHealthAppearanceClass(
      app?.element,
      adapter.combatStats(actor).hp,
      true
    );
    app?.element?.classList.toggle(
      "ws-actor-turn",
      currentMode() === "combat" && getCombatState().isTurn
    );
  };

  /** @param {import('../../types/hud.js').RefreshRegion | null} region */
  const refreshHud = (region = null) => {
    if (!isSessionCurrent()) return;
    app?.closeDiceTray?.();
    if (
      region !== "search" &&
      (hudState.hudEditing ||
        Object.values(hudState.hudLayouts).some(
          preference =>
            preference.order.includes("search") ||
            preference.order.includes("hints")
        ))
    )
      region = null;
    cleanItemLayouts();
    hudState.favoriteEntries = favoriteEntries(actor);
    app?.updateHudEditControl?.();
    if (!visibility.modeNavigation || !combatModeAvailable()) {
      hudState.forcedMode = null;
    }
    syncHealthAppearance();
    hudWindow.syncMode(currentMode());
    refreshHudView({
      app,
      availableViews,
      hudState,
      mode: currentMode(),
      region,
      renderers: {
        actions: combatActions,
        combat: combatHTML,
        regular: normalHTML,
        search: globalSearchPanel
      },
      setView,
      title: dialogTitle()
    });
    if (region !== "search") app?.syncHudLayout?.();
  };

  const refreshScheduler = createRefreshScheduler(refreshHud);
  const gmSelection = createGmSelection({
    controller: gmController,
    combatant: gmCombatant,
    actorContext,
    getApp: () => app,
    isCurrent: isSessionCurrent,
    scheduler: refreshScheduler,
    openHud: () => openHud()
  });
  const { reopen: reopenGmSelection, onCombatChange: onGmCombatChange } =
    gmSelection;
  let playerWasCombatant = Boolean(getCombatState().combatant);
  const onPlayerCombatChange = () => {
    if (!isSessionCurrent()) return;
    const joined = Boolean(getCombatState().combatant);
    if (joined && !playerWasCombatant) {
      hudState.forcedMode = null;
      hudState.currentView = "main";
      void savePanelState().catch(() => {});
    }
    playerWasCombatant = joined;
  };
  const { performRoll, performAndRefresh } = createHudRollRunner({
    canStartMutation,
    getApp: () => app,
    refreshHud,
    refreshScheduler
  });
  const { performAndRefresh: performSceneAction } = createHudRollRunner({
    disabledActions: ["gmremove", "gmremovedead", "gmping"],
    getApp: () => (isSessionCurrent() ? app : null),
    refreshHud,
    refreshScheduler
  });

  const updateSearch = query => {
    hudState.searchQuery = query;
    refreshHud("search");
  };

  const toggleFavoriteEntry = (itemId, activityId) =>
    queueFavoriteChange(actor, async () => {
      await addFavorite(actor, itemId, activityId);
      refreshHud();
    });
  const removeFavoriteEntry = (itemId, activityId) =>
    queueFavoriteChange(actor, async () => {
      await removeFavorite(actor, itemId, activityId);
      refreshHud();
    });

  // =========================================================
  // ApplicationV2 actions
  // =========================================================

  const hudWindow = createHudWindow({
    state,
    reusedApp,
    gmActive,
    DialogV2,
    t,
    title: dialogTitle(),
    content,
    currentMode
  });
  const actions = createHudActions({
    actor,
    adapter,
    canStartMutation,
    pingActorToken: async () => {
      if (!isSessionCurrent()) return;
      const warning = await focusHudToken(actorContext, {
        ping: true,
        pan: false
      });
      if (warning && isSessionCurrent()) ui.notifications.warn(t(warning));
    },
    focusActorToken: async () => {
      if (!isSessionCurrent()) return;
      await companions?.stopVision({ pan: false });
      if (!isSessionCurrent()) return;
      const warning = await focusHudToken(actorContext);
      if (warning) ui.notifications.warn(t(warning));
    },
    canRollActor,
    canRollDeathSave,
    combatModeAvailable,
    currentMode,
    getCombatState,
    gmController,
    gmCombatantId: gmCombatant?.id,
    openGmSelection: reopenGmSelection,
    onGmCombatChange,
    onPlayerTurnEnded: companion
      ? () => companions?.actions.companionback?.(null, { dataset: {} })
      : undefined,
    hudState,
    openHpDialog,
    performAndRefresh,
    performSceneAction,
    refreshHud,
    savePanelState,
    resetWindow: hudWindow.resetWindow,
    performRoll,
    setView,
    t,
    toggleFavoriteEntry,
    removeFavoriteEntry,
    updateSearch,
    visibility,
    togglePin: hudWindow.togglePin,
    companionActions: companions?.actions,
    validateActorAction: companion
      ? async () =>
          isActorCurrent() &&
          Boolean(await companions?.validateActorAction()) &&
          isActorCurrent()
      : isActorCurrent
  });

  // =========================================================
  // DialogV2
  // =========================================================

  app = hudWindow.create(actions);
  const unsubscribePreferences = panelPreferences.subscribe(hudState, () => {
    if (isSessionCurrent()) app.refreshFromSettings?.();
  });
  await hudWindow.activate({
    layoutState: hudState,
    adapter,
    onDispose: () => {
      unsubscribePreferences();
      disposed = true;
      hpDialog.dispose();
      companions?.dispose();
      app.stopFamiliarVision = null;
      app.getFamiliarVisionOwnerTokenUuid = null;
      app.updateHudEditControl = null;
      app.hudEditingState = null;
      app.element?.classList.remove("ws-hud-editing");
      app.element?.querySelector(".ws-hud-edit-badge")?.remove();
      app.element?.querySelector('[data-action="togglehudedit"]')?.remove();
    },
    actor,
    isActorCurrent,
    isCurrentCombatant: actorContext.isCurrentCombatant,
    isPlayersTurn: () => getCombatState().isTurn,
    readVisibility,
    syncPreferences: () => {
      syncHudPreferences(hudState, {
        modeNavigation: visibility.modeNavigation,
        proficientSkillsOnly: getSetting(SETTINGS.proficientSkillsOnly)
      });
      gmSelection.syncPreferences();
    },
    onSearchInput: query => updateSearch(query),
    readHp: () => {
      const hp = adapter.combatStats(actor).hp;
      return {
        value: Number(hp.value ?? 0),
        temp: Number(hp.temp ?? 0),
        max: Number(hp.max ?? 0)
      };
    },
    refreshHud,
    refreshScheduler,
    onToolsChange: refreshTools,
    onStatusChange: () => refreshScheduler.schedule(),
    onCombatChange: gmActive
      ? gmSelection.scheduleCombatChange
      : onPlayerCombatChange,
    onCombatSelection: gmActive ? gmSelection.selectCombat : null,
    visibility
  });

  syncHealthAppearance();
  app.hudEditingState = () => hudState.hudEditing;
  app.updateHudEditControl = () =>
    syncHeaderEditControl({
      document,
      header: app.element?.querySelector(".window-header"),
      enabled: actor.isOwner,
      editing: hudState.hudEditing,
      label: t(hudState.hudEditing ? "HudLayout.Done" : "HudLayout.Edit"),
      action: "togglehudedit",
      icon: "fa-pen-to-square",
      besidePin: true
    });
  app.updateHudEditControl();
  companions?.start();
  app.stopFamiliarVision = options => companions?.stopVision(options);
  app.getFamiliarVisionOwnerTokenUuid = () =>
    companions?.visionOwnerTokenUuid ?? null;

  if (currentMode() === "regular") {
    setView(hudState.currentView);
  }
  if (companion)
    app.element.querySelector('[data-action="companionback"]')?.focus?.();
  else if (companionOwner)
    app.element.querySelector('[data-action="togglecompanions"]')?.focus?.();
  if (
    focusToken &&
    getSetting(SETTINGS.companionAutoFocus) &&
    isSessionCurrent() &&
    (await companions?.validateActorAction()) &&
    isSessionCurrent()
  ) {
    try {
      const warning = await focusHudToken(actorContext);
      if (warning && warning !== "Actor.TokenNotOnScene")
        ui.notifications.warn(t(warning));
    } catch (error) {
      reportFailure("hud.token.focus", error, { t });
    }
  }
}
