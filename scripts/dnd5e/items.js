export function itemActivities(item) {
  const activities = item.system?.activities;
  return typeof activities?.values === "function"
    ? [...activities.values()]
    : Object.values(activities ?? {});
}

export function itemActivation(item, activityId = null) {
  const selected = activityId
    ? itemActivities(item).find(activity => activity.id === activityId)
    : null;
  if (selected)
    return selected.activation?.type ?? item.system?.activation?.type ?? "";
  return (
    selected?.activation?.type ??
    item.system?.activation?.type ??
    itemActivities(item).find(activity => activity?.activation?.type)
      ?.activation?.type ??
    ""
  );
}

export function itemRangeData(item, activityId = null) {
  const activityRange = itemActivities(item).find(
    activity => activity?.range && (!activityId || activity.id === activityId)
  )?.range;
  const range = activityRange ?? item.system?.range ?? {};

  return {
    value: range.value?.value ?? range.value ?? "",
    long: range.long ?? range.value?.long ?? "",
    units: range.units ?? range.value?.units ?? "",
    special: range.special ?? ""
  };
}

export function hasItemProperty(item, property) {
  const properties = item.system?.properties;
  const activityHasProperty = itemActivities(item).some(activity =>
    property === "concentration"
      ? Boolean(activity?.duration?.concentration)
      : false
  );

  return [
    properties?.has?.(property),
    properties?.includes?.(property),
    properties?.[property],
    item.system?.components?.[property],
    property === "concentration" && item.system?.duration?.concentration,
    property === "ritual" && item.system?.preparation?.mode === "ritual",
    activityHasProperty
  ].some(Boolean);
}

export function isPreparedSpell(item) {
  const preparation = item.system?.preparation ?? {};
  return Boolean(
    Number(item.system?.level ?? 0) === 0 ||
    preparation.prepared ||
    ["always", "atwill", "innate", "pact"].includes(preparation.mode)
  );
}

const INVENTORY_TYPES = new Set([
  "backpack",
  "consumable",
  "container",
  "equipment",
  "loot",
  "tool",
  "weapon"
]);

export function inventoryCategory(item) {
  if (!INVENTORY_TYPES.has(item.type)) return null;
  if (item.system?.equipped) return "equipped";
  if (item.type === "consumable") return "consumables";
  return "other";
}

export function itemUsesData(item) {
  const uses = item.system?.uses ?? {};
  const max = Number(uses.max ?? 0);

  if (!Number.isFinite(max) || max <= 0) return null;

  const hasLegacyValue = ![undefined, null, ""].includes(uses.value);
  const value = hasLegacyValue
    ? Number(uses.value) || 0
    : Math.max(0, max - (Number(uses.spent) || 0));

  return {
    max,
    value: Math.min(max, Math.max(0, value))
  };
}

export function damagePartFormula(part) {
  if (Array.isArray(part)) return part[0] ?? "";
  if (part?.formula) return part.formula;

  const number = Number(part?.number ?? 0);
  const denomination = Number(part?.denomination ?? 0);
  const bonus = String(part?.bonus ?? "").trim();

  if (!number || !denomination) return bonus;
  return `${number}d${denomination}${bonus ? ` + ${bonus}` : ""}`;
}
