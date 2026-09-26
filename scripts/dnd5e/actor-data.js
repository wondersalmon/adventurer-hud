export const proficiencyMultiplier = value =>
  Number(value?.multiplier ?? value ?? 0) || 0;

export function abilityTotal(data = {}, type) {
  if (data[type]?.value !== undefined) return Number(data[type].value);
  // D&D 5.3 prepares check components separately; D&D 6 also provides check.value.
  if (type === "check") {
    const proficiency = data.checkProf;
    const flat = Number.isFinite(Number(proficiency?.term))
      ? Number(proficiency.flat)
      : 0;
    return Number(data.mod ?? 0) + Number(data.checkBonus ?? 0) + flat;
  }
  return 0;
}

export function actorDeathData(actor) {
  const failure = Number(actor.system.attributes.death?.failure ?? 0);
  const success = Number(actor.system.attributes.death?.success ?? 0);
  return {
    failure,
    hp: Number(actor.system.attributes.hp?.value ?? 0),
    success,
    dead: failure >= 3 || Boolean(actor.statuses?.has?.("dead")),
    stable: Boolean(actor.statuses?.has?.("stable"))
  };
}
