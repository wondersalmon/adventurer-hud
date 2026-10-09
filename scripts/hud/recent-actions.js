// @ts-check
/** @typedef {{action: "useitem" | "useactivity" | "ability" | "skill" | "tool", itemId?: string, activityId?: string, key?: string, type?: string}} RecentAction */

// Tab-local history contains identifiers only, never documents or old roll options.
/** @type {WeakMap<object, Map<string, RecentAction[]>>} */
const histories = new WeakMap();
const LIMIT = 3;
const ACTOR_LIMIT = 30;

function history() {
  let entries = histories.get(game);
  if (!entries) histories.set(game, (entries = new Map()));
  return entries;
}

/** @param {any} actor Native Actor.
 * @param {RecentAction} entry */
export function rememberRecentAction(actor, entry) {
  if (!actor?.uuid) return;
  const entries = history();
  const key = JSON.stringify(entry);
  const next = [
    entry,
    ...(entries.get(actor.uuid) ?? []).filter(
      value => JSON.stringify(value) !== key
    )
  ].slice(0, LIMIT);
  entries.delete(actor.uuid);
  entries.set(actor.uuid, next);
  const oldest = entries.keys().next().value;
  if (entries.size > ACTOR_LIMIT && oldest) entries.delete(oldest);
}

/** @param {any} actor Native Actor.
 * @param {NonNullable<import('../../types/hud.js').HudActionsOptions['performRoll']>} performRoll
 * @param {RecentAction} entry
 * @param {() => any} callback Native roll/use result. */
export function performRecentRoll(actor, performRoll, entry, callback) {
  return performRoll(async () => {
    const result = await callback();
    if (result && (!Array.isArray(result) || result.length))
      rememberRecentAction(actor, entry);
    return result;
  });
}

/** @param {{actor: any, adapter: import('../../types/hud.js').HudAdapter, toolState: {tools?: {id: string, name: string, img?: string}[]}, t: import('../../types/hud.js').Translate, escapeHTML: (value: unknown) => string}} options */
export function renderRecentActions({
  actor,
  adapter,
  toolState,
  t,
  escapeHTML
}) {
  const entries = history().get(actor.uuid) ?? [];
  const buttons = entries
    .map(entry => {
      const { action, itemId, activityId, key, type } = entry;
      let label,
        img,
        icon = "fa-dice-d20",
        blocked = false;
      if (itemId) {
        const item = actor.items.get(itemId);
        if (!item) return "";
        const activity = activityId
          ? adapter.itemActivities(item).find(value => value.id === activityId)
          : null;
        if (activityId && !activity) return "";
        label = activity ? `${item.name}: ${activity.name}` : item.name;
        img = activity?.img ?? item.img;
        blocked = Boolean(
          adapter.itemUseState?.(item, activityId)?.blocked ||
          activity?.canUse === false
        );
      } else if (action === "ability") {
        if (!key || !Object.keys(adapter.abilityData(actor, key)).length)
          return "";
        label = `${adapter.abilityLabel(key)} — ${t(type === "save" ? "Recent.Save" : "Recent.Check")}`;
      } else if (action === "skill") {
        if (!key || !Object.keys(adapter.skillData(actor, key)).length)
          return "";
        const skill = adapter
          .skillDefinitions({ localize: value => game.i18n.localize(value) })
          .find(value => value[0] === key);
        label = skill?.[1] ?? key;
        icon = skill?.[2] ?? icon;
      } else {
        if (!key) return "";
        const tool = toolState.tools?.find(value => value.id === key);
        if (!tool) return "";
        label = tool.name;
        img = tool?.img;
      }
      const title = `${t("Recent.Repeat")}: ${label}${blocked ? ` — ${t("Recent.Unavailable")}` : ""}`;
      return `<button type="button" class="ws-button ws-recent-action" data-recent-action="true" ${Object.entries(
        entry
      )
        .map(
          ([name, value]) =>
            `data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${escapeHTML(value)}"`
        )
        .join(
          " "
        )} title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}" ${!actor.isOwner || blocked ? "disabled" : ""}>${img ? `<img src="${escapeHTML(img)}" alt="">` : `<i class="fa-solid ${escapeHTML(icon)}" aria-hidden="true"></i>`}</button>`;
    })
    .filter(Boolean)
    .join("");
  return `<div class="ws-footer-recent" role="group" aria-label="${escapeHTML(t("Recent.Title"))}">${buttons || `<span class="ws-recent-empty" title="${escapeHTML(t("Recent.Empty"))}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>${t("Recent.Title")}</span></span>`}</div>`;
}
