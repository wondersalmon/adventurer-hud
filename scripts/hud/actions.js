import { setForcedMode, setRegularView } from "./state.js";
import { getSetting, openSettings, setSetting, SETTINGS } from "../settings.js";
import { usableActivities } from "./quick-access.js";

export function createHudActions({
  actor,
  adapter,
  canRollActor,
  canStartMutation = () => true,
  canRollDeathSave,
  combatModeAvailable,
  currentMode,
  getCombatState,
  hudState,
  openHpDialog,
  performAndRefresh,
  refreshHud,
  savePanelState,
  resetWindow,
  performRoll,
  setView,
  t,
  toggleFavoriteEntry,
  updateSearch,
  visibility,
  togglePin
}) {
  const actions = {
    initiative: async function (event) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { combat, combatant } = getCombatState();
      if (!combat) {
        return ui.notifications.warn(t("Initiative.NoCombat"));
      }

      if (combatant?.initiative != null) {
        return;
      }

      if (!combatant) {
        return ui.notifications.warn(t("Initiative.NotCombatant"));
      }

      return performRoll(() =>
        adapter.rollInitiative(actor, { combatant, event })
      );
    },

    endturn: async function () {
      if (!getCombatState().canEndTurn) return;
      return performAndRefresh(() => {
        const { combat, canEndTurn } = getCombatState();
        if (!canEndTurn) return;
        return combat.nextTurn();
      });
    },

    ability: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { type, key } = target.dataset;

      return performRoll(() =>
        adapter.rollAbility(actor, { type, key, event })
      );
    },

    skill: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
        adapter.rollSkill(actor, { key: target.dataset.key, event })
      );
    },

    tool: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
        adapter.rollTool(actor, { key: target.dataset.key, event })
      );
    },

    death: async function (event) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      if (!canRollDeathSave()) {
        return ui.notifications.warn(t("Death.NotRequired"));
      }

      return performRoll(() => adapter.rollDeathSave(actor, { event }));
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

    toggleconditions: function () {
      hudState.conditionsExpanded = !hudState.conditionsExpanded;
      savePanelState?.();
      refreshHud();
    },

    edithp: function (event) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      if (event.shiftKey) {
        const hp = adapter.combatStats(actor).hp;
        const max = Number(hp.max ?? 0);
        if (max <= 0 || Number(hp.value ?? 0) >= max) return;
        return performAndRefresh(() =>
          adapter.updateHp(actor, {
            damage: Number(hp.value ?? 0) - max,
            temp: Number(hp.temp ?? 0)
          })
        );
      }

      return openHpDialog();
    },

    inspiration: function () {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.toggleInspiration(actor));
    },

    shortrest: function () {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.shortRest(actor));
    },

    longrest: function () {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.longRest(actor));
    },

    useitem: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const item = actor.items.get(target.dataset.itemId);

      if (!item) {
        return ui.notifications.warn(t("Combat.ItemMissing"));
      }

      const useState = adapter.itemUseState?.(item);
      if (useState?.blocked) return ui.notifications.warn(t(useState.reason));

      if (
        visibility.activityPicker &&
        !event.shiftKey &&
        usableActivities(adapter, item).length > 1
      ) {
        hudState.openActivityItemId =
          hudState.openActivityItemId === item.id ? null : item.id;
        refreshHud();
        return;
      }

      return performRoll(() => adapter.useItem(item, { event }));
    },

    useactivity: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const item = actor.items.get(target.dataset.itemId);
      if (!item) return ui.notifications.warn(t("Combat.ItemMissing"));
      const useState = adapter.itemUseState?.(item, target.dataset.activityId);
      if (useState?.blocked) return ui.notifications.warn(t(useState.reason));
      return performRoll(() =>
        adapter.useActivity(item, target.dataset.activityId, { event })
      );
    },

    togglefavorite: function (_event, target) {
      if (!visibility.favorites) return;
      return toggleFavoriteEntry(
        target.dataset.itemId,
        target.dataset.activityId ?? null
      );
    },

    togglespellprepared: function (_event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const item = actor.items.get(target.dataset.itemId);
      if (
        item?.type !== "spell" ||
        !adapter.spellPreparation(item)?.canPrepare
      ) {
        return;
      }
      return performAndRefresh(() => adapter.toggleSpellPreparation(item));
    },

    clearsearch: function () {
      updateSearch("");
    },

    openitem: function (event, target) {
      const item = actor.items.get(target.dataset.itemId);

      if (!item) {
        return ui.notifications.warn(t("Combat.ItemMissing"));
      }

      if (event.shiftKey) {
        if (!canStartMutation()) return;
        return adapter.showItemDescription(item, { event });
      }

      return item.sheet.render({ force: true });
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

    resetwindow: function () {
      return resetWindow();
    },

    view: function (_event, target) {
      setView(target.dataset.view);
      savePanelState?.();
    }
  };

  for (const [name, action] of Object.entries(actions)) {
    actions[name] = async function (...args) {
      try {
        return await action.apply(this, args);
      } catch (error) {
        console.error(`Rolls HUD | ${name} action`, error);

        ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
      }
    };
  }

  return actions;
}
