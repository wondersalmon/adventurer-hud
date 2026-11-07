export const usableActivities = (
  adapter,
  item,
  activities = adapter.itemActivities(item)
) =>
  activities.filter(
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

export function itemPresentationAvailability(
  adapter,
  actor,
  item,
  activityId,
  { dimSpellsWithoutSlots, uses } = {}
) {
  const state = itemAvailability(adapter, actor, item, activityId);
  if (state.reason) return state;
  const shortage = dimSpellsWithoutSlots
    ? adapter.itemSpellSlotShortage?.(actor, item, activityId)
    : null;
  if (shortage) return { ...state, ...shortage, reason: "Quick.NoSpellSlots" };
  const resource =
    uses === undefined
      ? (adapter.itemResourceData?.(actor, item, activityId) ??
        adapter.itemUsesData?.(item, activityId))
      : uses;
  return resource?.value === 0
    ? { ...state, reason: "Quick.NoCharges" }
    : state;
}

/** @param {import('../../../types/hud.js').Translate} t
 * @param {{reason?: string | null, minimumLevel?: number | null}} state */
export function itemAvailabilityLabel(t, { reason, minimumLevel }) {
  if (reason === "Quick.NoSpellSlots" && minimumLevel)
    return t("Quick.NeedsSpellSlotLevel").replace(
      "{level}",
      String(minimumLevel)
    );
  return reason ? t(reason) : "";
}
