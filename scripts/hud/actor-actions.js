/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createActorActions({
  actor,
  adapter,
  canRollActor = false,
  focusActorToken,
  canRollDeathSave,
  getCombatState,
  gmController,
  gmCombatantId,
  openGmSelection,
  onGmCombatChange,
  openHpDialog,
  performAndRefresh,
  performSceneAction = performAndRefresh,
  performRoll,
  t
}) {
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  return {
    actorcenter: () => focusActorToken?.(),
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
        if (!combat?.started || !combat.combatant) return;
        return performSceneAction(async () => {
          if (combat.combatant.id === gmCombatantId) {
            const next = await gmController.endTurn(gmCombatantId, () =>
              combat.nextTurn()
            );
            if (next && next.id !== gmCombatantId) await openGmSelection();
          } else {
            await combat.nextTurn();
            onGmCombatChange?.();
          }
        });
      }
      if (!getCombatState().canEndTurn) return;
      return performAndRefresh(async () => {
        const { combat, canEndTurn } = getCombatState();
        if (!canEndTurn) return;
        return combat.nextTurn();
      });
    },
    ability: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { type, key } = target.dataset;

      return performRoll(() =>
        adapter.rollAbility(actor, { type, key, event })
      );
    },
    skill: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
        adapter.rollSkill(actor, { key: target.dataset.key, event })
      );
    },
    tool: async function (event, target) {
      if (!canAct()) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
        adapter.rollTool(actor, { key: target.dataset.key, event })
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
