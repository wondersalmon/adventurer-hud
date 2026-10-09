// @ts-check
import { gmWindowTitle, renderGmCombatHeader } from "./gm/gm-combat.js";
import { createHudWindow } from "./window/window.js";
import { createRefreshScheduler, refreshHudShell } from "./refresh.js";
import { createGmSelection } from "./gm/gm-selection.js";
import { createHudRollRunner } from "./roll-runner.js";
import { createHudActions } from "./actions.js";
import { createHudState } from "./state.js";
import { createPanelPreferences } from "./panel-preferences.js";
import { synchronizeHudLayout } from "./window/hud-layout.js";
import { syncHeaderEditControl } from "./window/window-controls.js";
import { readHudVisibility } from "./visibility.js";

/**
 * @param {import('../../types/hud.js').EmptyGmOpenContext} context
 * @param {import('../../types/hud.js').SessionCallbacks} callbacks
 * @returns {Promise<void>}
 */
export async function openEmptyGmHud(
  { state, reusedApp, session, gmController, DialogV2, t, tf, adapter },
  { openHud }
) {
  if (!game.user?.isGM) return;
  let disposed = false;
  const preferences = createPanelPreferences({
    actorUuid: null,
    tokenUuid: null,
    gmActive: true
  });
  const hudState = createHudState(preferences.initialState);
  const escapeHTML = value => foundry.utils.escapeHTML(String(value ?? ""));
  const body = () =>
    `<div class="ws-view ws-combat-view">${renderGmCombatHeader({ controller: gmController, selectedId: null, adapter, escapeHTML, t })}</div>`;
  const content = document.createElement("div");
  content.innerHTML = `<div class="ws-shell">${body()}</div>`;
  const hudWindow = createHudWindow({
    state,
    reusedApp,
    gmActive: true,
    DialogV2,
    t,
    title: gmWindowTitle(gmController.getCombat(), null, t, tf),
    content
  });
  const refreshHud = () => {
    if (app?.rendered && !disposed && state.session === session) {
      const title = gmWindowTitle(gmController.getCombat(), null, t, tf);
      app.options.window.title = title;
      const heading = app.element.querySelector(".window-title");
      if (heading) heading.textContent = title;
      refreshHudShell(app.element.querySelector(".ws-shell"), body(), {
        syncLayout: () => synchronizeHudLayout(app.element, hudState, t)
      });
      app.updateHudEditControl?.();
    }
  };
  const refreshScheduler = createRefreshScheduler(refreshHud);
  const gmSelection = createGmSelection({
    controller: gmController,
    getApp: () => app,
    isCurrent: () => !disposed && state.session === session,
    scheduler: refreshScheduler,
    openHud: () => openHud()
  });
  const { onCombatChange } = gmSelection;
  const sceneRunner = createHudRollRunner({
    getApp: () => app,
    refreshHud,
    refreshScheduler
  });
  const performAndRefresh = callback =>
    sceneRunner.performAndRefresh(() =>
      gmSelection.duringSceneAction(callback)
    );
  const actions = createHudActions({
    isSessionCurrent: () => !disposed && state.session === session,
    gmController,
    canRollActor: false,
    hudState,
    refreshHud,
    savePanelState: () => preferences.save(hudState),
    t,
    onGmCombatChange: onCombatChange,
    openGmSelection: gmSelection.reopen,
    performAndRefresh,
    togglePin: hudWindow.togglePin,
    resetWindow: hudWindow.resetWindow
  });
  const app = hudWindow.create(actions);
  const unsubscribe = preferences.subscribe(hudState, refreshHud);
  await hudWindow.activate({
    layoutState: hudState,
    onDispose: () => {
      disposed = true;
      unsubscribe();
    },
    actor: null,
    gmController,
    performSceneAction: performAndRefresh,
    getCombat: () => gmController.getCombat(),
    refreshHud,
    refreshScheduler,
    readVisibility: readHudVisibility,
    visibility: readHudVisibility(),
    onSearchInput: () => {},
    onCombatChange: gmSelection.scheduleCombatChange,
    onCombatSelection: gmSelection.selectCombat
  });
  app.hudEditingState = () => hudState.hudEditing;
  app.updateHudEditControl = () =>
    syncHeaderEditControl({
      document,
      header: app.element?.querySelector(".window-header"),
      enabled: Boolean(game.user?.isGM),
      editing: hudState.hudEditing,
      label: t(hudState.hudEditing ? "HudLayout.Done" : "HudLayout.Edit"),
      action: "togglehudedit",
      icon: "fa-pen-to-square",
      besidePin: true
    });
  app.updateHudEditControl();
}
