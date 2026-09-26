import { parseHTML } from "linkedom";
import { createItemPanelRenderer } from "../../scripts/hud/item-panels.js";
import { createHudComponents } from "../../scripts/hud/components.js";

export const escapeHTML = value =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export const fragment = html => {
  const { document } = parseHTML("<html><body></body></html>");
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
};

export function itemCollection(items = []) {
  const collection = new Map(items.map(item => [item.id, item]));
  collection.filter = predicate => [...collection.values()].filter(predicate);
  collection.find = predicate => [...collection.values()].find(predicate);
  return collection;
}

export function itemRendererFixture({
  items = [],
  adapter = {},
  hudState = {},
  visibility = {},
  ...options
} = {}) {
  const state = {
    favoriteEntries: [],
    searchQuery: "",
    combatCategory: null,
    actionMenuOpen: false,
    ...hudState
  };
  const flags = { ...visibility };
  const methods = {
    combatItems: () => [],
    itemActivities: () => [],
    itemRole: () => "other",
    hasItemProperty: () => false,
    itemActivation: () => "",
    itemUsesData: () => null,
    ...adapter
  };
  const renderer = createItemPanelRenderer({
    spellFilterHTML: createHudComponents({ hudState: state, t: key => key })
      .spellFilterHTML,
    actor: { items: itemCollection(items) },
    escapeHTML,
    t: key => key,
    tf: key => key,
    ...options,
    adapter: methods,
    hudState: state,
    visibility: flags
  });
  return { renderer, hudState: state, visibility: flags, adapter: methods };
}
