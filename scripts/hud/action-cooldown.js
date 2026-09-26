export const ACTION_COOLDOWN_MS = 666;

export function createActionCooldown({
  duration = ACTION_COOLDOWN_MS,
  now = () => performance.now()
} = {}) {
  let nextAllowed = -Infinity;
  return () => {
    const time = now();
    if (time < nextAllowed) return false;
    nextAllowed = time + duration;
    return true;
  };
}

const actorCooldowns = new WeakMap();

export function actorActionCooldown(actor) {
  if (!actorCooldowns.has(actor)) {
    actorCooldowns.set(actor, createActionCooldown());
  }
  return actorCooldowns.get(actor);
}
