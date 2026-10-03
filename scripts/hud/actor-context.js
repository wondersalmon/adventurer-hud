import {
  findCombatant,
  tokenForActor,
  ownerTokenForActor
} from "../runtime-helpers.js";

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

/** @param {{actor: any, token?: any, getCombat: () => any, combatantId?: string | null, requireToken?: boolean, ownerTokenUuid?: string | null}} options */
export function createHudActorContext({
  actor,
  token,
  getCombat,
  combatantId = null,
  requireToken = false,
  ownerTokenUuid = null
}) {
  const actorToken = tokenForActor(token ?? actor.token, actor);
  const tokenDocument = actorToken?.document ?? actorToken;
  const ownerToken = ownerTokenForActor(token ?? actor.token, actor);
  const ownerDocument = ownerToken?.document ?? ownerToken;
  const getCombatState = () => {
    const combat = getCombat();
    const combatant =
      (requireToken && !tokenDocument) || (ownerTokenUuid && !ownerDocument)
        ? null
        : findCombatant(combat?.combatants, {
            actorId: actor.id,
            combatantId,
            tokenId: ownerDocument?.id,
            sceneId: ownerDocument?.parent?.id
          });
    return combatTurnState(combat, combatant, actor.isOwner);
  };
  return {
    actor,
    token: actorToken,
    actorUuid: actor.uuid,
    tokenUuid: tokenDocument?.uuid ?? null,
    ownerTokenUuid: ownerDocument?.uuid ?? ownerTokenUuid,
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
