import { findCombatant, getCurrentCombat } from "../../runtime-helpers.js";

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
  if (!actor) return [];
  const definitions = new Map(
    (adapter.statusDefinitions?.() ?? []).map(status => [status.id, status])
  );
  const statuses = new Map(
    [...(actor.statuses ?? [])].map(id => [
      id,
      definitions.get(id) ?? { name: id }
    ])
  );
  const effects = [];
  const seen = new Set();
  for (const effect of typeof actor.allApplicableEffects === "function"
    ? actor.allApplicableEffects()
    : (actor.effects ?? [])) {
    if (effect.disabled || effect.isSuppressed) continue;
    const ids = [...(effect.statuses ?? [])];
    if (ids.length) {
      for (const id of ids)
        statuses.set(id, {
          ...effect,
          ...definitions.get(id),
          name:
            definitions.get(id)?.name ??
            definitions.get(id)?.label ??
            effect.name,
          img:
            definitions.get(id)?.img ??
            definitions.get(id)?.icon ??
            effect.img ??
            effect.icon
        });
    } else if (!seen.has(effect.uuid ?? effect)) {
      seen.add(effect.uuid ?? effect);
      effects.push(effect);
    }
  }
  return [...statuses.values(), ...effects];
}
