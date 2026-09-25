import { setForcedMode, setRegularView } from "./state.js";
import { openSettings, setSetting, SETTINGS } from "../settings.js";
import { usableActivities } from "./quick-access.js";
import { getCurrentCombat } from "../runtime-helpers.js";

export function createHudActions({
  actor,
  adapter,
  canRollActor,
  canRollDeathSave,
  changeResource,
  combatModeAvailable,
  currentMode,
  getCombatant,
  hudState,
  openHpDialog,
  openResourceDialog,
  openSpellSlotsDialog,
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

      if (!getCurrentCombat(game)) {
        return ui.notifications.warn(t("Initiative.NoCombat"));
      }

      const combatant = getCombatant();

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
      const combat = getCurrentCombat(game);
      const combatant = getCombatant();
      if (
        !canRollActor ||
        !combat?.started ||
        !combatant ||
        combat.combatant?.id !== combatant.id
      ) {
        return;
      }
      return performAndRefresh(() => combat.nextTurn());
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

    openspellslots: function (_event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const level = Number(target.dataset.level);
      const pool = target.dataset.pool;
      if (!Number.isInteger(level) || level < 1 || !pool) return;
      if (!adapter.spellSlots(actor, level).some(([, , key]) => key === pool)) {
        return;
      }
      return openSpellSlotsDialog({ level, pool });
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

    toggleresources: function () {
      hudState.resourcesExpanded = !hudState.resourcesExpanded;
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
          adapter.updateHp(actor, { value: max, temp: Number(hp.temp ?? 0) })
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

    openitem: function (_event, target) {
      const item = actor.items.get(target.dataset.itemId);

      if (!item) {
        return ui.notifications.warn(t("Combat.ItemMissing"));
      }

      return item.sheet.render({ force: true });
    },

    openresource: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const item = target.dataset.itemId
        ? actor.items.get(target.dataset.itemId)
        : null;
      const resourceId = target.dataset.resourceId;

      if (!item && !resourceId) {
        return ui.notifications.warn(t("Combat.ItemMissing"));
      }

      if (event.shiftKey) {
        return changeResource({
          amount: 1,
          direction: "consume",
          item,
          resourceId
        });
      }

      return openResourceDialog({ item, resourceId });
    },

    settings: async function () {
      return openSettings();
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
