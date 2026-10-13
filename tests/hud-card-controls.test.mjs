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
