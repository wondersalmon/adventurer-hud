/** Read native effects once, for both player status icons and companion rows. */
export function activeEffectSummaries(actor, definitions = []) {
  if (!actor) return [];
  const configured = new Map(definitions.map(status => [status.id, status]));
  const statuses = new Map(
    [...(actor.statuses ?? [])].map(id => [
      id,
      configured.get(id) ?? { id, name: id }
    ])
  );
  const effects = new Map();
  for (const effect of typeof actor.allApplicableEffects === "function"
    ? actor.allApplicableEffects()
    : (actor.effects ?? [])) {
    if (effect.disabled || effect.isSuppressed) continue;
    const ids = [...(effect.statuses ?? [])];
    if (!ids.length) {
      const key = effect.uuid ?? effect.id ?? effect;
      effects.set(key, {
        id: `effect:${effect.uuid ?? effect.id}`,
        name: effect.name,
        img: effect.img ?? effect.icon,
        uuid: effect.uuid
      });
    }
    for (const id of ids) {
      const status = configured.get(id) ?? {};
      statuses.set(id, {
        ...status,
        id,
        name: status.name ?? status.label ?? effect.name,
        img: status.img ?? status.icon ?? effect.img ?? effect.icon,
        uuid: effect.uuid
      });
    }
  }
  return [...statuses.values(), ...effects.values()];
}
