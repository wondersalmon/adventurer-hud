import { usableActivities } from "./quick-access.js";

/** @param {import('../../../types/hud.js').HudActionsOptions} options */
export function createItemActions({
  actor,
  adapter,
  canRollActor = false,
  canStartMutation = () => true,
  hudState,
  performAndRefresh,
  refreshHud,
  performRoll,
  t,
  toggleFavoriteEntry,
  removeFavoriteEntry,
  visibility
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  return {
    useitem: async function (event, target) {
      if (!canAct()) {
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
      if (!canAct()) {
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
      if (!visibility.favorites || !canAct()) return;
      return toggleFavoriteEntry(
        target.dataset.itemId,
        target.dataset.activityId ?? null
      );
    },
    removefavorite: function (_event, target) {
      if (!visibility.favorites || !hudState.favoriteEdit || !canAct()) return;
      return removeFavoriteEntry(
        target.dataset.itemId,
        target.dataset.activityId ?? null
      );
    },
    togglespellprepared: function (_event, target) {
      if (!canAct()) {
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
    }
  };
}
