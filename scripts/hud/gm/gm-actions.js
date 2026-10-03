import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";
import { openGmSettings } from "../../settings-navigation.js";
import {
  deadCreatures,
  createSceneCombat,
  addGmCreatures,
  addSceneCreatures,
  moveToCreature,
  removeDeadCreatures
} from "./gm-scene.js";

/** @param {import('../../../types/hud.js').HudActionsOptions} options */
export function createGmActions({
  actor,
  gmController,
  gmCombatantId,
  openGmSelection,
  onGmCombatChange,
  hudState,
  performAndRefresh,
  performSceneAction = performAndRefresh,
  refreshHud,
  t
}) {
  return {
    gmstartcombat: async function () {
      if (
        !gmController?.isGM() ||
        !gmController.getCombat() ||
        gmController.getCombat().started
      )
        return;
      return performSceneAction(async () => {
        await gmController.getCombat().startCombat();
        gmController.resumeFollow();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmcreatecombat: async function () {
      if (!gmController?.isGM()) return;
      return performSceneAction(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (combat) gmController.chooseCombat(combat.id);
        onGmCombatChange();
      });
    },
    gmaddcreatures: async function (_event, target) {
      if (!gmController?.isGM()) return;
      return performSceneAction(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (!combat) return;
        gmController.chooseCombat(combat.id);
        if (target?.dataset.scope === "all") await addSceneCreatures(combat);
        else await addGmCreatures(combat);
        onGmCombatChange();
      });
    },
    gmendcombat: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performSceneAction(() => gmController.getCombat()?.endCombat());
    },
    gmresetinitiative: async function () {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat) return;
      return performSceneAction(() => combat.resetAll({ updateTurn: true }));
    },
    gmresetcombatantinitiative: async function (_event, target) {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat) return;
      const combatant = combat.combatants?.get(
        target?.dataset.resetInitiativeId
      );
      if (!combatant || combatant.initiative == null) return;
      return performSceneAction(() => combatant.update({ initiative: null }));
    },
    gmrollinitiative: async function (_event, target) {
      if (!gmController?.isGM()) return;
      return performAndRefresh(async () => {
        const combat = gmController.getCombat();
        if (!combat) return;
        const entries = gmController
          .roster()
          .filter(
            entry =>
              (target.dataset.scope === "all" || entry.id === gmCombatantId) &&
              (target.dataset.reroll === "true" || entry.initiative == null)
          );
        if (entries.length)
          await combat.rollInitiative(
            entries.map(entry => entry.id),
            { updateTurn: true }
          );
      });
    },
    gmspeeds() {
      hudState.gmSpeedsExpanded = !hudState.gmSpeedsExpanded;
      refreshHud();
    },
    gmlegendary() {
      hudState.gmLegendaryExpanded = !hudState.gmLegendaryExpanded;
      refreshHud();
    },
    gmsettings: () => openGmSettings(),
    gmsheet: () => actor?.sheet?.render({ force: true }),
    gmcenter: () => moveToCreature(gmController?.sync()),
    gmping: () =>
      performSceneAction(() =>
        moveToCreature(gmController?.sync(), { ping: true })
      ),
    gmremove: () =>
      performSceneAction(() =>
        removeDeadCreatures(gmController?.getCombat(), [gmCombatantId])
      ),
    gmremovedead: async function () {
      if (!gmController?.isGM()) return;
      const combat = gmController.getCombat();
      const ids = deadCreatures(combat).map(entry => entry.id);
      if (!ids.length) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RemoveDead") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RemoveDeadConfirm"))} (${ids.length})</p>`
      });
      if (confirmed)
        return performSceneAction(async () => {
          const count = await removeDeadCreatures(combat, ids);
          if (!count) ui.notifications.warn(t("GM.NoTokensRemoved"));
        });
    },
    gmselect: async function (_event, target) {
      if (!gmController?.isGM()) return;
      if (await gmController.select(target.dataset.combatantId))
        return openGmSelection();
    },
    gmfollow: async function () {
      if (!gmController?.isGM()) return;
      gmController.resumeFollow();
      if (
        !getSetting(SETTINGS.gmFollowTurn) &&
        getSetting(SETTINGS.gmAutoAdvance)
      ) {
        await setSetting(SETTINGS.gmAutoAdvance, false);
      }
      await setSetting(
        SETTINGS.gmFollowTurn,
        !getSetting(SETTINGS.gmFollowTurn)
      );
      if (getSetting(SETTINGS.gmFollowTurn)) {
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      } else onGmCombatChange();
    },
    gmprevious: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performAndRefresh(async () => {
        if (!gmController.isGM() || !gmController.getCombat()?.started) return;
        await gmController.getCombat().previousTurn();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmnext: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performAndRefresh(async () => {
        if (!gmController.isGM() || !gmController.getCombat()?.started) return;
        await gmController.getCombat().nextTurn();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    }
  };
}
