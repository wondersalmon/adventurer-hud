export const dnd5eResources = {
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
