import { createTaskQueue } from "../task-queue.js";
import { itemActivities } from "./items.js";

const queues = new WeakMap();
export function queueFavoriteChange(actor, task) {
  if (!queues.has(actor)) queues.set(actor, createTaskQueue());
  return queues.get(actor)(task);
}

const ordered = actor =>
  [...(actor.system.favorites ?? [])].sort(
    (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
  );

function favoriteEntry(actor, favorite) {
  if (
    !["item", "activity"].includes(favorite.type) ||
    typeof favorite.id !== "string"
  )
    return null;
  const id = favorite.id.startsWith(actor.uuid + ".")
    ? favorite.id.slice(actor.uuid.length)
    : favorite.id;
  const match = /^\.Item\.([^.]+)(?:\.Activity\.([^.]+))?$/.exec(id);
  if (!match || (favorite.type === "activity") !== Boolean(match[2]))
    return null;
  return { itemId: match[1], activityId: match[2] ?? null };
}

export function favoriteEntries(actor) {
  return ordered(actor)
    .map(f => favoriteEntry(actor, f))
    .filter(Boolean);
}

function findFavorite(actor, itemId, activityId) {
  return (actor.system.favorites ?? []).find(favorite => {
    const entry = favoriteEntry(actor, favorite);
    return entry?.itemId === itemId && entry.activityId === activityId;
  });
}

export function nativeFavorite(actor, itemId, activityId = null) {
  const item = actor.items.get(itemId);
  if (!item) return null;
  if (
    activityId &&
    !itemActivities(item).some(activity => activity.id === activityId)
  )
    return null;
  const id = foundry.utils.buildRelativeUuid(item, actor);
  return {
    type: activityId ? "activity" : "item",
    id: activityId ? `${id}.Activity.${activityId}` : id
  };
}

export async function toggleFavorite(actor, itemId, activityId = null) {
  if (!actor.isOwner) return;
  const existing = findFavorite(actor, itemId, activityId);
  if (existing) return actor.system.removeFavorite(existing.id);
  const favorite = nativeFavorite(actor, itemId, activityId);
  if (!favorite) return;
  await actor.system.addFavorite(favorite);
}
