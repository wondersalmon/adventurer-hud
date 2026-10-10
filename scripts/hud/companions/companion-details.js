import { findCombatant, getCurrentCombat } from "../../runtime-helpers.js";
import { activeEffectSummaries } from "../effect-summaries.js";
import { combatTurnState } from "../actor-context.js";

export function companionInitiative(entry) {
  const combat = getCurrentCombat(game);
  const combatant =
    entry.actor && entry.token
      ? findCombatant(combat?.combatants, {
          tokenId: entry.token.id,
          sceneId: entry.token.parent?.id
        })
      : null;
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
                findCombatant(combat.combatants, {
                  tokenId: token.id,
                  sceneId: token.parent?.id
                }),
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
  return activeEffectSummaries(actor, adapter.statusDefinitions?.() ?? []);
}
