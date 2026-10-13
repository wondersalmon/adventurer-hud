import { setForcedMode, setRegularView, toggleStatDetails } from "./state.js";
import { moveItemLayout } from "./items/item-layout.js";
import {
  changeHudLayout,
  resetHudBlock,
  resetHudLayout,
  undoHudLayout
} from "./window/hud-layout.js";
import {
  captureHudLayoutUndo,
  rememberHudLayoutChange
} from "./window/hud-layout-model.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";
import { openSettings, openTroubleshooting } from "../settings-navigation.js";

/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createViewActions({
  actor,
  gmController,
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
  const canEditLayout = () => canAct() || Boolean(gmController?.isGM());
  const itemLayout = target => target?.closest?.("[data-layout-scope]");
  const layoutSnapshot = root =>
    captureHudLayoutUndo(
      hudState,
      root
        ?.querySelector("[data-hud-layout-mode]")
        ?.getAttribute("data-hud-layout-mode") ??
        hudState.renderedMode ??
        "regular"
    );
  const moveItem = (target, direction) => {
    const list = itemLayout(target);
    if (!canAct() || !list || !hudState.hudEditing) return;
    const keys = Array.from(
      list.querySelectorAll(".ws-organized-entry"),
      node => node.dataset.layoutKey
    );
    const key = target.dataset.layoutKey;
    const destination =
      direction === "top"
        ? keys[0]
        : direction === "bottom"
          ? keys.at(-1)
          : direction
            ? keys[keys.indexOf(key) + direction]
            : target.dataset.layoutTarget;
    const snapshot = layoutSnapshot(target.closest(".ws-rolls-dialog"));
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
    rememberHudLayoutChange(hudState, snapshot);
    savePanelState?.();
    refreshHud();
  };
  return {
    hudlayoutreset: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      if (!canEditLayout() || !root) return;
      const snapshot = layoutSnapshot(root);
      if (!resetHudLayout(root, hudState)) return;
      rememberHudLayoutChange(hudState, snapshot);
      savePanelState?.();
      refreshHud();
    },
    hudcolumnadd: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      const mode = root
        ?.querySelector("[data-hud-layout-mode]")
        ?.getAttribute("data-hud-layout-mode");
      if (
        !canEditLayout() ||
        !hudState.hudEditing ||
        !mode ||
        mode === "preparation"
      )
        return;
      const snapshot = layoutSnapshot(root);
      const scope = `${mode}:extra`;
      const extra = hudState.hudLayouts[scope];
      if (extra) {
        const actions = hudState.hudLayouts[`${mode}:actions`] ?? {
          order: [],
          hidden: []
        };
        hudState.hudLayouts[`${mode}:actions`] = {
          order: [...new Set([...actions.order, ...extra.order])],
          hidden: [...new Set([...actions.hidden, ...extra.hidden])]
        };
        delete hudState.hudLayouts[scope];
      } else hudState.hudLayouts[scope] = { order: [], hidden: [] };
      rememberHudLayoutChange(hudState, snapshot);
      savePanelState?.();
      refreshHud();
    },
    hudblockmove: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      const snapshot = layoutSnapshot(root);
      if (canEditLayout() && root && changeHudLayout(root, hudState, target)) {
        rememberHudLayoutChange(hudState, snapshot);
        savePanelState?.();
        refreshHud();
      }
    },
    hudblockhide: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      const snapshot = layoutSnapshot(root);
      if (canAct() && root && changeHudLayout(root, hudState, target, true)) {
        rememberHudLayoutChange(hudState, snapshot);
        savePanelState?.();
        refreshHud();
      }
    },
    hudblockreset: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      if (!canAct() || !root) return;
      const snapshot = layoutSnapshot(root);
      if (!resetHudBlock(root, hudState, target)) return;
      rememberHudLayoutChange(hudState, snapshot);
      savePanelState?.();
      refreshHud();
    },
    hudlayoutundo: function (_event, target) {
      const root = this?.element ?? target?.closest?.(".ws-rolls-dialog");
      if (!canEditLayout() || !root || !undoHudLayout(root, hudState)) return;
      savePanelState?.();
      refreshHud();
    },
    togglehudedit: function () {
      if (!canEditLayout()) return;
      hudState.hudEditing = !hudState.hudEditing;
      hudState.hudLayoutUndo = null;
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
      const snapshot = layoutSnapshot(target.closest(".ws-rolls-dialog"));
      hudState.itemLayouts[scope] = {
        ...preference,
        hidden: preference.hidden.includes(key)
          ? preference.hidden.filter(value => value !== key)
          : [...preference.hidden, key]
      };
      rememberHudLayoutChange(hudState, snapshot);
      savePanelState?.();
      refreshHud();
    },
    moveitemup: function (_event, target) {
      moveItem(target, -1);
    },
    moveitemdown: function (_event, target) {
      moveItem(target, 1);
    },
    moveitemtop: function (_event, target) {
      moveItem(target, "top");
    },
    moveitembottom: function (_event, target) {
      moveItem(target, "bottom");
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
      const section = target.closest?.(".ws-combat-category-section");
      if (section) {
        const expanded = hudState.hudLayouts["combat:expanded"] ?? {
          order: hudState.combatCategory ? [hudState.combatCategory] : [],
          hidden: []
        };
        const key = target.dataset.category;
        const lane =
          section.closest("[data-hud-lane]") ?? section.parentElement;
        const siblings = new Set(
          [
            ...(lane?.querySelectorAll(
              '.ws-combat-category-section > [data-action="combatfilter"]'
            ) ?? [])
          ]
            .filter(
              button =>
                (button.closest("[data-hud-lane]") ??
                  button.closest(".ws-combat-category-section")
                    .parentElement) === lane
            )
            .map(button => button.dataset.category)
        );
        hudState.hudLayouts["combat:expanded"] = {
          order: expanded.order.includes(key)
            ? expanded.order.filter(value => value !== key)
            : [...expanded.order.filter(value => !siblings.has(value)), key],
          hidden: []
        };
        hudState.combatCategory =
          hudState.hudLayouts["combat:expanded"].order.at(-1) ?? null;
        savePanelState?.();
        refreshHud("actions");
        return;
      }
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
    featurefilter: async function (_event, target) {
      const filter = target?.dataset?.filter;
      if (
        filter !== undefined &&
        !["active", "passive", "all"].includes(filter)
      )
        return;
      hudState.allFeatures = filter === "all";
      hudState.showPassiveFeatures =
        filter === undefined
          ? !hudState.showPassiveFeatures
          : filter === "passive";
      await savePanelState?.();
      refreshHud("actions");
    },
    spellsourcefilter: function (_event, target) {
      const source = target.dataset.source;
      if (
        typeof source !== "string" ||
        source.length > 256 ||
        /[\u0000-\u001f]/.test(source)
      )
        return;
      hudState.spellSource =
        !source || hudState.spellSource === source ? null : source;
      savePanelState?.();
      refreshHud(currentMode() === "combat" ? "actions" : null);
    },
    spellfilter: function (_event, target) {
      hudState.preparedSpellsOnly = target.dataset.prepared === "true";
      hudState.unpreparedSpellsOnly = target.dataset.prepared === "unprepared";
      savePanelState?.();
      refreshHud(currentMode() === "combat" ? "actions" : null);
    },
    skillfilter: async function (_event, target) {
      const proficientOnly = target.dataset.proficient === "true";
      if (hudState.proficientSkillsOnly === proficientOnly) return;
      await setSetting(SETTINGS.proficientSkillsOnly, proficientOnly);
      hudState.proficientSkillsOnly = proficientOnly;
    },
    togglefeaturegroup: function (event, target) {
      event?.preventDefault?.();
      const key = JSON.stringify([
        target.dataset.layoutScope,
        target.dataset.featureGroup
      ]);
      const collapsed = hudState.collapsedFeatureGroups ?? [];
      hudState.collapsedFeatureGroups = collapsed.includes(key)
        ? collapsed.filter(value => value !== key)
        : [...collapsed, key].slice(-1000);
      savePanelState?.();
      const body = target
        .closest?.(".ws-feature-group")
        ?.querySelector(".ws-combat-item-grid");
      if (body) {
        const expanded = !hudState.collapsedFeatureGroups.includes(key);
        body.hidden = !expanded;
        target.setAttribute("aria-expanded", String(expanded));
        const group = target.closest(".ws-feature-group");
        if (group?.tagName === "DETAILS") group.open = expanded;
      } else refreshHud("actions");
    },
    togglespeeds: function () {
      toggleStatDetails(hudState, "gmSpeedsExpanded");
      refreshHud();
    },
    togglearmorclass: function () {
      toggleStatDetails(hudState, "armorClassExpanded");
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
    effectsettings: async function () {
      return openSettings("effects");
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
