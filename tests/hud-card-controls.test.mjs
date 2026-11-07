import assert from "node:assert/strict";
import test from "node:test";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { itemRendererFixture, fragment } from "./helpers/rendering.mjs";
import { createActorActions } from "../scripts/hud/actor-actions.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { createHudState } from "../scripts/hud/state.js";
import { readHudVisibility } from "../scripts/hud/visibility.js";
import {
  rememberRecentAction,
  renderRecentActions
} from "../scripts/hud/recent-actions.js";
import {
  hudLaneOrder,
  toggleHudBlockHidden,
  resetHudBlockPreferences
} from "../scripts/hud/window/hud-layout-model.js";
import { hudFixture } from "./helpers/hud.mjs";
restoreGlobalsAfterEach();

test("item opening stays hidden by default and favorite stars always remain inside cards", () => {
  const f = itemRendererFixture({ visibility: { favorites: true } });
  const item = { id: "sword", name: "Sword", type: "weapon" };
  const card = () => fragment(f.renderer.combatItemButton(item));
  assert.equal(card().querySelector(".ws-item-open"), null);
  assert.ok(card().querySelector(".ws-combat-item-card > .ws-item-favorite"));
  assert.equal(card().querySelector(".ws-item-side-actions"), null);
  f.visibility.favorites = false;
  assert.equal(card().querySelector(".ws-item-favorite"), null);
  f.visibility.hideItemOpenButton = false;
  assert.ok(card().querySelector(".ws-item-side-actions > .ws-item-open"));
  f.visibility.hideItemOpenButton = true;
  assert.equal(card().querySelector(".ws-item-side-actions"), null);
});

test("favorite controls need no mode button and showing stars does not change saved favorites", async () => {
  const f = await hudFixture();
  const before = structuredClone(f.actor.system.favorites);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.equal(
    app.element.querySelector('[data-action="togglefavoritemode"]'),
    null
  );
  assert.equal(app.hudActions.togglefavoritemode, undefined);
  assert.equal(f.current.has("showFavoriteMode"), false);
  assert.deepEqual(f.actor.system.favorites, before);
  await app.close();
});

test("unprepared favorites are marked and cannot be used until prepared", () => {
  let prepared = false;
  const f = itemRendererFixture({
    visibility: { favorites: true },
    adapter: {
      itemRole: () => "spell",
      itemRangeData: () => ({}),
      rangeUnitLabel: () => "",
      spellPreparation: () => ({ canPrepare: true, prepared })
    }
  });
  const spell = { id: "spell", name: "Example spell", type: "spell" };
  const render = () =>
    fragment(f.renderer.combatItemButton(spell, { inFavorites: true }));
  assert.equal(
    render().querySelector(".ws-unavailable-card").dataset.unprepared,
    "true"
  );
  assert.equal(
    render().querySelector(".ws-combat-item").hasAttribute("disabled"),
    true
  );
  prepared = true;
  assert.equal(render().querySelector("[data-unprepared]"), null);
  assert.equal(
    render().querySelector(".ws-combat-item").hasAttribute("disabled"),
    false
  );
  prepared = false;
  assert.equal(
    fragment(f.renderer.combatItemButton(spell))
      .querySelector(".ws-combat-item")
      .hasAttribute("disabled"),
    false
  );
});

test("missing eligible slots grey out slot casts without disabling native use", () => {
  const settings = installSettings();
  const cast = {
    id: "cast",
    requiresSpellSlot: true,
    consumption: { spellSlot: true },
    use() {}
  };
  const freeCast = {
    ...cast,
    id: "free",
    type: "forward",
    consumption: { spellSlot: true, targets: [{ type: "itemUses" }] }
  };
  const spell = {
    id: "spell",
    name: "Example spell",
    type: "spell",
    system: {
      level: 3,
      method: "spell",
      properties: new Set(),
      activities: [cast]
    }
  };
  const actor = {
    isOwner: true,
    system: {
      spells: {
        spell1: { max: 3, value: 2 },
        spell2: { max: 2, value: 1 },
        spell3: { max: 2, value: 0 },
        spell4: { max: 1, value: 0 },
        pact: { max: 1, value: 1, level: 2 }
      }
    },
    items: new Map()
  };
  const f = itemRendererFixture({
    actor,
    t: key =>
      key === "Quick.NeedsSpellSlotLevel"
        ? "Requires level {level} or higher"
        : key,
    visibility: { ...readHudVisibility(), cardDetailFields: [] },
    adapter: { ...dnd5eAdapter, spellPreparation: () => null }
  });
  const render = (item = spell, options) =>
    fragment(f.renderer.combatItemButton(item, options));
  const dimmed = (item, options) =>
    Boolean(render(item, options).querySelector(".ws-unavailable-card"));
  const variant = system => ({
    ...spell,
    system: { ...spell.system, ...system }
  });

  assert.equal(dimmed(), true);
  assert.equal(dimmed(spell, { inFavorites: true }), true);
  const button = render().querySelector(".ws-combat-item");
  assert.equal(button.getAttribute("title"), "Requires level 3 or higher");
  assert.equal(
    button.getAttribute("aria-description"),
    "Requires level 3 or higher"
  );
  assert.equal(
    button.querySelector(".ws-item-unavailable").textContent,
    "Requires level 3 or higher"
  );
  assert.match(
    render(spell, { inFavorites: true }).querySelector(".ws-item-unavailable")
      .textContent,
    /Requires level 3 or higher/
  );
  assert.equal(button.disabled, false);
  actor.uuid = "Actor.spellcaster";
  actor.items.set(spell.id, spell);
  rememberRecentAction(actor, { action: "useitem", itemId: spell.id });
  const recent = fragment(
    renderRecentActions({
      actor,
      adapter: f.adapter,
      t: key =>
        key === "Quick.NeedsSpellSlotLevel"
          ? "Requires level {level} or higher"
          : key,
      dimSpellsWithoutSlots: true,
      escapeHTML: foundry.utils.escapeHTML
    })
  ).querySelector(".ws-recent-action");
  assert.match(recent.title, /Requires level 3 or higher/);
  assert.equal(recent.disabled, false);

  assert.equal(dimmed(variant({ level: 2 })), false);
  actor.system.spells.spell3.value = 1;
  assert.equal(dimmed(), false);
  actor.system.spells.spell3.value = 0;
  actor.system.spells.spell4.value = 1;
  assert.equal(dimmed(), false);
  actor.system.spells.spell4.value = 0;
  actor.system.spells.pact.level = 3;
  assert.equal(dimmed(), false);
  globalThis.CONFIG = {
    DND5E: {
      spellcasting: { pact: { exclusive: { slots: true, spells: true } } }
    }
  };
  assert.equal(dimmed(), true);
  assert.equal(dimmed(variant({ method: "pact" })), false);
  actor.system.spells.pact.value = 0;
  actor.system.spells.spell3.value = 1;
  assert.equal(dimmed(variant({ method: "pact" })), true);
  actor.system.spells.spell3.value = 0;

  assert.equal(dimmed(variant({ properties: new Set(["ritual"]) })), false);
  assert.equal(
    dimmed(
      variant({ level: 0, activities: [{ ...cast, requiresSpellSlot: false }] })
    ),
    false
  );
  assert.equal(
    dimmed(
      variant({
        method: "innate",
        activities: [{ ...cast, requiresSpellSlot: false }]
      })
    ),
    false
  );
  assert.equal(
    dimmed(
      variant({
        activities: [
          {
            ...cast,
            consumption: { spellSlot: false, targets: [{ type: "itemUses" }] }
          }
        ]
      })
    ),
    false
  );
  const mixed = variant({ activities: [cast, freeCast] });
  assert.equal(dimmed(mixed), false);
  assert.equal(
    dimmed(mixed, { activityId: "cast", activityOption: true }),
    true
  );
  assert.equal(
    dimmed(mixed, { activityId: "free", activityOption: true }),
    false
  );

  const linked = {
    id: "wand",
    type: "equipment",
    system: {
      activities: [
        {
          id: "wand-cast",
          type: "cast",
          spell: { uuid: "Actor.test.Item.spell" },
          use() {}
        }
      ]
    }
  };
  actor.items.set(linked.id, linked);
  assert.equal(dimmed(), false);
  linked.system.activities[0].consumption = {
    targets: [{ type: "spellSlots", target: "3", value: "1" }]
  };
  assert.equal(dimmed(), true);
  actor.system.spells.spell3.value = 1;
  assert.equal(dimmed(), false);
  linked.system.activities[0].consumption.targets[0].value = "2";
  assert.equal(dimmed(), true);
  actor.system.spells.spell3.value = 2;
  assert.equal(dimmed(), false);
  actor.system.spells.spell3.value = 0;

  actor.items.clear();
  settings.current.set("dimSpellsWithoutSlots", false);
  f.visibility.dimSpellsWithoutSlots =
    readHudVisibility().dimSpellsWithoutSlots;
  assert.equal(dimmed(), false);
});

test("slot editing submits only the chosen pool and accepts zero without changing maximum", async () => {
  installSettings();
  const writes = [];
  const actor = {
    isOwner: true,
    system: {
      spells: { spell2: { value: 1, max: 3 }, pact: { value: 2, max: 2 } }
    },
    update: async data => writes.push(data)
  };
  const actions = createActorActions({
    actor,
    adapter: dnd5eAdapter,
    t: key => key,
    performAndRefresh: callback => callback()
  });
  let config;
  foundry.applications.api.DialogV2 = {
    wait: async options => {
      config = options;
      return 0;
    }
  };
  await actions.editspellslots({}, { dataset: { spellPool: "pact" } });
  assert.deepEqual(writes, [{ "system.spells.pact.value": 0 }]);
  assert.equal(actor.system.spells.pact.max, 2);
  assert.match(config.content, /max="2"/);
  const save = config.buttons.find(button => button.action === "save").callback;
  assert.equal(
    save(null, {
      form: {
        elements: { slots: { value: "1.5", checkValidity: () => false } }
      }
    }),
    null
  );
  assert.equal(
    save(null, {
      form: { elements: { slots: { value: "0", checkValidity: () => true } } }
    }),
    0
  );
  for (const value of [-1, 4, 1.5, NaN])
    await dnd5eAdapter.setSpellSlotValue(actor, "spell2", value);
  await dnd5eAdapter.setSpellSlotValue(actor, "spell1.value", 1);
  assert.equal(writes.length, 1);
});

for (const change of ["cancel", "ownership", "session", "document", "maximum"])
  test(`slot editing rejects a delayed choice after ${change}`, async () => {
    installSettings();
    let resolve;
    let current = true;
    let valid = true;
    const writes = [];
    const actor = {
      isOwner: true,
      system: { spells: { spell1: { value: 1, max: 3 } } },
      update: async data => writes.push(data)
    };
    foundry.applications.api.DialogV2 = {
      wait: () =>
        new Promise(done => {
          resolve = done;
        })
    };
    const actions = createActorActions({
      actor,
      adapter: dnd5eAdapter,
      t: key => key,
      isSessionCurrent: () => current,
      validateActorAction: () => valid,
      performAndRefresh: callback => callback()
    });
    const pending = actions.editspellslots(
      {},
      { dataset: { spellPool: "spell1" } }
    );
    if (change === "ownership") actor.isOwner = false;
    if (change === "session") current = false;
    if (change === "document") valid = false;
    if (change === "maximum") actor.system.spells.spell1.max = 1;
    resolve(change === "cancel" ? null : 2);
    await pending;
    assert.deepEqual(writes, []);
  });

test("legacy coin placements are ignored while hiding remains compatible without changing saved data", () => {
  const state = createHudState({
    hudLayouts: {
      "regular:info": { order: ["currency"], hidden: ["currency"] },
      "regular:actions": { order: [], hidden: [] }
    }
  });
  const before = structuredClone(state.hudLayouts);
  assert.deepEqual(hudLaneOrder(state, "regular", "info", []), []);
  assert.deepEqual(state.hudLayouts, before);
  toggleHudBlockHidden(state, "regular", "weight", "info", []);
  assert.deepEqual(state.hudLayouts["regular:info"].hidden, []);
  state.hudLayouts["regular:actions"].order = ["weight"];
  assert.deepEqual(hudLaneOrder(state, "regular", "info", []), []);
  assert.deepEqual(hudLaneOrder(state, "regular", "actions", []), []);
  resetHudBlockPreferences(state, "regular", "weight");
  assert.deepEqual(state.hudLayouts["regular:info"].order, []);
  assert.deepEqual(state.hudLayouts["regular:actions"].order, []);
});
