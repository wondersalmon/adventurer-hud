import assert from "node:assert/strict";
import test from "node:test";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import { hudFixture } from "./helpers/hud.mjs";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";

restoreGlobalsAfterEach();

test("money and weight are rendered only inside the open inventory in both modes", async () => {
  for (const combat of [false, true]) {
    const f = await hudFixture({ combat, values: { playerFooter: true } });
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    assert.equal(
      app.element.querySelectorAll(".ws-inventory-summary").length,
      0
    );
    if (combat)
      await app.hudActions.combatfilter(null, {
        dataset: { category: "inventory" }
      });
    else await app.hudActions.view(null, { dataset: { view: "inventory" } });
    assert.equal(
      app.element.querySelectorAll(".ws-inventory-summary").length,
      1
    );
    assert.equal(
      app.element.querySelector(".ws-player-footer .ws-inventory-summary"),
      null
    );
    if (combat)
      await app.hudActions.combatfilter(null, {
        dataset: { category: "spells" }
      });
    else await app.hudActions.view(null, { dataset: { view: "skills" } });
    assert.equal(
      app.element.querySelectorAll(".ws-inventory-summary").length,
      0
    );
    await app.close();
  }
});

test("inventory summary delegates to the displayed actor's native inventory tab", async t => {
  const f = await hudFixture({ values: { playerFooter: true } });
  const calls = [];
  f.actor.sheet = { render: options => calls.push(options) };
  let time = 0;
  t.mock.method(performance, "now", () => time);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.view(null, { dataset: { view: "inventory" } });
  assert.equal(
    app.element.querySelectorAll(
      'button.ws-inventory-summary[data-action="actorinventory"]'
    ).length,
    1
  );
  assert.equal(app.element.querySelectorAll(".ws-inventory-summary").length, 1);
  await app.hudActions.actorinventory();
  time += 1000;
  await app.hudActions.actorinventory();
  assert.deepEqual(calls, [
    { force: true, tab: "inventory" },
    { force: true, tab: "inventory" }
  ]);
  f.actor.isOwner = false;
  time += 1000;
  await app.hudActions.actorinventory();
  assert.equal(calls.length, 2);
  await app.close();
  time += 1000;
  await app.hudActions.actorinventory();
  assert.equal(calls.length, 2);
});

test("load colors follow native variant thresholds and carrying capacity", t => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const get = game.settings.get;
  t.mock.method(game.settings, "get", (module, key) =>
    module === "dnd5e" && key === "encumbrance" ? "variant" : get(module, key)
  );
  const encumbrance = {
    value: 40,
    max: 999,
    thresholds: { encumbered: 50, heavilyEncumbered: 100, maximum: 150 }
  };
  const actor = { type: "character", system: { attributes: { encumbrance } } };
  for (const [weight, expected] of [
    [40, "normal"],
    [50, "normal"],
    [51, "encumbered"],
    [101, "heavy"],
    [151, "overloaded"]
  ]) {
    encumbrance.value = weight;
    const data = dnd5eAdapter.inventorySummary(actor);
    assert.equal(data.loadState, expected);
    assert.equal(data.maxWeight, 150);
  }
});

test("inventory summary uses native carrying capacity and shows every nonzero coin denomination", t => {
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
      currency: { gp: 37, pp: 100, sp: 200, cp: 50, ep: 3 }
    }
  };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: 43.7,
    maxWeight: 480,
    loadState: "normal",
    units: "pounds",
    coins: [
      { type: "pp", value: 100 },
      { type: "gp", value: 37 },
      { type: "ep", value: 3 },
      { type: "sp", value: 200 },
      { type: "cp", value: 50 }
    ]
  });
  const get = game.settings.get;
  t.mock.method(game.settings, "get", (module, key) =>
    module === "dnd5e" ? true : get(module, key)
  );
  actor.system.attributes.encumbrance = { value: 17.5, max: 240 };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: 17.5,
    maxWeight: 240,
    loadState: "normal",
    units: "kg",
    coins: [
      { type: "pp", value: 100 },
      { type: "gp", value: 37 },
      { type: "ep", value: 3 },
      { type: "sp", value: 200 },
      { type: "cp", value: 50 }
    ]
  });
});

test("inventory summary keeps unknown weight distinct from zero and accepts unlimited capacity", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const actor = { type: "character", system: {} };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor), {
    weight: null,
    maxWeight: null,
    loadState: "unknown",
    units: "lb",
    coins: []
  });
  actor.system.attributes = { encumbrance: { value: 0, max: Infinity } };
  actor.system.currency = { gp: NaN, cp: -1, sp: 0, ep: "4", pp: Infinity };
  assert.deepEqual(dnd5eAdapter.inventorySummary(actor).coins, [
    { type: "ep", value: 4 }
  ]);
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
    app.element.querySelector(".ws-coin-gp > span").textContent;
  assert.equal(weight(), "43.7 / 180");
  assert.equal(gold(), "1,250");
  f.actor.system.currency.gp = 45;
  f.hooks.callAll("updateActor", f.actor, { "system.currency.gp": 45 });
  f.flushFrames();
  assert.equal(gold(), "45");
  f.actor.system.currency.cp = 7;
  f.hooks.callAll("updateActor", f.actor, { "system.currency.cp": 7 });
  f.flushFrames();
  assert.equal(
    app.element.querySelector(".ws-coin-cp > span").textContent,
    "7"
  );
  f.actor.system.currency.cp = 0;
  f.hooks.callAll("updateActor", f.actor, { "system.currency.cp": 0 });
  f.flushFrames();
  assert.equal(app.element.querySelector(".ws-coin-cp"), null);
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
