import { setForcedMode, setRegularView } from "./state.js";
import { openSettings } from "../settings.js";
import { usableActivities } from "./quick-access.js";

export function createHudActions({
  actor,
  adapter,
  canRollActor,
  canRollDeathSave,
  changeResource,
  combatModeAvailable,
  currentMode,
  deathModeAvailable,
  getCombatant,
  hudState,
  isCloseAfterRoll,
  openHpDialog,
  openResourceDialog,
  performAndRefresh,
  refreshHud,
  resetWindow,
  rollAndClose,
  setView,
  storeCloseAfterRoll,
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

      if (!game.combat) {
        return ui.notifications.warn(t("Initiative.NoCombat"));
      }

      const combatant = getCombatant();

      if (combatant?.initiative != null) {
        return;
      }

      if (!combatant) {
        return ui.notifications.warn(t("Initiative.NotCombatant"));
      }

      return rollAndClose(() =>
        adapter.rollInitiative(actor, { combatant, event })
      );
    },

    ability: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { type, key } = target.dataset;

      return rollAndClose(() =>
        adapter.rollAbility(actor, { type, key, event })
      );
    },

    skill: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return rollAndClose(() =>
        adapter.rollSkill(actor, { key: target.dataset.key, event })
      );
    },

    tool: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return rollAndClose(() =>
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

      return rollAndClose(() => adapter.rollDeathSave(actor, { event }));
    },

    normal: function () {
      setForcedMode(hudState, "regular");
      refreshHud();
    },

    regularview: function (_event, target) {
      setForcedMode(hudState, "regular");
      setRegularView(hudState, target.dataset.view);
      refreshHud();
    },

    combatmode: function () {
      if (!combatModeAvailable()) {
        return ui.notifications.warn(t("Combat.NotAvailable"));
      }

      setForcedMode(hudState, "combat");
      refreshHud();
    },

    combatfilter: function (_event, target) {
      hudState.combatCategory = target.dataset.category;
      hudState.actionMenuOpen = false;
      refreshHud("actions");
    },

    toggleactionmenu: function () {
      hudState.actionMenuOpen = !hudState.actionMenuOpen;
      refreshHud("actions");
    },

    inventoryfilter: function (_event, target) {
      hudState.inventoryCategory = target.dataset.category;
      refreshHud();
    },

    spellfilter: function (_event, target) {
      hudState.preparedSpellsOnly = target.dataset.prepared === "true";
      refreshHud(currentMode() === "combat" ? "actions" : null);
    },

    toggleabilities: function () {
      const key =
        currentMode() === "combat"
          ? "combatAbilitiesExpanded"
          : "abilitiesExpanded";
      hudState[key] = !hudState[key];
      refreshHud();
    },

    togglefavorites: function () {
      hudState.favoritesExpanded = !hudState.favoritesExpanded;
      refreshHud();
    },

    toggleresources: function () {
      hudState.resourcesExpanded = !hudState.resourcesExpanded;
      refreshHud();
    },

    edithp: function () {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
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

      return rollAndClose(() => adapter.useItem(item, { event }));
    },

    useactivity: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const item = actor.items.get(target.dataset.itemId);
      if (!item) return ui.notifications.warn(t("Combat.ItemMissing"));
      return rollAndClose(() =>
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

    removestatus: async function (_event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const statusId = target.dataset.statusId;
      const effectId = target.dataset.effectId;

      return performAndRefresh(async () => {
        if (effectId) {
          await actor.effects.get(effectId)?.delete();
        } else if (actor.statuses?.has(statusId)) {
          await actor.toggleStatusEffect(statusId, { active: false });
        }
      });
    },

    settings: async function () {
      return openSettings();
    },

    deathmode: function () {
      if (!deathModeAvailable()) {
        return ui.notifications.warn(t("Combat.NotAvailable"));
      }

      setForcedMode(hudState, "death");
      refreshHud();
    },

    togglecloseafterroll: async function () {
      await storeCloseAfterRoll(!isCloseAfterRoll());
      ui.notifications.info(
        t(
          isCloseAfterRoll()
            ? "Window.CloseAfterRollEnabled"
            : "Window.CloseAfterRollDisabled"
        )
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
