import { findCombatant, getCurrentCombat } from "../../runtime-helpers.js";
import { activeEffectSummaries } from "../effect-summaries.js";

export function companionInitiative(entry) {
  const combat = getCurrentCombat(game);
  const combatant =
    entry.actor && entry.token
      ? findCombatant(combat?.combatants, {
          tokenId: entry.token.id,
          sceneId: entry.token.parent?.id
        })
      : null;
  return {
    combat,
    combatant,
    isTurn: Boolean(
      combat?.started &&
      combat.combatant &&
      (combatant
        ? combat.combatant?.id === combatant.id
        : entry.tokenOptions?.some(
            token =>
              token.actor?.isOwner &&
              findCombatant(combat.combatants, {
                tokenId: token.id,
                sceneId: token.parent?.id
              })?.id === combat.combatant?.id
          ))
    ),
    value: combatant?.initiative ?? null,
    canRoll: Boolean(
      entry.actor?.isOwner &&
      combatant &&
      combatant.isOwner !== false &&
      combatant.initiative == null
    )
  };
}

export function companionEffects(actor, adapter) {
  return activeEffectSummaries(actor, adapter.statusDefinitions?.() ?? []);
}
