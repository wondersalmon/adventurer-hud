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
  if (selected) return selected.activation?.type ?? "";
  return (
    itemActivities(item).find(activity => activity?.activation?.type)
      ?.activation?.type ?? ""
  );
}

export function itemRangeData(item, activityId = null) {
  const activities = itemActivities(item);
  const activityRange = activityId
    ? activities.find(activity => activity?.range && activity.id === activityId)
        ?.range
    : null;
  const itemRange = item.system?.range;
  const defaultRange = [
    itemRange?.value,
    itemRange?.long,
    itemRange?.special
  ].some(value => value !== undefined && value !== null && value !== "")
    ? itemRange
    : null;
  const range = activityId
    ? item.type === "weapon" && !activityRange?.override
      ? (defaultRange ?? activityRange ?? {})
      : (activityRange ?? defaultRange ?? {})
    : (defaultRange ??
      activities.find(activity => activity?.range)?.range ??
      {});

  return {
    value: range.value ?? "",
    long: range.long ?? "",
    units: range.units ?? "",
    special: range.special ?? ""
  };
}

export const hasItemProperty = (item, property) =>
  item.system.properties?.has(property) ?? false;

export const isPreparedSpell = item =>
  !item.system.canPrepare ||
  item.system.level === 0 ||
  item.system.prepared > 0;

export function spellPreparation(item) {
  return {
    canPrepare:
      item.type === "spell" &&
      item.system.level > 0 &&
      item.system.canPrepare &&
      item.system.prepared !== CONFIG.DND5E.spellPreparationStates.always.value,
    prepared: item.system.prepared > 0
  };
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

export function itemUsesData(item, activityId = null) {
  const activity = activityId
    ? itemActivities(item).find(a => a.id === activityId)
    : null;
  const uses =
    activity?.uses?.max > 0 ? activity.uses : (item.system?.uses ?? {});
  const max = Number(uses.max ?? 0);

  if (!Number.isFinite(max) || max <= 0) return null;

  return { max, value: Number(uses.value ?? 0) };
}

export function itemUseState(item, activityId = null) {
  const activities = itemActivities(item);
  const selected = activityId
    ? activities.find(activity => activity.id === activityId)
    : null;
  if (activityId && !selected)
    return { blocked: true, reason: "Quick.ActivityMissing" };
  if (item.canUse === false)
    return { blocked: true, reason: "Quick.ItemUnavailable" };
  if (
    selected &&
    (selected.canUse === false || typeof selected.use !== "function")
  ) {
    return { blocked: true, reason: "Quick.ActivityUnavailable" };
  }
  if (
    !activityId &&
    activities.length &&
    !activities.some(
      activity =>
        activity.canUse !== false && typeof activity.use === "function"
    )
  ) {
    return { blocked: true, reason: "Quick.NoAvailableActivities" };
  }
  // Native usage can offer consumption overrides or activities with separate costs.
  return {
    blocked: false,
    reason:
      itemUsesData(item, activityId)?.value === 0 ? "Quick.NoCharges" : null
  };
}
