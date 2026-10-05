import { setForcedMode, setRegularView } from "./state.js";
import { moveItemLayout } from "./items/item-layout.js";
import { changeHudLayout } from "./window/hud-layout.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";
import { openSettings, openTroubleshooting } from "../settings-navigation.js";

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
  togglePin
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  const itemLayout = target => target?.closest?.("[data-layout-scope]");
  const moveItem = (target, direction) => {
    const list = itemLayout(target);
    if (!canAct() || !list || !hudState.hudEditing) return;
    const keys = Array.from(
      list.querySelectorAll(".ws-organized-entry"),
      node => node.dataset.layoutKey
    );
    const key = target.dataset.layoutKey;
    const destination = direction
      ? keys[keys.indexOf(key) + direction]
      : target.dataset.layoutTarget;
    if (
      !destination ||
      !moveItemLayout(
        hudState,
        list.dataset.layoutScope,
        key,
        destination,
        keys
      )
    )
      return;
    savePanelState?.();
    refreshHud();
  };
  return {
    hudblockmove: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      if (canAct() && root && changeHudLayout(root, hudState, target)) {
        savePanelState?.();
        refreshHud();
      }
    },
    hudblockhide: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      if (canAct() && root && changeHudLayout(root, hudState, target, true)) {
        savePanelState?.();
        refreshHud();
      }
    },
    togglehudedit: function () {
      if (!canAct()) return;
      hudState.hudEditing = !hudState.hudEditing;
      refreshHud();
    },
    togglehiddenitems: function (_event, target) {
      const list = itemLayout(target);
      if (!list) return;
      hudState.itemHiddenExpanded =
        hudState.itemHiddenExpanded === list.dataset.layoutScope
          ? null
          : list.dataset.layoutScope;
      refreshHud();
    },
    toggleitemhidden: function (_event, target) {
      const list = itemLayout(target),
        key = target.dataset.layoutKey;
      if (!canAct() || !hudState.hudEditing || !list || !key) return;
      const scope = list.dataset.layoutScope;
      const preference = hudState.itemLayouts[scope] ?? {
        order: [],
        hidden: []
      };
      hudState.itemLayouts[scope] = {
        ...preference,
        hidden: preference.hidden.includes(key)
          ? preference.hidden.filter(value => value !== key)
          : [...preference.hidden, key]
      };
      savePanelState?.();
      refreshHud();
    },
    moveitemup: function (_event, target) {
      moveItem(target, -1);
    },
    moveitemdown: function (_event, target) {
      moveItem(target, 1);
    },
    dropitemlayout: function (_event, target) {
      moveItem(target, 0);
    },
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
    togglespeeds: function () {
      hudState.gmSpeedsExpanded = !hudState.gmSpeedsExpanded;
      refreshHud();
    },
    togglefavorites: function () {
      hudState.favoritesExpanded = !hudState.favoritesExpanded;
      savePanelState?.();
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
    troubleshooting: async function () {
      return openTroubleshooting();
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
      const collapse =
        target.dataset.explorationSection === "true" &&
        target.closest?.(".ws-player-columns") &&
        (hudState.currentView === target.dataset.view ||
          (target.dataset.view === "skills" &&
            target.getAttribute?.("aria-expanded") === "true"));
      if (target.dataset.view === "skills")
        hudState.explorationSkillsCollapsed = Boolean(collapse);
      const previousView = hudState.currentView;
      setView(collapse ? "main" : target.dataset.view);
      if (collapse && previousView === "main") refreshHud();
      savePanelState?.();
    }
  };
}
