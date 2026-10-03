import assert from "node:assert/strict";
import test from "node:test";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { hudFixture } from "./helpers/hud.mjs";
import { favoriteEntries, toggleFavorite } from "../scripts/dnd5e/favorites.js";

restoreGlobalsAfterEach();

test("favorite removal preserves other types; foreign IDs and non-owner writes are ignored", async () => {
  const { actor } = await hudFixture();
  actor.items.set("a", { id: "a", system: {} });
  actor.items.set("b", { id: "b", system: {} });
  actor.system.favorites = [
    { type: "item", id: "Actor.hero.Item.a", sort: 100000 },
    { type: "effect", id: ".ActiveEffect.effect", sort: 200000 },
    { type: "slots", id: "spells.spell1", sort: 300000 },
    { type: "activity", id: ".Item.b.Activity.deleted", sort: 400000 },
    { type: "item", id: "Actor.foreign.Item.a", sort: 500000 }
  ];
  await actor.system.addFavorite({ type: "item", id: "Actor.hero.Item.a" });
  assert.equal(actor.system.favorites.length, 5);
  await toggleFavorite(actor, "b", "deleted");
  assert.equal(actor.system.favorites.length, 4);
  assert.deepEqual(favoriteEntries(actor), [{ itemId: "a", activityId: null }]);
  const before = structuredClone(actor.system.favorites);
  actor.isOwner = false;
  await toggleFavorite(actor, "a");
  assert.deepEqual(actor.system.favorites, before);
});

test("sheet favorite updates refresh HUD stars and order without reopening", async () => {
  const fixture = await hudFixture();
  for (const id of ["a", "b"])
    fixture.actor.items.set(id, { id, name: id, type: "feat", system: {} });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  await fixture.actor.system.addFavorite({ type: "item", id: ".Item.a" });
  await fixture.actor.system.addFavorite({ type: "item", id: ".Item.b" });
  fixture.hooks.callAll("updateActor", fixture.actor, {
    system: { favorites: fixture.actor.system.favorites }
  });
  fixture.flushFrames();
  const refs = () =>
    [...app.element.querySelectorAll(".ws-favorites .ws-combat-item")].map(
      node =>
        JSON.stringify([node.dataset.itemId, node.dataset.activityId ?? null])
    );
  assert.deepEqual(refs(), ['["a",null]', '["b",null]']);
  await fixture.actor.update({
    "system.favorites": fixture.actor.system.favorites.map(f => ({
      ...f,
      sort: f.id === ".Item.b" ? 1 : 2
    }))
  });
  fixture.hooks.callAll("updateActor", fixture.actor);
  fixture.flushFrames();
  assert.deepEqual(refs(), ['["b",null]', '["a",null]']);
  await fixture.actor.system.removeFavorite(".Item.b");
  fixture.hooks.callAll("updateActor", fixture.actor);
  fixture.flushFrames();
  assert.deepEqual(refs(), ['["a",null]']);
  assert.equal(__adventurerHud.app, app);
  assert.deepEqual(fixture.notifications, []);
  await app.close();
});

test("header editing reveals removal controls and repeated removal never re-adds a favorite", async () => {
  const f = await hudFixture();
  for (const id of ["a", "b"])
    f.actor.items.set(id, { id, name: id, type: "feat", system: {} });
  f.actor.system.favorites = [
    { type: "item", id: ".Item.a", sort: 1 },
    { type: "item", id: ".Item.b", sort: 2 }
  ];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const header = () =>
    app.element.querySelector('[data-action="togglefavoriteedit"]');
  const removals = () =>
    app.element.querySelectorAll(
      '.ws-favorites [data-action="removefavorite"]'
    );
  assert.equal(header().getAttribute("aria-pressed"), "false");
  assert.equal(removals().length, 0);
  assert.equal(app.element.querySelectorAll(".ws-item-description").length, 0);
  const target = { dataset: { itemId: "a" } };
  await app.hudActions.removefavorite(null, target);
  assert.equal(f.actor.system.favorites.length, 2);
  await app.hudActions.togglefavoriteedit();
  assert.equal(header().getAttribute("aria-pressed"), "true");
  assert.equal(removals().length, 2);
  await Promise.all([
    app.hudActions.removefavorite(null, target),
    app.hudActions.removefavorite(null, target)
  ]);
  assert.deepEqual(
    f.actor.system.favorites.map(entry => entry.id),
    [".Item.b"]
  );
  assert.equal(removals().length, 1);
  assert.equal(header().getAttribute("aria-pressed"), "true");
  await app.close();
  await f.api.open(f.actor);
  assert.equal(
    __adventurerHud.app.element
      .querySelector('[data-action="togglefavoriteedit"]')
      .getAttribute("aria-pressed"),
    "false"
  );
  assert.equal(
    __adventurerHud.app.element.querySelectorAll(
      '[data-action="removefavorite"]'
    ).length,
    0
  );
  assert.deepEqual(f.notifications, []);
  await __adventurerHud.app.close();
});

test("ownership and favorite visibility cancel editing in an open HUD", async () => {
  const f = await hudFixture();
  f.actor.items.set("a", { id: "a", name: "a", type: "feat", system: {} });
  f.actor.system.favorites = [{ type: "item", id: ".Item.a" }];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglefavoriteedit();
  f.actor.isOwner = false;
  f.hooks.callAll("updateActor", f.actor, { ownership: {} });
  f.flushFrames();
  assert.equal(
    app.element.querySelector('[data-action="togglefavoriteedit"]'),
    null
  );
  await app.hudActions.removefavorite(null, { dataset: { itemId: "a" } });
  assert.equal(f.actor.system.favorites.length, 1);
  f.actor.isOwner = true;
  f.hooks.callAll("updateActor", f.actor, { ownership: {} });
  f.flushFrames();
  assert.equal(
    app.element
      .querySelector('[data-action="togglefavoriteedit"]')
      .getAttribute("aria-pressed"),
    "false"
  );
  await app.hudActions.togglefavoriteedit();
  await game.settings.set("adventurer-hud", "showFavorites", false);
  assert.equal(
    app.element.querySelector('[data-action="togglefavoriteedit"]'),
    null
  );
  await game.settings.set("adventurer-hud", "showFavorites", true);
  assert.equal(
    app.element
      .querySelector('[data-action="togglefavoriteedit"]')
      .getAttribute("aria-pressed"),
    "false"
  );
  await app.close();
});
