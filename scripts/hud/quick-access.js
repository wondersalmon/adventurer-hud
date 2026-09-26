export const usableActivities = (adapter, item) =>
  adapter
    .itemActivities(item)
    .filter(
      activity =>
        activity?.id &&
        activity.canUse !== false &&
        typeof activity.use === "function"
    );

export function matchesItemSearch(adapter, item, query) {
  const needle = String(query ?? "")
    .trim()
    .toLocaleLowerCase();
  if (!needle) return true;
  if (
    String(item.name ?? "")
      .toLocaleLowerCase()
      .includes(needle)
  )
    return true;
  return adapter.itemActivities(item).some(activity =>
    String(activity?.name ?? "")
      .toLocaleLowerCase()
      .includes(needle)
  );
}

export const isFavorite = (entries, itemId, activityId = null) =>
  entries.some(
    entry =>
      entry.itemId === itemId && (entry.activityId ?? null) === activityId
  );

export function itemAvailability(adapter, actor, item, activityId = null) {
  if (actor.isOwner === false)
    return { blocked: true, reason: "Quick.NoPermission" };
  return (
    adapter.itemUseState?.(item, activityId) ?? {
      blocked: false,
      reason: adapter.itemUsesData(item)?.value === 0 ? "Quick.NoCharges" : null
    }
  );
}
