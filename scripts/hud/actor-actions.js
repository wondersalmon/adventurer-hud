import { isStatusRemovalEvent } from "./status-interactions.js";
import { createGmActionScope } from "./gm/gm-action-scope.js";
import { performRecentRoll } from "./recent-actions.js";
import {
  completeScTurn,
  openScTracker,
  readScInitiative
} from "../compatibility/sc-venaerys-initiative.js";

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
  validateActorAction = null,
  performRoll,
  t
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  let changingStatus = false;
  const changeScTurn = (completed, target) => {
    const requested = getCombatState();
    const data = target?.dataset;
    if (
      data?.scRound != null &&
      (data.scRound !== String(requested.combat?.round) ||
        data.scPhase !== requested.sc?.currentPhaseId ||
        data.scHalf !== (requested.sc?.half ?? ""))
    )
      return;
    if (
      !requested.sc?.canToggle ||
      requested.sc.marked === completed ||
      !canAct()
    )
      return;
    const round = requested.combat.round;
    return performAndRefresh(async () => {
      const current = getCombatState();
      if (
        !current.canEndTurn ||
        current.combat !== requested.combat ||
        current.combatant !== requested.combatant ||
        current.combat.round !== round ||
        current.sc?.currentPhaseId !== requested.sc.currentPhaseId ||
        current.sc?.half !== requested.sc.half ||
        current.sc?.marked !== requested.sc.marked
      )
        return;
      const result = await completeScTurn(
        current.combat,
        current.combatant,
        () =>
          isSessionCurrent() &&
          getCombatState().combat === current.combat &&
          getCombatState().combatant === current.combatant,
        actor,
        completed
      );
      if (completed && result === "done" && isSessionCurrent())
        await onPlayerTurnEnded?.();
      return result;
    });
  };
  return {
    scundo: (_event, target) => changeScTurn(false, target),
    sctracker: () =>
      openScTracker(gmController?.getCombat() ?? getCombatState?.().combat, t),
    editspellslots: async function (event, target) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!canAct() || !isSessionCurrent()) return;
      const pool = target?.dataset.spellPool;
      if (!/^(spell[1-9]|pact)$/.test(pool)) return;
      const slots = adapter.spellSlotPoolData?.(actor, pool);
      const max = Number(slots?.max);
      if (!Number.isFinite(max) || max <= 0) return;
      const choice = await foundry.applications.api.DialogV2.wait({
        window: {
          title: t(pool === "pact" ? "Combat.PactSlots" : "Combat.SpellSlots")
        },
        content:
          "<label>" +
          foundry.utils.escapeHTML(t("Combat.EditSlots")) +
          '<input type="number" name="slots" min="0" max="' +
          max +
          '" step="1" value="' +
          Number(slots.value ?? 0) +
          '"></label>',
        buttons: [
          {
            action: "save",
            label: t("Settings.Save"),
            default: true,
            callback: (_event, button) => {
              const input = button.form.elements.slots;
              if (!input.value.trim() || !input.checkValidity()) return null;
              return Number(input.value);
            }
          },
          { action: "cancel", label: t("Actor.Cancel"), callback: () => null }
        ],
        rejectClose: false
      });
      if (choice == null || !canAct() || !isSessionCurrent()) return;
      if (validateActorAction && !(await validateActorAction())) return;
      if (!canAct() || !isSessionCurrent()) return;
      return performAndRefresh(() => {
        if (!canAct() || !isSessionCurrent()) return;
        return adapter.setSpellSlotValue?.(actor, pool, choice);
      });
    },
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

      if (readScInitiative(combat, combatant)) return;

      return performRoll(() =>
        readScInitiative(combat, combatant)
          ? undefined
          : adapter.rollInitiative(actor, { combatant, event })
      );
    },
    endturn: async function (_event, target) {
      if (gmController) {
        const combat = gmController.getCombat();
        const canExecute = createGmActionScope(gmController, isSessionCurrent);
        if (!combat?.started || !combat.combatant) return;
        if (readScInitiative(combat)?.valid === false) return;
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
      if (getCombatState().sc) return changeScTurn(true, target);
      if (!getCombatState().canEndTurn) return;
      const requested = getCombatState();
      return performAndRefresh(async () => {
        const { combat, combatant, canEndTurn } = getCombatState();
        if (!canEndTurn) return;
        const currentSc = readScInitiative(combat, combatant);
        if (Boolean(currentSc) !== Boolean(requested.sc)) return;
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
