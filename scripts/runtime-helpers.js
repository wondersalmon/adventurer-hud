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
  { actorId = null, tokenId = null } = {}
) {
  const entries = combatants?.contents ?? [
    ...(combatants?.values?.() ?? combatants ?? [])
  ];

  return (
    entries.find(combatant => tokenId && combatant.tokenId === tokenId) ??
    entries.find(combatant => actorId && combatant.actorId === actorId) ??
    null
  );
}

export function calculateResourceValue({ amount, current, direction, max }) {
  const currentValue = Math.max(0, Number(current) || 0);
  const maximum = Math.max(0, Number(max) || 0);
  const requested = Math.max(1, Number(amount) || 1);

  if (direction === "restore") {
    if (maximum <= 0) {
      return null;
    }

    return Math.min(maximum, currentValue + requested);
  }

  if (direction === "restoreAll") {
    return maximum > 0 ? maximum : null;
  }

  return Math.max(0, currentValue - requested);
}
