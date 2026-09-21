export function proficiencyMultiplier(value) {
  return (
    Number(
      value?.multiplier ??
        value?.value ??
        value?.prof?.multiplier ??
        value?.prof?.value ??
        value?.prof ??
        value ??
        0
    ) || 0
  );
}

export function proficiencyBonus(proficiency) {
  const term = proficiency?.term;

  if (
    term === null ||
    term === undefined ||
    term === "" ||
    !Number.isFinite(Number(term))
  ) {
    return 0;
  }

  return Number(proficiency.flat ?? term) || 0;
}

export function abilityTotal(data = {}, type) {
  const preparedValue = data[type]?.value;
  const prepared = Number(preparedValue);

  if (
    preparedValue !== null &&
    preparedValue !== undefined &&
    preparedValue !== "" &&
    Number.isFinite(prepared)
  ) {
    return prepared;
  }

  const legacyBonus = Number(data[`${type}Bonus`] ?? 0) || 0;
  return (
    (Number(data.mod) || 0) +
    legacyBonus +
    proficiencyBonus(data[`${type}Prof`])
  );
}

export function actorDeathData(actor) {
  return {
    failure: Number(actor.system.attributes.death?.failure ?? 0),
    hp: Number(actor.system.attributes.hp?.value ?? 0),
    success: Number(actor.system.attributes.death?.success ?? 0)
  };
}
