// @ts-check
// Personal HUD preferences only; native Item/Activity sort and visibility stay intact.
/** @param {unknown} value @returns {import('../../../types/hud.js').ItemLayouts} */
export function normalizeItemLayouts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(/** @type {Record<string, unknown>} */ (value))
      .slice(0, 100)
      .flatMap(([scope, entry]) => {
        if (
          scope.length > 128 ||
          ["__proto__", "constructor", "prototype"].includes(scope) ||
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry)
        )
          return [];
        /** @param {unknown} values @returns {string[]} */
        const keys = values => [
          ...new Set(
            Array.isArray(values)
              ? values
                  .filter(key => typeof key === "string" && key.length <= 256)
                  .slice(0, 1000)
              : []
          )
        ];
        const record = /** @type {Record<string, unknown>} */ (entry);
        return [
          [scope, { order: keys(record.order), hidden: keys(record.hidden) }]
        ];
      })
  );
}

/** @param {{id: string}} item @param {string | null} activityId */
export const itemLayoutKey = (item, activityId = null) =>
  JSON.stringify([item.id, activityId]);

/** @param {{entries: import('../../../types/hud.js').ItemLayoutEntry[], scope: string, hudState: import('../../../types/hud.js').HudState, escapeHTML: (value: string) => string, t: (key: string) => string}} options */
export function renderItemLayout({ entries, scope, hudState, escapeHTML, t }) {
  const unique = [
    ...new Map(entries.map(entry => [entry.key, entry])).values()
  ];
  const preference = hudState.itemLayouts?.[scope] ?? { order: [], hidden: [] };
  const ranks = new Map(preference.order.map((key, index) => [key, index]));
  const ordered = unique.sort(
    (a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity)
  );
  const editing = hudState.hudEditing;
  const hidden = ordered.filter(entry => preference.hidden.includes(entry.key));
  const visible = ordered.filter(
    entry => !preference.hidden.includes(entry.key)
  );
  /** @param {string} action @param {import('../../../types/hud.js').ItemLayoutEntry} entry @param {string} label @param {string} icon @param {boolean} disabled */
  const control = (action, entry, label, icon, disabled = false) =>
    `<button type="button" class="ws-button" data-action="${action}" data-layout-key="${escapeHTML(entry.key)}" aria-label="${escapeHTML(`${t(label)}: ${entry.name}`)}" title="${t(label)}" ${disabled ? "disabled" : ""}><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
  // Outside editing, use the card root as the list entry instead of another box.
  // All entries are module-rendered HTML; retain a wrapper for other root shapes.
  /** @param {import('../../../types/hud.js').ItemLayoutEntry} entry */
  const entryMarkup = entry => {
    const rootClass = /^(\s*<[a-z][\w-]*\s[^>]*?\bclass=")([^"]*)"/i;
    if (!rootClass.test(entry.html))
      return `<div class="ws-organized-entry" data-layout-key="${escapeHTML(entry.key)}">${entry.html}</div>`;
    return entry.html.replace(
      rootClass,
      (_, opening, classes) =>
        `${opening}${classes} ws-organized-entry" data-layout-key="${escapeHTML(entry.key)}"`
    );
  };
  return `<section class="ws-item-organization ${editing ? "ws-items-editing" : visible.length > 50 ? "ws-items-long" : ""}" data-layout-scope="${escapeHTML(scope)}">
    <div class="ws-combat-item-grid">${visible
      .map((entry, index) =>
        editing
          ? `<div class="ws-organized-entry" data-layout-key="${escapeHTML(entry.key)}">
      ${editing ? `<div class="ws-item-layout-controls"><button type="button" class="ws-button ws-item-drag" draggable="true" data-layout-key="${escapeHTML(entry.key)}" aria-label="${escapeHTML(`${t("ItemLayout.Drag")}: ${entry.name}`)}" title="${t("ItemLayout.Drag")}"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></button>${control("moveitemup", entry, "ItemLayout.Up", "fa-arrow-up", index === 0)}${control("moveitemdown", entry, "ItemLayout.Down", "fa-arrow-down", index === visible.length - 1)}${control("toggleitemhidden", entry, preference.hidden.includes(entry.key) ? "ItemLayout.Show" : "ItemLayout.Hide", preference.hidden.includes(entry.key) ? "fa-eye" : "fa-eye-slash")}</div>` : ""}
      ${entry.html}</div>`
          : entryMarkup(entry)
      )
      .join("")}</div>
    ${editing && hidden.length ? `<div class="ws-item-layout-hidden"><button type="button" class="ws-button" data-action="togglehiddenitems" aria-expanded="${hudState.itemHiddenExpanded === scope}"><span>${t("ItemLayout.Hidden")} · ${hidden.length}</span><i class="fa-solid fa-chevron-${hudState.itemHiddenExpanded === scope ? "up" : "down"}" aria-hidden="true"></i></button>${hudState.itemHiddenExpanded === scope ? hidden.map(entry => `<div class="ws-item-layout-restore"><span>${escapeHTML(entry.name)}</span>${control("toggleitemhidden", entry, "ItemLayout.Show", "fa-eye")}</div>`).join("") : ""}</div>` : ""}
  </section>`;
}

/** @param {import('../../../types/hud.js').HudState} hudState @param {string} scope @param {string} key @param {string} target @param {string[]} keys */
export function moveItemLayout(hudState, scope, key, target, keys) {
  if (key === target || !keys.includes(key) || !keys.includes(target))
    return false;
  const preference = hudState.itemLayouts[scope] ?? { order: [], hidden: [] };
  const order = [...new Set([...preference.order, ...keys])];
  const from = order.indexOf(key),
    to = order.indexOf(target);
  order.splice(from, 1);
  order.splice(to, 0, key);
  hudState.itemLayouts[scope] = { ...preference, order };
  return true;
}

/** Only a complete native inventory can establish that a saved key was deleted.
 * @param {import('../../../types/hud.js').HudState} hudState
 * @param {Iterable<{id: string, activityIds: string[]}>} items
 */
export function pruneItemLayouts(hudState, items) {
  const known = new Set(
    [...items].flatMap(item => [
      itemLayoutKey(item),
      ...item.activityIds.map(id => itemLayoutKey(item, id))
    ])
  );
  let changed = false;
  for (const [scope, preference] of Object.entries(hudState.itemLayouts)) {
    const order = preference.order.filter(key => known.has(key));
    const hidden = preference.hidden.filter(key => known.has(key));
    if (
      order.length === preference.order.length &&
      hidden.length === preference.hidden.length
    )
      continue;
    changed = true;
    if (!order.length && !hidden.length) delete hudState.itemLayouts[scope];
    else hudState.itemLayouts[scope] = { order, hidden };
  }
  return changed;
}
