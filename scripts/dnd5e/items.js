export function itemActivities(item) {
  const activities = item.system?.activities;
  return typeof activities?.values === "function"
    ? [...activities.values()]
    : Object.values(activities ?? {});
}

export function itemActivation(item) {
  return (
    item.system?.activation?.type ??
    itemActivities(item).find(activity => activity?.activation?.type)
      ?.activation?.type ??
    ""
  );
}

export function itemRangeData(item) {
  const activityRange = itemActivities(item).find(
    activity => activity?.range
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

export function damagePartFormula(part) {
  if (Array.isArray(part)) return part[0] ?? "";
  if (part?.formula) return part.formula;

  const number = Number(part?.number ?? 0);
  const denomination = Number(part?.denomination ?? 0);
  const bonus = String(part?.bonus ?? "").trim();

  if (!number || !denomination) return bonus;
  return `${number}d${denomination}${bonus ? ` + ${bonus}` : ""}`;
}
