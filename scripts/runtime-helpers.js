export function actorContextChanged(current, next) {
  return (
    (current?.actorUuid ?? null) !== (next?.actorUuid ?? null) ||
    (current?.tokenUuid ?? null) !== (next?.tokenUuid ?? null)
  );
}

export function tokenForActor(token, actor) {
  return token?.actor?.uuid === actor?.uuid ? token : null;
}

export function getCurrentCombat(gameState) {
  return (
    gameState.combat ??
    gameState.combats?.viewed ??
    gameState.combats?.active ??
    null
  );
}

export function findCombatant(
  combatants,
  { actorId = null, tokenId = null, sceneId = null, combatantId = null } = {}
) {
  const entries = combatants?.contents ?? [
    ...(combatants?.values?.() ?? combatants ?? [])
  ];
  if (combatantId)
    return (
      entries.find(
        combatant =>
          combatant.id === combatantId &&
          (!tokenId || combatant.tokenId === tokenId) &&
          (!sceneId || combatant.sceneId === sceneId)
      ) ?? null
    );

  if (tokenId) {
    return (
      entries.find(
        combatant =>
          combatant.tokenId === tokenId &&
          (!sceneId || combatant.sceneId === sceneId)
      ) ?? null
    );
  }
  return (
    entries.find(combatant => actorId && combatant.actorId === actorId) ?? null
  );
}
