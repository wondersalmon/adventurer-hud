import { setForcedMode, setRegularView } from "./state.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";
import { openSettings } from "../settings-navigation.js";

/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createViewActions({
  actor,
  canRollActor = false,
  combatModeAvailable,
  currentMode,
  hudState,
  refreshHud,
  savePanelState,
  resetWindow,
  setView,
  t,
  updateSearch,
  visibility,
  togglePin
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  return {
    togglepreset: async () => {
      if (!game.user?.isGM) return;
      await setSetting(SETTINGS.gmEnabled, !getSetting(SETTINGS.gmEnabled));
    },
    normal: function () {
      setForcedMode(hudState, "regular");
      savePanelState?.();
      refreshHud();
    },
    regularview: function (_event, target) {
      setForcedMode(hudState, "regular");
      setRegularView(hudState, target.dataset.view);
      savePanelState?.();
      refreshHud();
    },
    combatmode: function () {
      if (!combatModeAvailable()) {
        return ui.notifications.warn(t("Combat.NotAvailable"));
      }

      setForcedMode(hudState, "combat");
      savePanelState?.();
      refreshHud();
    },
    combatfilter: function (_event, target) {
      hudState.combatCategory =
        hudState.combatCategory === target.dataset.category
          ? null
          : target.dataset.category;
      hudState.actionMenuOpen = false;
      savePanelState?.();
      refreshHud("actions");
    },
    toggleactionmenu: function () {
      hudState.actionMenuOpen = !hudState.actionMenuOpen;
      savePanelState?.();
      refreshHud("actions");
    },
    inventoryfilter: function (_event, target) {
      hudState.inventoryCategory = target.dataset.category;
      savePanelState?.();
      refreshHud();
    },
    featurefilter: async function () {
      hudState.showPassiveFeatures = !hudState.showPassiveFeatures;
      await savePanelState?.();
      refreshHud("actions");
    },
    spellfilter: function (_event, target) {
      hudState.preparedSpellsOnly = target.dataset.prepared === "true";
      savePanelState?.();
      refreshHud(currentMode() === "combat" ? "actions" : null);
    },
    skillfilter: async function (_event, target) {
      const proficientOnly = target.dataset.proficient === "true";
      if (hudState.proficientSkillsOnly === proficientOnly) return;
      await setSetting(SETTINGS.proficientSkillsOnly, proficientOnly);
      hudState.proficientSkillsOnly = proficientOnly;
      refreshHud();
    },
    toggleabilities: function () {
      const key =
        currentMode() === "combat"
          ? "combatAbilitiesExpanded"
          : "abilitiesExpanded";
      hudState[key] = !hudState[key];
      savePanelState?.();
      refreshHud();
    },
    togglefavorites: function () {
      hudState.favoritesExpanded = !hudState.favoritesExpanded;
      savePanelState?.();
      refreshHud();
    },
    togglefavoriteedit: function () {
      if (!visibility.favorites || !canAct()) return;
      hudState.favoriteEdit = !hudState.favoriteEdit;
      refreshHud();
    },
    toggleconditions: function () {
      hudState.conditionsExpanded = !hudState.conditionsExpanded;
      savePanelState?.();
      refreshHud();
    },
    clearsearch: function () {
      updateSearch("");
    },
    settings: async function () {
      return openSettings();
    },
    togglemodes: async function () {
      return setSetting(
        SETTINGS.showModeNavigation,
        !getSetting(SETTINGS.showModeNavigation)
      );
    },
    togglepin: function () {
      return togglePin();
    },
    togglegmtools: function () {
      const menu = this.element?.querySelector(".ws-gm-more");
      if (!menu) return;
      const open = menu.classList.toggle("ws-expanded");
      menu
        .querySelector(".ws-gm-more-toggle")
        ?.setAttribute("aria-expanded", String(open));
    },
    resetwindow: function () {
      return resetWindow();
    },
    view: function (_event, target) {
      setView(target.dataset.view);
      savePanelState?.();
    }
  };
}
