import { isStatusRemovalEvent } from "./status-interactions.js";
import { createGmActionScope } from "./gm/gm-action-scope.js";
import { performRecentRoll } from "./recent-actions.js";

/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createActorActions({
  actor,
  adapter,
  canRollActor = false,
  focusActorToken,
  pingActorToken,
  canRollDeathSave,
  getCombatState,
  gmController,
  gmCombatantId,
  openGmSelection,
  onGmCombatChange,
  onPlayerTurnEnded,
  openHpDialog,
  performAndRefresh,
  performSceneAction = performAndRefresh,
  isSessionCurrent = () => true,
  performRoll,
  t
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  let changingStatus = false;
  return {
    actorinventory: () => {
      if (!canAct()) return ui.notifications.warn(t("Warnings.NoPermission"));
      return adapter.openInventorySheet(actor);
    },
    actorcenter: () => focusActorToken?.(),
    actorping: () => pingActorToken?.(),
    removestatus: function (event, target) {
      if (!isStatusRemovalEvent(event) || changingStatus) return;
      if (!canAct()) return ui.notifications.warn(t("Warnings.NoPermission"));
      return performAndRefresh(async () => {
        changingStatus = true;
        try {
          const result = await adapter.removeStatus(
            actor,
            target.dataset.statusId
          );
          return result;
        } finally {
          changingStatus = false;
        }
      });
    },
    initiative: async function (event) {
      if (!canAct()) {
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
      if (gmController) {
        const combat = gmController.getCombat();
        const canExecute = createGmActionScope(gmController, isSessionCurrent);
        if (!combat?.started || !combat.combatant) return;
        return performSceneAction(async () => {
          if (!canExecute()) return;
          if (gmCombatantId) {
            const next = await gmController.endTurn(gmCombatantId, () =>
              combat.nextTurn()
            );
            if (canExecute() && next && next.id !== gmCombatantId)
              await openGmSelection();
          } else {
            await combat.nextTurn();
            if (canExecute()) onGmCombatChange?.();
          }
        });
      }
      if (!getCombatState().canEndTurn) return;
      return performAndRefresh(async () => {
        const { combat, canEndTurn } = getCombatState();
        if (!canEndTurn) return;
        const before = {
          id: combat.combatant?.id,
          round: combat.round,
          turn: combat.turn
        };
        const result = await combat.nextTurn();
        if (
          combat.combatant?.id !== before.id ||
          combat.round !== before.round ||
          combat.turn !== before.turn
        )
          await onPlayerTurnEnded?.();
        return result;
      });
    },
    ability: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { type, key } = target.dataset;

      return performRecentRoll(
        actor,
        performRoll,
        { action: "ability", type, key },
        () => adapter.rollAbility(actor, { type, key, event })
      );
    },
    skill: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRecentRoll(
        actor,
        performRoll,
        { action: "skill", key: target.dataset.key },
        () => adapter.rollSkill(actor, { key: target.dataset.key, event })
      );
    },
    tool: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRecentRoll(
        actor,
        performRoll,
        { action: "tool", key: target.dataset.key },
        () => adapter.rollTool(actor, { key: target.dataset.key, event })
      );
    },
    death: async function (event) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      if (!canRollDeathSave()) {
        return ui.notifications.warn(t("Death.NotRequired"));
      }

      return performRoll(() => adapter.rollDeathSave(actor, { event }));
    },
    edithp: function (event) {
      if (!canAct()) {
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
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.toggleInspiration(actor));
    },
    shortrest: function () {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.shortRest(actor));
    },
    longrest: function () {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performAndRefresh(() => adapter.longRest(actor));
    }
  };
}
