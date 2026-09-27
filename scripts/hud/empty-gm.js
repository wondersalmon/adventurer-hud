// @ts-check
import { gmWindowTitle, renderGmCombatHeader } from "./gm-combat.js";
import { createHudWindow } from "./window.js";
import { createRefreshScheduler, refreshHudShell } from "./refresh.js";
import { createGmSelection } from "./gm-selection.js";
import { createHudRollRunner } from "./roll-runner.js";
import { createHudActions } from "./actions.js";
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
      refreshHudShell(app.element.querySelector(".ws-shell"), body());
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
  const { performAndRefresh } = createHudRollRunner({
    getApp: () => app,
    refreshHud,
    refreshScheduler
  });
  const actions = createHudActions({
    gmController,
    canRollActor: false,
    t,
    onGmCombatChange: onCombatChange,
    openGmSelection: gmSelection.reopen,
    performAndRefresh,
    togglePin: hudWindow.togglePin,
    resetWindow: hudWindow.resetWindow
  });
  const app = hudWindow.create(actions);
  await hudWindow.activate({
    onDispose: () => {
      disposed = true;
    },
    actor: null,
    refreshHud,
    refreshScheduler,
    readVisibility: readHudVisibility,
    visibility: readHudVisibility(),
    onSearchInput: () => {},
    onCombatChange,
    onCombatSelection: gmSelection.selectCombat
  });
}
