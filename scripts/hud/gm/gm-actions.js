import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";
import { openGmSettings } from "../../settings-navigation.js";
import { createGmActionScope } from "./gm-action-scope.js";
import {
  canGoToPreviousTurn,
  hasPlayerOwner,
  defeated,
  canHideCombatant
} from "./gm-combat.js";
import {
  deadCreatures,
  createSceneCombat,
  addGmCreatures,
  addSceneCreatures,
  moveToCreature,
  removeDeadCreatures
} from "./gm-scene.js";

// Keep native token toggles serialized even when a refresh replaces the HUD session.
const tokenToggleLocks = new WeakMap();
const TOGGLE_PAUSE_MS = 250;

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
  isSessionCurrent = () => true,
  refreshHud,
  t
}) {
  const runScene = (
    callback,
    canExecute = createGmActionScope(gmController, isSessionCurrent)
  ) =>
    performSceneAction(() => (canExecute() ? callback(canExecute) : undefined));
  const toggleToken = async (token, callback) => {
    if ((tokenToggleLocks.get(token) ?? -Infinity) > performance.now()) return;
    tokenToggleLocks.set(token, Infinity);
    try {
      return await runScene(callback);
    } finally {
      tokenToggleLocks.set(token, performance.now() + TOGGLE_PAUSE_MS);
    }
  };
  const move = (target, ping = false) => {
    const combat = gmController?.getCombat();
    const entry = target?.dataset.combatantId
      ? combat?.combatants?.get(target.dataset.combatantId)
      : gmController?.sync();
    const token = entry?.token;
    if (!gmController?.isGM() || !token || !isSessionCurrent()) return;
    return runScene(canExecute => {
      if (
        !canExecute() ||
        combat?.combatants?.get(entry.id) !== entry ||
        entry.token !== token ||
        token.parent !== canvas.scene ||
        canvas.scene.tokens.get(token.id) !== token
      )
        return;
      return moveToCreature(entry, { ping });
    });
  };
  return {
    gmdefeated: function (_event, target) {
      const combat = gmController?.getCombat();
      const entry = combat?.combatants?.get(target?.dataset.combatantId);
      const token = entry?.token;
      const creature = token?.actor ?? entry?.actor;
      if (
        !gmController?.isGM() ||
        !token ||
        !creature?.isOwner ||
        token.isOwner === false
      )
        return;
      const status = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
      return toggleToken(token, async canExecute => {
        const current = () =>
          canExecute() &&
          combat.combatants.get(entry.id) === entry &&
          entry.token === token &&
          token.actor === creature &&
          creature.isOwner &&
          token.isOwner !== false &&
          token.parent === canvas.scene &&
          canvas.scene.tokens.get(token.id) === token;
        if (!current()) return;
        const next = !defeated(entry);
        if (
          creature.toggleStatusEffect &&
          Boolean(creature.statuses?.has(status)) !== next
        )
          await creature.toggleStatusEffect(status, { active: next });
        if (current() && entry.defeated !== next)
          await entry.update({ defeated: next });
      });
    },
    gmhidden: function (_event, target) {
      const combat = gmController?.getCombat();
      const entry = combat?.combatants?.get(target?.dataset.combatantId);
      if (!gmController?.isGM() || !canHideCombatant(entry)) return;
      const token = entry.token;
      return toggleToken(token, canExecute => {
        if (
          !canExecute() ||
          combat.combatants.get(entry.id) !== entry ||
          entry.token !== token ||
          token.parent !== canvas.scene ||
          canvas.scene.tokens.get(token.id) !== token ||
          !canHideCombatant(entry)
        )
          return;
        return token.update({ hidden: !token.hidden });
      });
    },
    gmrevealhidden: async function () {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat) return;
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      const targets = [...combat.combatants.values()]
        .filter(entry => canHideCombatant(entry) && entry.token.hidden)
        .map(entry => ({ entry, token: entry.token }));
      if (!targets.length) return;
      const accepted = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RevealHidden") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RevealHiddenConfirm"))} (${targets.length})</p>`
      });
      if (!accepted || !canExecute()) return;
      return runScene(async () => {
        for (const { entry, token } of targets) {
          if (!canExecute()) break;
          if (
            combat.combatants.get(entry.id) !== entry ||
            entry.token !== token ||
            token.parent !== canvas.scene ||
            canvas.scene.tokens.get(token.id) !== token ||
            !canHideCombatant(entry) ||
            !token.hidden
          )
            continue;
          await token.update({ hidden: false });
        }
      }, canExecute);
    },
    gmimage: function (_event, target) {
      if (!gmController?.isGM()) return;
      const combatant = gmController
        .getCombat()
        ?.combatants?.get(target?.dataset.combatantId ?? gmCombatantId);
      const token = combatant?.token;
      const creature = token?.actor ?? combatant?.actor;
      const src = token?.texture?.src || creature?.img;
      if (!src || !isSessionCurrent()) return;
      return new foundry.applications.apps.ImagePopout({
        src,
        uuid: token?.uuid ?? creature?.uuid,
        window: { title: combatant.name ?? creature.name }
      }).render({ force: true });
    },
    gmeditinitiative: async function (_event, target) {
      const combat = gmController?.getCombat();
      const combatant = combat?.combatants?.get(target?.dataset.combatantId);
      if (!gmController?.isGM() || !combatant) return;
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      if (combatant.initiative == null)
        return runScene(
          () => combat.rollInitiative([combatant.id], { updateTurn: true }),
          canExecute
        );
      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: t("GM.EditInitiative") },
        content: `<label>${foundry.utils.escapeHTML(t("Labels.Initiative"))}<input type="number" step="any" name="initiative" value="${Number.isFinite(combatant.initiative) ? combatant.initiative : ""}"></label>`,
        buttons: [
          {
            action: "save",
            label: t("GM.SaveInitiative"),
            default: true,
            callback: (_event, button) => {
              const input = button.form.elements.initiative;
              return input.value.trim() && Number.isFinite(Number(input.value))
                ? { action: "save", value: Number(input.value) }
                : null;
            }
          },
          {
            action: "roll",
            label: t("GM.RerollSelectedInitiative"),
            callback: () => ({ action: "roll" })
          },
          {
            action: "reset",
            label: t("GM.ResetInitiative"),
            callback: () => ({ action: "reset" })
          }
        ],
        rejectClose: false
      });
      if (
        !choice ||
        !canExecute() ||
        combat.combatants.get(combatant.id) !== combatant
      )
        return;
      return runScene(
        () =>
          choice.action === "roll"
            ? combat.rollInitiative([combatant.id], { updateTurn: true })
            : combat.setInitiative(
                combatant.id,
                choice.action === "reset" ? null : choice.value
              ),
        canExecute
      );
    },
    gmstartcombat: async function () {
      if (
        !gmController?.isGM() ||
        !gmController.getCombat() ||
        gmController.getCombat().started
      )
        return;
      return runScene(async canExecute => {
        await gmController.getCombat().startCombat();
        if (!canExecute()) return;
        gmController.resumeFollow();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmcreatecombat: async function () {
      if (!gmController?.isGM()) return;
      const canContinue = createGmActionScope(gmController, isSessionCurrent, {
        checkCombat: false
      });
      return runScene(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (
          !canContinue() ||
          (gmController.getCombat() && gmController.getCombat() !== combat)
        )
          return;
        if (combat) gmController.chooseCombat(combat.id);
        onGmCombatChange();
      });
    },
    gmaddcreatures: async function (_event, target) {
      if (!gmController?.isGM()) return;
      const canContinue = createGmActionScope(gmController, isSessionCurrent, {
        checkCombat: false
      });
      return runScene(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (
          !canContinue() ||
          (gmController.getCombat() && gmController.getCombat() !== combat) ||
          (combat?.scene && combat.scene.id !== canvas.scene?.id)
        )
          return;
        if (!combat) return;
        gmController.chooseCombat(combat.id);
        if (target?.dataset.scope === "all") await addSceneCreatures(combat);
        else await addGmCreatures(combat);
        if (isSessionCurrent()) onGmCombatChange();
      });
    },
    gmendcombat: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return runScene(() => gmController.getCombat()?.endCombat());
    },
    gmresetinitiative: async function (_event, target) {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat) return;
      const npcOnly = target?.dataset.scope === "npc";
      const participants = [
        ...(combat.turns ?? combat.combatants?.values?.() ?? [])
      ].filter(
        entry =>
          entry.initiative != null &&
          (!npcOnly || (entry.isNPC ?? !hasPlayerOwner(entry)))
      );
      if (!participants.length) return;
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      const accepted = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: t(npcOnly ? "GM.ResetNpcInitiative" : "GM.ResetAllInitiative")
        },
        content: `<p>${foundry.utils.escapeHTML(t(npcOnly ? "GM.ResetNpcInitiativeConfirm" : "GM.ResetAllInitiativeConfirm"))}</p>`
      });
      if (
        !accepted ||
        !canExecute() ||
        participants.some(
          entry =>
            combat.combatants?.get && combat.combatants.get(entry.id) !== entry
        )
      )
        return;
      return runScene(async () => {
        if (!npcOnly) return combat.resetAll({ updateTurn: true });
        for (const entry of participants) {
          if (!canExecute()) return;
          await combat.setInitiative(entry.id, null);
        }
      }, canExecute);
    },
    gmresetcombatantinitiative: async function (_event, target) {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat) return;
      const combatant = combat.combatants?.get(
        target?.dataset.resetInitiativeId
      );
      if (!combatant || combatant.initiative == null) return;
      return runScene(() => combatant.update({ initiative: null }));
    },
    gmrollinitiative: async function (_event, target) {
      if (!gmController?.isGM()) return;
      return runScene(async canExecute => {
        const combat = gmController.getCombat();
        if (!combat) return;
        if (!gmController.isGM()) return;
        if (target.dataset.reroll !== "true") {
          const scope = target.dataset.scope;
          if (scope === "all" || scope === "npc") {
            const participants = [
              ...(combat.turns ?? combat.combatants?.values?.() ?? [])
            ].filter(
              entry =>
                scope === "all" || (entry.isNPC ?? !hasPlayerOwner(entry))
            );
            if (
              participants.length &&
              participants.every(entry => entry.initiative != null)
            ) {
              const confirmed = await foundry.applications.api.DialogV2.confirm(
                {
                  window: {
                    title: t(
                      scope === "npc"
                        ? "GM.RerollNpcInitiative"
                        : "GM.RerollAllInitiative"
                    )
                  },
                  content: `<p>${foundry.utils.escapeHTML(t("GM.RerollInitiativeConfirm"))}</p>`
                }
              );
              if (
                !confirmed ||
                !canExecute() ||
                participants.some(
                  entry =>
                    combat.combatants?.get &&
                    combat.combatants.get(entry.id) !== entry
                )
              )
                return;
              return combat.rollInitiative(
                participants.map(entry => entry.id),
                { updateTurn: true }
              );
            }
          }
          if (target.dataset.scope === "all")
            return combat.rollAll({ updateTurn: true });
          if (target.dataset.scope === "npc")
            return combat.rollNPC({ updateTurn: true });
        }
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
    gmcenter: (_event, target) => move(target),
    gmping: (_event, target) => move(target, true),
    gmremove: async function () {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM()) return;
      const entry = deadCreatures(combat).find(
        entry => entry.id === gmCombatantId
      );
      if (!entry) return;
      const token = entry.token;
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RemoveCreature") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RemoveDeadConfirm"))}</p>`
      });
      if (
        confirmed &&
        canExecute() &&
        combat.combatants.get(entry.id) === entry &&
        entry.token === token
      )
        return runScene(
          () =>
            removeDeadCreatures(combat, [entry.id], canExecute, [
              { entry, token }
            ]),
          canExecute
        );
    },
    gmremovecombatants: async function (_event, target) {
      const combat = gmController?.getCombat();
      if (!gmController?.isGM() || !combat || combat.started) return;
      const participants = [...combat.combatants.values()].filter(entry =>
        target?.dataset.combatantId
          ? entry.id === target.dataset.combatantId
          : target?.dataset.scope === "npc"
            ? (entry.isNPC ?? !hasPlayerOwner(entry))
            : true
      );
      if (!participants.length) return;
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      const accepted = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RemoveCombatants") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RemoveCombatantsConfirm"))} (${participants.length})</p>`
      });
      if (
        !accepted ||
        !canExecute() ||
        combat.started ||
        participants.some(entry => combat.combatants.get(entry.id) !== entry)
      )
        return;
      return runScene(
        () =>
          combat.deleteEmbeddedDocuments(
            "Combatant",
            participants.map(entry => entry.id)
          ),
        canExecute
      );
    },
    gmremovedead: async function () {
      if (!gmController?.isGM()) return;
      const combat = gmController.getCombat();
      const canExecute = createGmActionScope(gmController, isSessionCurrent);
      const targets = deadCreatures(combat).map(entry => ({
        entry,
        token: entry.token
      }));
      const ids = targets.map(({ entry }) => entry.id);
      if (!ids.length) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RemoveDead") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RemoveDeadConfirm"))} (${ids.length})</p>`
      });
      if (confirmed && canExecute())
        return runScene(async () => {
          const count = await removeDeadCreatures(
            combat,
            ids,
            canExecute,
            targets
          );
          if (!count && canExecute())
            ui.notifications.warn(t("GM.NoTokensRemoved"));
        }, canExecute);
    },
    gmselect: async function (_event, target) {
      if (!gmController?.isGM()) return;
      if (
        (await gmController.select(target.dataset.combatantId)) &&
        isSessionCurrent()
      )
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
        if (!isSessionCurrent()) return;
      }
      await setSetting(
        SETTINGS.gmFollowTurn,
        !getSetting(SETTINGS.gmFollowTurn)
      );
      if (!isSessionCurrent()) return;
      if (getSetting(SETTINGS.gmFollowTurn)) {
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      } else onGmCombatChange();
    },
    gmprevious: async function () {
      if (
        !gmController?.isGM() ||
        !canGoToPreviousTurn(gmController.getCombat())
      )
        return;
      return runScene(async canExecute => {
        if (
          !gmController.isGM() ||
          !canGoToPreviousTurn(gmController.getCombat())
        )
          return;
        await gmController.getCombat().previousTurn();
        if (!canExecute()) return;
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmnext: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return runScene(async canExecute => {
        if (!gmController.isGM() || !gmController.getCombat()?.started) return;
        await gmController.getCombat().nextTurn();
        if (!canExecute()) return;
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    }
  };
}
