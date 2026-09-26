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
