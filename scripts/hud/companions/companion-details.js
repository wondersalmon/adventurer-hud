import { findCombatant, getCurrentCombat } from "../../runtime-helpers.js";
import { combatTurnState } from "../actor-context.js";
import { scActingCombatant } from "../../compatibility/sc-venaerys-initiative.js";
import { visibleEffectSummaries } from "../effect-summaries.js";
import { getSetting, SETTINGS } from "../../settings-access.js";

export function companionInitiative(entry) {
  const combat = getCurrentCombat(game);
  const original =
    entry.actor && entry.token
      ? findCombatant(combat?.combatants, {
          tokenId: entry.token.id,
          sceneId: entry.token.parent?.id
        })
      : null;
  const combatant = scActingCombatant(combat, original);
  const state = combatTurnState(combat, combatant, entry.actor?.isOwner);
  return {
    combat,
    combatant,
    sc: state.sc,
    isTurn: Boolean(
      combat?.started &&
      combat.combatant &&
      (combatant
        ? state.isTurn
        : entry.tokenOptions?.some(
            token =>
              token.actor?.isOwner &&
              combatTurnState(
                combat,
                scActingCombatant(
                  combat,
                  findCombatant(combat.combatants, {
                    tokenId: token.id,
                    sceneId: token.parent?.id
                  })
                ),
                token.actor?.isOwner
              ).isTurn
          ))
    ),
    value: combatant?.initiative ?? null,
    canRoll: Boolean(
      entry.actor?.isOwner &&
      combatant &&
      combatant.isOwner !== false &&
      combatant.initiative == null &&
      !state.sc
    )
  };
}

export function companionEffects(actor, adapter) {
  return visibleEffectSummaries(actor, adapter, {
    hiddenEffects: getSetting(SETTINGS.hiddenEffects),
    statusFilter: getSetting(SETTINGS.statusFilter)
  });
}
