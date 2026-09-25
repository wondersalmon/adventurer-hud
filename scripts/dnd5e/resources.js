import { itemUsesData } from "./items.js";
const resourceData = (actor, { item = null, resourceId = null } = {}) => {
  const actorResource = resourceId
    ? actor.system.resources?.[resourceId]
    : null;
  const uses = item?.system?.uses ?? actorResource ?? {};
  const max = Number(uses.max ?? 0);
  const current = ![undefined, null, ""].includes(uses.value)
    ? Number(uses.value) || 0
    : Math.max(0, max - Number(uses.spent ?? 0));

  return { actorResource, current, max };
};

export const dnd5eResources = {
  spellSlotKind: pool => (pool === "pact" ? "pact" : "standard"),
  actorResources(actor) {
    return Object.entries(actor.system.resources ?? {})
      .map(([id, resource]) => ({
        id,
        label: resource?.label || id,
        value: Number(resource?.value ?? 0),
        max: Number(resource?.max ?? 0),
        itemId: null
      }))
      .filter(resource => resource.max > 0 || resource.value > 0);
  },
  featureResources(actor) {
    return actor.items
      .filter(item => item.type === "feat")
      .map(item => {
        const uses = itemUsesData(item);
        return uses
          ? {
              id: item.id,
              label: item.name,
              ...uses,
              itemId: item.id
            }
          : null;
      })
      .filter(Boolean);
  },
  resourceData,
  async updateResource(actor, { item, resourceId, value, max }) {
    const sourceUses = item?._source?.system?.uses ?? {};
    if (item && Object.hasOwn(sourceUses, "spent")) {
      return item.update({
        "system.uses.spent": Math.max(0, max - value)
      });
    }
    if (item) return item.update({ "system.uses.value": value });
    if (resourceId) {
      return actor.update({ [`system.resources.${resourceId}.value`]: value });
    }
    return null;
  },
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
  },
  updateSpellSlots(actor, { pool, value }) {
    if (!/^(?:spell[1-9]|pact)$/.test(pool)) return;
    const slots = actor.system.spells?.[pool];
    const max = Number(slots?.max ?? 0);
    if (!Number.isFinite(max) || max <= 0) return;
    const next = Math.min(max, Math.max(0, Math.trunc(Number(value))));
    if (!Number.isFinite(next) || next === Number(slots.value ?? 0)) return;
    return actor.update({ [`system.spells.${pool}.value`]: next });
  }
};
