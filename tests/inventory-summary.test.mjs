import assert from "node:assert/strict";
import test from "node:test";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import { hudFixture } from "./helpers/hud.mjs";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";

restoreGlobalsAfterEach();

test("inventory summary uses native carrying capacity and weight units and shows actual gold coins", t => {
  installSettings();
  globalThis.CONFIG = {
    DND5E: {
      encumbrance: { baseUnits: { default: { imperial: "lb", metric: "kg" } } },
      weightUnits: {
        lb: { abbreviation: "pounds" },
        kg: { abbreviation: "kg" }
      }
    }
  };
  const actor = {
    type: "character",
    system: {
      attributes: { encumbrance: { value: 43.7, max: 480 } },
      abilities: { str: { value: 8 } },
      currency: { gp: 37, pp: 100, sp: 200, cp: 50 }
    }
  };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: 43.7,
    maxWeight: 480,
    units: "pounds",
    gold: 37
  });
  const get = game.settings.get;
  t.mock.method(game.settings, "get", (module, key) =>
    module === "dnd5e" ? true : get(module, key)
  );
  actor.system.attributes.encumbrance = { value: 17.5, max: 240 };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: 17.5,
    maxWeight: 240,
    units: "kg",
    gold: 37
  });
});

test("inventory summary keeps unknown weight distinct from zero and accepts unlimited capacity", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const actor = { type: "character", system: {} };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: null,
    maxWeight: null,
    units: "lb",
    gold: 0
  });
  actor.system.attributes = { encumbrance: { value: 0, max: Infinity } };
  actor.system.currency = { gp: NaN };
  assert.equal(dnd5eAdapter.inventorySummary(actor).weight, 0);
  assert.equal(dnd5eAdapter.inventorySummary(actor).maxWeight, Infinity);
  actor.system.attributes.encumbrance = { value: NaN, max: -1 };
  assert.equal(dnd5eAdapter.inventorySummary(actor).weight, null);
  assert.equal(dnd5eAdapter.inventorySummary(actor).maxWeight, null);
});

test("inventory weight and gold refresh with actor and item changes and stay independent of filters", async () => {
  const f = await hudFixture({
    values: { panelStates: { "Actor.hero": { currentView: "inventory" } } }
  });
  f.actor.system.attributes.encumbrance = { value: 43.7, max: 180 };
  f.actor.system.currency = { gp: 1250 };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const weight = () =>
    app.element.querySelector(".ws-inventory-weight strong > span").textContent;
  const gold = () =>
    app.element.querySelector(".ws-inventory-gold strong > span").textContent;
  assert.equal(weight(), "43.7 / 180");
  assert.equal(gold(), "1,250");
  f.actor.system.currency.gp = 45;
  f.hooks.callAll("updateActor", f.actor, { "system.currency.gp": 45 });
  f.flushFrames();
  assert.equal(gold(), "45");
  // Foundry has already prepared the new carried weight when item hooks fire.
  f.actor.system.attributes.encumbrance.value = 18;
  f.hooks.callAll(
    "updateItem",
    { parent: f.actor, type: "weapon" },
    { "system.quantity": 0 }
  );
  f.flushFrames();
  assert.equal(weight(), "18 / 180");
  await app.hudActions.inventoryfilter(null, {
    dataset: { category: "other" }
  });
  const search = app.element.querySelector('[data-action="searchitems"]');
  search.value = "not in inventory";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true })
  );
  assert.equal(weight(), "18 / 180");
  assert.equal(gold(), "45");
  assert.deepEqual(f.nativeCalls, []);
  await app.close();
});
