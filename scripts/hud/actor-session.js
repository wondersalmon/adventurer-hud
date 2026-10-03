// @ts-check
import { createHudState, setRegularView, syncHudPreferences } from "./state.js";
import { createHudActions } from "./actions.js";
import { createLatestRefresh } from "./async-refresh.js";
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
import { createHudWindow } from "./window/window.js";
import { syncFavoriteEditControl } from "./window/window-controls.js";
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
    favoriteEntries: favoriteEntries(actor),
    statusDescriptions: await adapter.statusDescriptions(actor)
  });
  if (companionOwner && !companion) hudState.companionsExpanded = true;
  const savePanelState = () => panelPreferences.save(hudState);
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

    app.element.querySelector(`#ws-${view}`)?.classList.remove("ws-hidden");
  };

  const syncHealthAppearance = () =>
    syncHealthAppearanceClass(
      app?.element,
      adapter.combatStats(actor).hp,
      true
    );

  /** @param {import('../../types/hud.js').RefreshRegion | null} region */
  const refreshHud = (region = null) => {
    if (!isSessionCurrent()) return;
    hudState.favoriteEntries = favoriteEntries(actor);
    app?.updateFavoriteEditControl?.();
    if (!visibility.modeNavigation || !combatModeAvailable()) {
      hudState.forcedMode = null;
    }
    syncHealthAppearance();
    refreshHudView({
      app,
      availableViews,
      hudState,
      mode: currentMode(),
      region,
      renderers: {
        actions: combatActions,
        combat: combatHTML,
        regular: normalHTML
      },
      setView,
      title: dialogTitle()
    });
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
  const refreshStatuses = createLatestRefresh({
    load: () => adapter.statusDescriptions(actor),
    isCurrent: () => app?.rendered && isSessionCurrent(),
    apply: descriptions => {
      hudState.statusDescriptions = descriptions;
      refreshScheduler.schedule();
    },
    onError: error => {
      reportFailure("hud.status.refresh", error, { level: "warn", t });
    }
  });
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
    refreshHud(currentMode() === "combat" ? "actions" : null);
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
    content
  });
  const actions = createHudActions({
    actor,
    adapter,
    canStartMutation,
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
  await hudWindow.activate({
    adapter,
    onDispose: () => {
      disposed = true;
      hpDialog.dispose();
      companions?.dispose();
      app.stopFamiliarVision = null;
      app.getFamiliarVisionOwnerTokenUuid = null;
      app.updateFavoriteEditControl = null;
      app.element
        ?.querySelector('[data-action="togglefavoriteedit"]')
        ?.remove();
    },
    actor,
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
    onStatusChange: refreshStatuses,
    onCombatChange: gmActive ? gmSelection.scheduleCombatChange : null,
    onCombatSelection: gmActive ? gmSelection.selectCombat : null,
    visibility
  });

  app.updateFavoriteEditControl = () => {
    const enabled = visibility.favorites && actor.isOwner && !companion;
    if (!enabled) hudState.favoriteEdit = false;
    syncFavoriteEditControl({
      document,
      header: app.element?.querySelector(".window-header"),
      enabled,
      editing: hudState.favoriteEdit,
      label: t(
        hudState.favoriteEdit ? "Quick.FinishEditing" : "Quick.EditFavorites"
      )
    });
  };
  syncHealthAppearance();
  app.updateFavoriteEditControl();
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
