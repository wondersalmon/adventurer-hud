// @ts-check
import { createHudState, setRegularView, syncHudPreferences } from "./state.js";
import { createHudActions } from "./actions.js";
import { createLatestRefresh } from "./async-refresh.js";
import { createGmSelection } from "./gm-selection.js";
import { createHpDialogController } from "./hp-dialog.js";
import { syncHealthAppearance as syncHealthAppearanceClass } from "./health-feedback.js";
import { createRefreshScheduler, refreshHudView } from "./refresh.js";
import { createHudRollRunner } from "./roll-runner.js";
import { createHudToolState } from "./tool-state.js";
import {
  favoriteEntries,
  toggleFavorite,
  queueFavoriteChange
} from "../dnd5e/favorites.js";
import { createHudPresentation } from "./presentation.js";
import { createPanelPreferences } from "./panel-preferences.js";
import { createHudWindow } from "./window.js";
import { readHudVisibility } from "./visibility.js";
import { getSetting, SETTINGS } from "../settings.js";
import { actorActionCooldown } from "./action-cooldown.js";
import { reportFailure } from "../diagnostics.js";

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
    gmCombatant
  },
  { openHud }
) {
  const { actor, getCombatState } = actorContext;
  /** @type {any} Foundry ApplicationV2 instance. */
  let app = null;
  let disposed = false;
  const isSessionCurrent = () => !disposed && state.session === session;
  const canRollActor = actor.isOwner;
  const canStartMutation = actorActionCooldown(actor);

  const readVisibility = () => ({
    ...readHudVisibility(),
    ...(gmActive
      ? {
          modeNavigation: false,
          favorites: false,
          combatSkills: false,
          gm: true,
          search:
            getSetting(SETTINGS.showSearch) &&
            !getSetting(SETTINGS.gmHideSearch),
          actionTypesOnly: getSetting(SETTINGS.gmActionTypesOnly),
          showActionTypes:
            getSetting(SETTINGS.gmActionTypesOnly) ||
            getSetting(SETTINGS.showActionTypes),
          attackDetails: getSetting(SETTINGS.gmShowAttackDetails)
        }
      : {})
  });
  const visibility = readVisibility();

  const panelPreferences = createPanelPreferences({
    actorUuid: actor.uuid,
    tokenUuid: actorContext.tokenUuid,
    gmActive
  });
  const hudState = createHudState({
    ...panelPreferences.initialState,
    favoriteEntries: favoriteEntries(actor),
    statusDescriptions: await adapter.statusDescriptions(actor)
  });
  const savePanelState = () => panelPreferences.save(hudState);

  const { toolState, refreshTools } = await createHudToolState({
    actor,
    adapter,
    isRendered: () => app?.rendered && isSessionCurrent(),
    scheduleRefresh: () => refreshScheduler.schedule()
  });

  const { openHpDialog } = createHpDialogController({
    actor,
    adapter,
    canStartMutation,
    DialogV2,
    t
  });
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
      await toggleFavorite(actor, itemId, activityId);
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
    updateSearch,
    visibility,
    togglePin: hudWindow.togglePin
  });

  // =========================================================
  // DialogV2
  // =========================================================

  app = hudWindow.create(actions);
  await hudWindow.activate({
    onDispose: () => {
      disposed = true;
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
    onCombatChange: gmActive ? onGmCombatChange : null,
    onCombatSelection: gmActive ? gmSelection.selectCombat : null,
    visibility
  });

  syncHealthAppearance();

  if (currentMode() === "regular") {
    setView(hudState.currentView);
  }
}
