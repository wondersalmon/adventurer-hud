import assert from "node:assert/strict";
import test from "node:test";

import { createHudActions } from "../scripts/hud/actions.js";
import { createCombatItemRenderer } from "../scripts/hud/combat-items.js";
import {
  favoriteEntriesForActor,
  matchesItemSearch,
  toggleFavorite,
  usableActivities
} from "../scripts/hud/quick-access.js";
import { dnd5eAdapter } from "../scripts/systems/dnd5e.js";

const escapeHTML = value =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

test("search matches item and activity names while favorites stay actor scoped", () => {
  const activities = [
    { id: "attack", name: "Fire Bolt", use() {} },
    { id: "save", name: "Flame Burst", canUse: false, use() {} }
  ];
  const item = { name: "Ember Staff", system: { activities } };
  const adapter = { itemActivities: () => activities };

  assert.equal(matchesItemSearch(adapter, item, "ember"), true);
  assert.equal(matchesItemSearch(adapter, item, "fire bolt"), true);
  assert.equal(matchesItemSearch(adapter, item, "ice"), false);
  assert.deepEqual(
    usableActivities(adapter, item).map(activity => activity.id),
    ["attack"]
  );

  const first = toggleFavorite([], "item-1", "attack");
  assert.deepEqual(first, [{ itemId: "item-1", activityId: "attack" }]);
  assert.deepEqual(toggleFavorite(first, "item-1", "attack"), []);
  assert.deepEqual(
    favoriteEntriesForActor({ "Actor.one": first }, "Actor.two"),
    []
  );
});

test("multi-activity cards show a chooser and activity favorites", () => {
  const activities = [
    { id: "attack", name: "Attack", use() {} },
    { id: "save", name: "Save", use() {} }
  ];
  const item = { id: "staff", name: "Staff", img: "staff.webp" };
  const hudState = {
    favoriteEntries: [{ itemId: "staff", activityId: "attack" }],
    favoritesExpanded: true,
    openActivityItemId: "staff",
    searchQuery: "staff"
  };
  const renderer = createCombatItemRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => activities,
      itemRole: () => "other",
      hasItemProperty: () => false,
      itemActivation: () => "",
      itemResourceCost: () => "",
      itemUsesData: () => null,
      inventoryCategory: () => "other"
    },
    escapeHTML,
    hudState,
    t: key => key,
    tf: key => key,
    visibility: { activityPicker: true, favorites: true, search: true }
  });

  const html = renderer.combatItemButton(item);
  assert.match(html, /data-action="useactivity"/);
  assert.match(html, /data-activity-id="attack"/);
  assert.match(html, /ws-item-favorite ws-active/);
  assert.match(renderer.favoriteSection(), /Staff: Attack/);
  hudState.favoritesExpanded = false;
  assert.match(renderer.favoriteSection(), /aria-expanded="false"/);
  assert.doesNotMatch(renderer.favoriteSection(), /Staff: Attack/);
  assert.match(renderer.searchControl(), /value="staff"/);
});

test("combat filters hide empty categories in grouped and separate layouts", () => {
  const item = { id: "blade", name: "Blade" };
  const actor = { items: new Map([[item.id, item]]) };
  const hudState = {
    combatCategory: "spells",
    favoriteEntries: [],
    searchQuery: "",
    actionMenuOpen: false
  };
  const adapter = {
    combatItems: (_actor, category) => (category === "weapons" ? [item] : []),
    itemActivities: () => [],
    itemRole: () => "other",
    hasItemProperty: () => false,
    itemActivation: () => "",
    itemResourceCost: () => "",
    itemUsesData: () => null
  };
  const visibility = {
    combatWeapons: true,
    combatSpells: true,
    combatActions: true,
    groupActionTypes: true
  };
  const renderer = createCombatItemRenderer({
    actor,
    adapter,
    escapeHTML,
    hudState,
    t: key => key,
    visibility
  });
  const grouped = renderer.combatActions();
  assert.match(grouped, /data-category="weapons"/);
  assert.doesNotMatch(
    grouped,
    /data-category="spells"|data-action="toggleactionmenu"/
  );
  assert.equal(hudState.combatCategory, "weapons");
  visibility.groupActionTypes = false;
  assert.doesNotMatch(renderer.combatActions(), /data-category="spells"/);
});

test("grouped action menu keeps nonempty action types selectable", () => {
  const item = { id: "dash", name: "Dash" };
  const renderer = createCombatItemRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      combatItems: (_actor, category) => (category === "action" ? [item] : []),
      itemActivities: () => [],
      itemRole: () => "other",
      hasItemProperty: () => false,
      itemActivation: () => "action",
      itemResourceCost: () => "",
      itemUsesData: () => null,
      activationLabel: () => "Action"
    },
    escapeHTML,
    hudState: {
      combatCategory: "action",
      actionMenuOpen: true,
      searchQuery: "",
      favoriteEntries: []
    },
    t: key => key,
    visibility: {
      combatActions: true,
      combatBonusActions: true,
      groupActionTypes: true
    }
  });
  const html = renderer.combatActions();
  assert.match(html, /data-action="toggleactionmenu"/);
  assert.match(html, /data-category="action"/);
  assert.doesNotMatch(html, /data-category="bonus"/);
});

test("selected activity uses its native workflow with the original event", async () => {
  const calls = [];
  const activity = {
    id: "attack",
    name: "Attack",
    use: options => calls.push(options)
  };
  const item = {
    id: "staff",
    system: { activities: new Map([[activity.id, activity]]) }
  };
  const event = { altKey: true };
  const actions = createHudActions({
    actor: { items: new Map([[item.id, item]]) },
    adapter: dnd5eAdapter,
    canRollActor: true,
    rollAndClose: callback => callback()
  });

  await actions.useactivity(event, {
    dataset: { itemId: "staff", activityId: "attack" }
  });
  assert.deepEqual(calls, [{ event }]);
});

test("item action opens the inline chooser and favorite action saves the choice", async () => {
  const activities = [
    { id: "attack", name: "Attack", use() {} },
    { id: "save", name: "Save", use() {} }
  ];
  const item = { id: "staff" };
  const hudState = { favoriteEntries: [], openActivityItemId: null };
  const saves = [];
  let refreshes = 0;
  const actions = createHudActions({
    actor: { items: new Map([[item.id, item]]) },
    adapter: { itemActivities: () => activities },
    canRollActor: true,
    hudState,
    refreshHud: () => refreshes++,
    toggleFavoriteEntry: (...args) => saves.push(args),
    visibility: { activityPicker: true, favorites: true }
  });

  await actions.useitem({}, { dataset: { itemId: "staff" } });
  assert.equal(hudState.openActivityItemId, "staff");
  assert.equal(refreshes, 1);
  await actions.togglefavorite(
    {},
    {
      dataset: { itemId: "staff", activityId: "save" }
    }
  );
  assert.deepEqual(saves, [["staff", "save"]]);
});

test("Shift keeps native item use when the inline chooser is enabled", async () => {
  const item = { id: "staff" };
  const calls = [];
  const actions = createHudActions({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => [
        { id: "attack", use() {} },
        { id: "save", use() {} }
      ],
      useItem: (_item, options) => calls.push(options)
    },
    canRollActor: true,
    rollAndClose: callback => callback(),
    visibility: { activityPicker: true }
  });
  const event = { shiftKey: true };

  await actions.useitem(event, { dataset: { itemId: "staff" } });
  assert.deepEqual(calls, [{ event }]);
});

test("an item is available in every matching activity category", () => {
  assert.equal(dnd5eAdapter.capabilities.activityChoice, true);
  const item = {
    type: "feat",
    system: {
      activities: new Map([
        ["action", { activation: { type: "action" } }],
        ["bonus", { activation: { type: "bonus" } }]
      ])
    }
  };
  const actor = { items: [item] };

  assert.deepEqual(dnd5eAdapter.combatItems(actor, "action"), [item]);
  assert.deepEqual(dnd5eAdapter.combatItems(actor, "bonus"), [item]);
});
