function spellSlotPoolData(actor, pool) {
  if (!/^(spell[1-9]|pact)$/.test(pool)) return null;
  const slots = actor.system?.spells?.[pool];
  return slots
    ? { value: Number(slots.value ?? 0), max: Number(slots.max) }
    : null;
}

export const dnd5eResources = {
  spellSlotPoolData,
  setSpellSlotValue(actor, pool, value) {
    if (!actor?.isOwner || !/^(spell[1-9]|pact)$/.test(pool)) return;
    const slots = spellSlotPoolData(actor, pool);
    const max = Number(slots?.max);
    if (
      !Number.isInteger(value) ||
      !Number.isFinite(max) ||
      max <= 0 ||
      value < 0 ||
      value > max
    )
      return;
    return actor.update({ ["system.spells." + pool + ".value"]: value });
  },
  spellSlotKind: pool => (pool === "pact" ? "pact" : "standard"),
  spellSlots(actor, level) {
    const standard = actor.system.spells?.[`spell${level}`] ?? {};
    const pact = actor.system.spells?.pact ?? {};
    const pools = [];
    if (Number(standard.max ?? 0) > 0) {
      pools.push([
        Number(standard.value ?? 0),
        Number(standard.max),
        `spell${level}`
      ]);
    }
    if (Number(pact.level) === level && Number(pact.max ?? 0) > 0) {
      pools.push([Number(pact.value ?? 0), Number(pact.max), "pact"]);
    }
    return pools;
  }
};
