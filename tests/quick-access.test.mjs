import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { escapeHTML, itemRendererFixture } from "./helpers/rendering.mjs";

import { createHudActions } from "../scripts/hud/actions.js";
import { createItemPanelRenderer } from "../scripts/hud/items/item-panels.js";
import { createHudComponents } from "../scripts/hud/components.js";
import {
  matchesItemSearch,
  usableActivities
} from "../scripts/hud/items/quick-access.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";

restoreGlobalsAfterEach();
beforeEach(() => {
  globalThis.CONFIG = {
    DND5E: {
      spellPreparationStates: {
        unprepared: { value: 0 },
        prepared: { value: 1 },
        always: { value: 2 }
      }
    }
  };
});

test("search matches item and activity names", () => {
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
});

test("features follow Actions and activate through the existing item cards", () => {
  const feature = { id: "flurry", name: "Flurry of Blows" };
  let available = [feature];
  const { renderer, hudState } = itemRendererFixture({
    items: [feature],
    adapter: {
      itemActivities: () => [{ activation: { type: "bonus" } }],
      combatItems: (_actor, category) =>
        category === "features"
          ? available
          : category === "action"
            ? [feature]
            : []
    },
    visibility: { showActionTypes: true, search: true }
  });
  const closed = renderer.combatActions();
  assert.ok(
    closed.indexOf('data-category="action"') <
      closed.indexOf('data-category="features"')
  );
  hudState.combatCategory = "features";
  const html = renderer.combatActions();
  assert.match(html, /data-action="useitem"\s+data-item-id="flurry"/);
  assert.match(html, /Flurry of Blows/);
  assert.doesNotMatch(html, /openresource|changeresource/);
  hudState.searchQuery = "missing";
  assert.match(renderer.combatActions(), /Flurry of Blows/);
  assert.match(renderer.globalSearchPanel(), /Quick.NoResults/);
  available = [];
  renderer.combatActions();
  assert.equal(hudState.combatCategory, null);
});

test("search sorting evaluates availability once per matched item and stays fresh", () => {
  let calls = 0;
  let emptyId = "first";
  const first = { id: "first", name: "First" };
  const second = { id: "second", name: "Second" };
  const third = { id: "third", name: "Third" };
  const { renderer } = itemRendererFixture({
    adapter: {
      itemUseState: item => {
        calls++;
        return { reason: item.id === emptyId ? "Quick.NoCharges" : null };
      }
    }
  });
  const items = [first, second, third];
  assert.deepEqual(renderer.sortItems(items), [second, third, first]);
  assert.equal(calls, 3);
  emptyId = "second";
  assert.deepEqual(renderer.sortItems(items), [first, third, second]);
  assert.equal(calls, 6);
  assert.deepEqual(items, [first, second, third]);
});

test("spell cards share a lazy usage index only within their current render", () => {
  let builds = 0;
  const usedIndexes = [];
  const spells = [
    { id: "one", type: "spell" },
    { id: "two", type: "spell" }
  ];
  const { renderer } = itemRendererFixture({
    adapter: {
      itemUsageTargets: () => {
        builds++;
        return new Map();
      },
      itemUsageTarget: (_actor, item, index) => {
        usedIndexes.push(index);
        return { item, activityId: null };
      }
    }
  });
  const render = () =>
    spells.map(item => renderer.combatItemButton(item)).join("");
  renderer.withUsageTargets(() => "No spell cards");
  assert.equal(builds, 0);
  renderer.withUsageTargets(render);
  assert.equal(builds, 1);
  assert.equal(usedIndexes[0], usedIndexes[1]);
  renderer.withUsageTargets(render);
  assert.equal(builds, 2);
  assert.notEqual(usedIndexes[0], usedIndexes[2]);
  renderer.combatItemButton(spells[0]);
  assert.equal(usedIndexes.at(-1), null);
});

test("combat skills follow features, reuse skill cards, and disappear when disabled", () => {
  const skills = [
    ["ath", "Athletics", "fa-person-running"],
    ["ste", "Stealth", "fa-user-ninja"],
    ["arc", "Arcana", "fa-book"]
  ];
  const skillState = { proficientSkillsOnly: false };
  const { skillsHTML, skillFilterHTML } = createHudComponents({
    actor: {},
    adapter: { skillData: () => ({ total: 7 }) },
    canRollActor: false,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState: skillState,
    marker: () => ["", "", ""],
    skillProf: key => ({ ath: 1, ste: 2, arc: 0.5 })[key],
    skills,
    visibility: { itemDetails: true },
    t: key => key
  });
  const { renderer, hudState, visibility } = itemRendererFixture({
    skills,
    skillsHTML,
    skillFilterHTML,
    adapter: {
      combatItems: (_actor, category) =>
        category === "features" ? [{ id: "feat" }] : []
    },
    visibility: { combatSkills: true, search: true }
  });
  const closed = renderer.combatActions();
  assert.ok(
    closed.indexOf('data-category="features"') <
      closed.indexOf('data-category="skills"')
  );
  hudState.combatCategory = "skills";
  const html = renderer.combatActions();
  assert.match(html, /ws-combat-item-grid/);
  assert.match(html, /ws-combat-skill/);
  assert.match(html, /data-action="skill"\s+data-key="ath"/);
  assert.match(html, /Athletics/);
  assert.match(html, /\+7/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /data-action="searchitems"/);
  assert.match(html, /data-action="skillfilter" data-proficient="true"/);
  assert.match(html, /data-action="skillfilter" data-proficient="false"/);
  assert.match(html, /Arcana/);
  skillState.proficientSkillsOnly = true;
  const trained = renderer.combatActions();
  assert.match(trained, /Athletics/);
  assert.match(trained, /Stealth/);
  assert.doesNotMatch(trained, /Arcana/);
  assert.match(trained, /data-proficient="true" aria-pressed="true"/);
  visibility.combatSkills = false;
  assert.doesNotMatch(
    renderer.combatActions(),
    /data-category="skills"|data-action="skill"/
  );
  assert.equal(hudState.combatCategory, null);
});

test("hidden item details skip attack and damage calculations", () => {
  const previousGame = globalThis.game;
  globalThis.game = { i18n: { localize: value => value } };
  try {
    const renderer = createItemPanelRenderer({
      actor: {},
      adapter: {
        itemActivities: () => [],
        itemRole: () => "weapon",
        hasItemProperty: () => assert.fail("property read"),
        itemAttackBonus: () => assert.fail("attack calculated"),
        itemDamageFormula: () => assert.fail("damage calculated"),
        itemUsesData: () => null,
        itemRangeData: () => ({ value: 30, long: 120, units: "ft" }),
        rangeUnitLabel: units => units
      },
      escapeHTML,
      hudState: { favoriteEntries: [] },
      t: key => key,
      visibility: { itemDetails: false, favorites: false }
    });
    assert.match(
      renderer.combatItemButton({ id: "bow", name: "Bow" }),
      /30\/120 ft/
    );
  } finally {
    globalThis.game = previousGame;
  }
});

test("multi-activity cards show a chooser and permanent item and activity stars", () => {
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
  const renderer = createItemPanelRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => activities,
      itemRole: () => "other",
      hasItemProperty: () => false,
      itemActivation: () => "",
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
  assert.match(html, /ws-item-favorite/);
  assert.match(
    renderer.combatItemButton(item),
    /data-action="togglefavorite" data-item-id="staff"\s+title=/
  );
  assert.match(renderer.combatItemButton(item), /data-action="removefavorite"/);
  assert.match(renderer.favoriteSection(), /Staff: Attack/);
  hudState.favoritesExpanded = false;
  assert.match(renderer.favoriteSection(), /aria-expanded="false"/);
  assert.doesNotMatch(renderer.favoriteSection(), /Staff: Attack/);
  assert.match(renderer.globalSearchPanel(), /value="staff"/);
});

test("compact favorites use the displayed item for descriptions and always expose activity removal", () => {
  const item = { id: "spell", name: "Spell", type: "spell", system: {} };
  const source = { id: "wand" };
  const { renderer, hudState } = itemRendererFixture({
    items: [item],
    hudState: {
      favoriteEntries: [{ itemId: "spell", activityId: null }],
      favoritesExpanded: true
    },
    adapter: { itemUsageTarget: () => ({ item: source, activityId: "cast" }) },
    visibility: { favorites: true }
  });
  let html = renderer.favoriteSection();
  assert.match(html, /data-description-item-id="spell"/);
  assert.match(html, /data-action="useactivity"\s+data-item-id="wand"/);
  assert.doesNotMatch(html, /ws-item-description/);
  html = renderer.favoriteSection();
  assert.match(html, /data-action="removefavorite" data-item-id="spell"/);
  hudState.favoriteEntries = [{ itemId: "spell", activityId: "blast" }];
  html = renderer.favoriteSection();
  assert.match(
    html,
    /data-action="removefavorite" data-item-id="spell" data-activity-id="blast"/
  );
});

test("favorite activity cards request attack and damage for that activity", () => {
  const previousGame = globalThis.game;
  globalThis.game = { i18n: { localize: value => value } };
  try {
    const item = { id: "staff", name: "Staff" };
    const requested = [];
    const renderer = createItemPanelRenderer({
      actor: { items: new Map([[item.id, item]]) },
      adapter: {
        itemActivities: () => [{ id: "burst", name: "Burst", use() {} }],
        itemRole: () => "weapon",
        itemAttackBonus: (_item, activityId) => {
          requested.push(["attack", activityId]);
          return activityId === "burst" ? "" : "+7";
        },
        itemDamageFormula: (_actor, _item, activityId) => {
          requested.push(["damage", activityId]);
          return activityId === "burst" ? "2d4" : "1d8";
        },
        itemRangeData: () => ({ value: 30, long: "", units: "ft" }),
        rangeUnitLabel: units => units,
        itemUsesData: () => null
      },
      escapeHTML,
      hudState: {
        favoriteEntries: [{ itemId: "staff", activityId: "burst" }],
        favoritesExpanded: true
      },
      t: key => key,
      visibility: { favorites: true, itemDetails: true }
    });

    const html = renderer.favoriteSection();
    assert.deepEqual(requested, [
      ["attack", "burst"],
      ["damage", "burst"]
    ]);
    assert.match(html, /2d4/);
    assert.doesNotMatch(html, /\+7|1d8/);
  } finally {
    globalThis.game = previousGame;
  }
});

test("an item with zero charges shows the reason on its card", () => {
  const item = { id: "wand", name: "Wand", img: "wand.webp" };
  const renderer = createItemPanelRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => [],
      itemRole: () => "other",
      hasItemProperty: () => false,
      itemActivation: () => "",
      itemUsesData: () => ({ value: 0, max: 3 })
    },
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: key => key,
    visibility: {}
  });
  const html = renderer.combatItemButton(item);
  assert.match(html, /class="ws-item-unavailable"/);
  assert.match(html, /Quick.NoCharges/);
  assert.doesNotMatch(html, /Combat.NoSlots/);
});

test("item cards show normal and long range without activation type", () => {
  const item = { id: "bow", name: "Shortbow", type: "weapon" };
  const renderer = createItemPanelRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => [],
      itemRole: () => "weapon",
      hasItemProperty: () => false,
      itemActivation: () => "action",
      itemRangeData: () => ({ value: 80, long: 320, units: "ft" }),
      rangeUnitLabel: () => "feet",
      itemAttackBonus: () => "",
      itemDamageFormula: () => "",
      itemUsesData: () => null
    },
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: key => key,
    visibility: {}
  });

  const html = renderer.combatItemButton(item);
  assert.match(html, /80\/320 feet/);
  assert.doesNotMatch(html, /Combat\.Activation|fa-hourglass-half/);
});

test("item details put attack and damage before range and show spell save DC", () => {
  const previousGame = globalThis.game;
  globalThis.game = { i18n: { localize: value => value } };
  try {
    const item = { id: "spell", name: "Flame", type: "spell" };
    const renderer = createItemPanelRenderer({
      actor: { items: new Map([[item.id, item]]) },
      adapter: {
        itemActivities: () => [],
        itemRole: () => "spell",
        itemActivation: () => "action",
        itemRangeData: () => ({ value: 60, units: "ft" }),
        rangeUnitLabel: units => units,
        itemAttackBonus: () => "+7",
        itemSaveDc: () => "16",
        itemDamageFormula: () => "3d6",
        itemUsesData: () => null,
        hasItemProperty: () => false
      },
      escapeHTML,
      hudState: { favoriteEntries: [] },
      t: key => key,
      visibility: { itemDetails: true }
    });
    const html = renderer.combatItemButton(item);
    assert.ok(html.indexOf("+7") < html.indexOf("3d6"));
    assert.ok(html.indexOf("3d6") < html.indexOf("60 ft"));
    assert.match(html, /Combat.SaveDCShort.*16/);
  } finally {
    globalThis.game = previousGame;
  }
});

test("spell preparation is a separate pressed-state control beside the name", () => {
  const item = {
    id: "spell",
    name: "Shield",
    type: "spell",
    system: { level: 1, method: "spell", prepared: 0, canPrepare: true }
  };
  const renderer = createItemPanelRenderer({
    actor: { isOwner: true, items: new Map([[item.id, item]]) },
    adapter: {
      itemActivities: () => [],
      itemRole: () => "spell",
      spellPreparation: dnd5eAdapter.spellPreparation,
      itemActivation: () => "reaction",
      itemRangeData: () => ({ value: "", units: "" }),
      rangeUnitLabel: () => "",
      itemUsesData: () => null
    },
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: key => key,
    visibility: { favorites: true }
  });

  const html = renderer.combatItemButton(item);
  assert.match(html, /ws-activation-badge[^>]*>R<\/b>/);
  assert.match(
    html,
    /data-action="togglespellprepared"[\s\S]*data-action="togglefavorite"/
  );
  const favorite = renderer.combatItemButton(item, { inFavorites: true });
  assert.doesNotMatch(favorite, /togglespellprepared/);
  assert.match(favorite, /data-action="removefavorite"/);
  assert.match(favorite, /data-action="openitem"/);
  item.system.prepared = 2;
  assert.doesNotMatch(renderer.combatItemButton(item), /togglespellprepared/);
});

test("spell slot counters display regular and pact pools without manual edits", () => {
  const item = { id: "spell", name: "Spell", type: "spell" };
  const adapter = {
    spellLevel: () => 2,
    spellSlotKind: pool => (pool === "pact" ? "pact" : "standard"),
    spellSlots: () => [
      [1, 3, "spell2"],
      [2, 2, "pact"]
    ],
    itemActivities: () => [],
    itemRole: () => "other",
    itemUsesData: () => null
  };
  const options = {
    actor: { items: new Map([[item.id, item]]) },
    adapter,
    escapeHTML,
    hudState: { favoriteEntries: [], preparedSpellsOnly: false },
    t: key => key,
    tf: key => key,
    visibility: {}
  };
  const html = createItemPanelRenderer({
    ...options,
    canRollActor: true
  }).spellGroups([item]);
  assert.doesNotMatch(html, /openspellslots/);
  assert.doesNotMatch(html, /openspellslots/);
  assert.match(html, /ws-slot-kind[^>]*>Combat.SpellSlotsShort<\/span>/);
  assert.match(html, /ws-pact-slots[\s\S]*Combat.PactSlotsShort/);
  assert.doesNotMatch(
    createItemPanelRenderer(options).spellGroups([item]),
    /data-action="openspellslots"/
  );
});

test("combat filters hide empty categories and respect action-type visibility", () => {
  const item = { id: "blade", name: "Blade" };
  const { renderer, hudState } = itemRendererFixture({
    items: [item],
    hudState: { combatCategory: "spells" },
    adapter: {
      combatItems: (_actor, category) => (category === "weapons" ? [item] : [])
    },
    visibility: {
      combatWeapons: true,
      combatSpells: true,
      combatActions: true,
      showActionTypes: true
    }
  });
  const grouped = renderer.combatActions();
  assert.match(grouped, /data-category="weapons"/);
  assert.doesNotMatch(
    grouped,
    /data-category="spells"|data-action="toggleactionmenu"/
  );
  assert.equal(hudState.combatCategory, null);
  assert.doesNotMatch(grouped, /class="ws-combat-item-list"/);
});

test("grouped action menu keeps nonempty action types selectable", () => {
  const item = { id: "dash", name: "Dash" };
  const categoryReads = [];
  const { renderer } = itemRendererFixture({
    items: [item],
    adapter: {
      combatItems: (_actor, category) => {
        categoryReads.push(category);
        return category === "action" ? [item] : [];
      },
      itemActivation: () => "action"
    },
    hudState: { combatCategory: "action", actionMenuOpen: true },
    visibility: {
      combatActions: true,
      combatBonusActions: true,
      showActionTypes: true
    }
  });
  const html = renderer.combatActions();
  assert.doesNotMatch(html, /data-action="toggleactionmenu"/);
  assert.match(html, /data-category="action"/);
  assert.doesNotMatch(html, /data-category="bonus"/);
  assert.deepEqual(categoryReads, [
    "weapons",
    "spells",
    "action",
    "bonus",
    "reaction",
    "special",
    "features"
  ]);
});

test("combat renderer uses indexed categories when the adapter provides them", () => {
  const weapon = { id: "blade", name: "Blade" };
  const indexedRequests = [];
  const { renderer } = itemRendererFixture({
    items: [weapon],
    adapter: {
      combatItems: () => {
        throw new Error("Repeated category query");
      },
      combatItemsByCategory: (_actor, categories) => {
        indexedRequests.push(categories);
        return new Map([["weapons", [weapon]]]);
      }
    },
    visibility: { combatWeapons: true, combatSpells: true }
  });

  const html = renderer.combatActions();
  assert.match(html, /data-category="weapons"/);
  assert.doesNotMatch(html, /data-category="spells"/);
  assert.deepEqual(indexedRequests, [["weapons", "spells", "features"]]);
});

test("action-type setting hides its menu while keeping weapon actions", () => {
  const item = { id: "blade", name: "Blade" };
  const visibility = {
    combatWeapons: true,
    combatActions: true,
    showActionTypes: true
  };
  const renderer = createItemPanelRenderer({
    actor: { items: new Map([[item.id, item]]) },
    adapter: {
      combatItems: (_actor, category) =>
        ["weapons", "action"].includes(category) ? [item] : [],
      itemActivities: () => [],
      itemRole: () => "other",
      hasItemProperty: () => false,
      itemActivation: () => "action",
      itemUsesData: () => null
    },
    escapeHTML,
    hudState: {
      combatCategory: "action",
      actionMenuOpen: true,
      searchQuery: "",
      favoriteEntries: []
    },
    t: key => key,
    visibility
  });

  assert.match(renderer.combatActions(), /data-category="action"/);
  visibility.showActionTypes = false;
  const html = renderer.combatActions();
  assert.match(html, /data-category="weapons"/);
  assert.doesNotMatch(html, /data-action="toggleactionmenu"|ws-action-menu/);
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
    performRoll: callback => callback()
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
  await actions.togglefavorite({}, { dataset: { itemId: "staff" } });
  assert.deepEqual(saves, [
    ["staff", "save"],
    ["staff", null]
  ]);
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
    performRoll: callback => callback(),
    visibility: { activityPicker: true }
  });
  const event = { shiftKey: true };

  await actions.useitem(event, { dataset: { itemId: "staff" } });
  assert.deepEqual(calls, [{ event }]);
});

test("an item is available in every matching activity category", () => {
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

test("native availability keeps empty-charge overrides usable and disabled favorite activities visible", () => {
  const item = {
    id: "wand",
    name: "Wand",
    type: "feat",
    system: {
      uses: { max: 3, spent: 3 },
      activities: [
        { id: "hidden", name: "Hidden", canUse: false, use() {} },
        { id: "available", name: "Available", use() {} }
      ]
    }
  };
  assert.deepEqual(dnd5eAdapter.itemUseState(item), {
    blocked: false,
    reason: "Quick.NoCharges"
  });
  assert.equal(
    dnd5eAdapter.itemUseState(item, "hidden").reason,
    "Quick.ActivityUnavailable"
  );
  assert.equal(
    dnd5eAdapter.itemUseState(item, "gone").reason,
    "Quick.ActivityMissing"
  );
  const { renderer } = itemRendererFixture({
    items: [item],
    adapter: dnd5eAdapter,
    hudState: {
      favoriteEntries: [{ itemId: item.id, activityId: "hidden" }],
      favoritesExpanded: true
    },
    visibility: { favorites: true }
  });
  const html = renderer.favoriteSection();
  assert.match(html, /Wand: Hidden/);
  assert.match(html, /disabled aria-disabled="true"/);
  assert.match(html, /title="Quick.ActivityUnavailable"/);
  assert.doesNotMatch(html, /data-favorite-drag-handle|draggable=/);
  item.canUse = false;
  assert.equal(dnd5eAdapter.itemUseState(item).reason, "Quick.ItemUnavailable");
});

test("empty favorites offer editing guidance and depleted items retain their order with hover-only reasons", () => {
  const charged = {
      id: "ready",
      name: "Ready",
      type: "feat",
      system: { uses: { max: 3, spent: 0 } }
    },
    empty = {
      id: "empty",
      name: "Empty",
      type: "feat",
      system: {
        uses: { max: 7, spent: 7 },
        activities: [
          {
            id: "use",
            use() {},
            consumption: { targets: [{ type: "itemUses", value: 1 }] }
          }
        ]
      }
    };
  const entries = [
    { itemId: "empty", activityId: null },
    { itemId: "ready", activityId: null }
  ];
  const { renderer, hudState } = itemRendererFixture({
    items: [empty, charged],
    adapter: dnd5eAdapter,
    hudState: { favoriteEntries: entries, favoritesExpanded: true },
    visibility: { favorites: true }
  });
  const html = renderer.favoriteSection();
  assert.ok(html.indexOf("Empty") < html.indexOf("Ready"));
  assert.doesNotMatch(html, /class="ws-item-unavailable"/);
  assert.match(html, /title="Quick.NoCharges"/);
  assert.match(html, /0\/7/);
  assert.doesNotMatch(html, /Combat.ResourceCost/);
  assert.match(html, /ws-unavailable-card/);
  assert.deepEqual(hudState.favoriteEntries, entries);
  empty.system.uses.spent = 0;
  const restored = renderer.favoriteSection();
  assert.ok(restored.indexOf("Empty") < restored.indexOf("Ready"));
  hudState.favoriteEntries = [];
  assert.match(renderer.favoriteSection(), /Quick.EmptyFavoritesHint/);
  assert.match(renderer.favoriteSection(), /Quick.Favorites · 0/);
  hudState.favoritesExpanded = false;
  assert.match(renderer.favoriteSection(), /aria-expanded="false"/);
  assert.doesNotMatch(renderer.favoriteSection(), /Quick.EmptyFavoritesHint/);
});
