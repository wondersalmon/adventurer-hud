import { findCombatant, tokenForActor } from "../runtime-helpers.js";

export function combatTurnState(combat, combatant, canAct) {
  const isActive = Boolean(combat?.started && combatant);
  const isTurn = Boolean(isActive && combat.combatant?.id === combatant.id);
  return {
    combat,
    combatant,
    isActive,
    isTurn,
    canEndTurn: Boolean(canAct && isTurn)
  };
}

export function createHudActorContext({
  actor,
  token,
  getCombat,
  combatantId = null
}) {
  const actorToken = tokenForActor(token ?? actor.token, actor);
  const tokenDocument = actorToken?.document ?? actorToken;
  const getCombatState = () => {
    const combat = getCombat();
    const combatant = findCombatant(combat?.combatants, {
      actorId: actor.id,
      combatantId,
      tokenId: tokenDocument?.id,
      sceneId: tokenDocument?.parent?.id
    });
    return combatTurnState(combat, combatant, actor.isOwner);
  };
  return {
    actor,
    token: actorToken,
    actorUuid: actor.uuid,
    tokenUuid: tokenDocument?.uuid ?? null,
    getCombatState,
    isCurrentCombatant: combatant => {
      const { combat, combatant: current } = getCombatState();
      return Boolean(
        current &&
        combatant?.id === current.id &&
        (!combatant.parent || combatant.parent === combat)
      );
    }
  };
}
