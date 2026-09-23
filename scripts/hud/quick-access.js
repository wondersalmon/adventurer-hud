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

export const favoriteEntriesForActor = (stored, actorUuid) =>
  Array.isArray(stored?.[actorUuid]) ? stored[actorUuid] : [];

export const isFavorite = (entries, itemId, activityId = null) =>
  entries.some(
    entry => entry.itemId === itemId && entry.activityId === activityId
  );

export function toggleFavorite(entries, itemId, activityId = null) {
  if (isFavorite(entries, itemId, activityId)) {
    return entries.filter(
      entry => entry.itemId !== itemId || entry.activityId !== activityId
    );
  }
  return [...entries, { itemId, activityId }];
}
