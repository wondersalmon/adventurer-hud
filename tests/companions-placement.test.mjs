import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { ownedCompanions } from "../scripts/hud/companions/companions.js";
import { placementFixture, fixture, target } from "./helpers/companions.mjs";

restoreGlobalsAfterEach();

test("native placement refreshes one actor row, hides add button and preserves selection", async () => {
  const f = await placementFixture();
  const hero = f.token(f.actor, "hero", true);
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  canvas.tokens.placeTokens = async (data, options) => {
    assert.deepEqual(data, [
      { actorId: f.base.id, name: "Owl", actorLink: false }
    ]);
    assert.deepEqual(options.createOptions, { controlObject: false });
    assert.equal(options.preConfirm(), true);
    assert.equal(await options.preCommit(), true);
    const token = f.token(f.base, "placed");
    f.hooks.callAll("createToken", token);
    return [token];
  };
  await f.app.hudActions.companionplace(null, target(f.base.uuid));
  assert.equal(f.app.element.querySelectorAll(".ws-companion-row").length, 1);
  assert.equal(
    f.app.element.querySelector('[data-action="companionplace"]'),
    null
  );
  assert.equal(
    f.app.element.querySelector('[data-action="opencompanion"]').dataset
      .companionUuid,
    f.base.uuid
  );
  assert.equal(canvas.tokens.controlled[0].document, hero);
  assert.deepEqual(f.calls[0], [
    "prototype",
    { level: "level" },
    { parent: canvas.scene }
  ]);
  await f.app.hudActions.companionplace(null, target(f.base.uuid));
  assert.equal(f.calls.filter(call => call[0] === "prototype").length, 1);
  await f.app.close();
});

test("placement rejects another-client token, revoked permissions, pause or scene change before commit", async t => {
  for (const reason of ["token", "permission", "ownership", "pause", "scene"])
    await t.test(reason, async () => {
      const f = await placementFixture();
      canvas.tokens.placeTokens = async (_data, options) => {
        if (reason === "token") f.token(f.base, "remote");
        if (reason === "permission") f.revoke();
        if (reason === "ownership") f.base.isOwner = false;
        if (reason === "pause") game.paused = true;
        if (reason === "scene")
          canvas.scene = { id: "other", tokens: itemCollection() };
        assert.equal(options.preConfirm(), false);
        assert.equal(await options.preCommit(), false);
        return [];
      };
      await f.app.hudActions.companionplace(null, target(f.base.uuid));
      await f.app.close();
    });
});

test("double placement is blocked and closing cancels the native preview without adding a row", async () => {
  const f = await placementFixture();
  let complete;
  let previews = 0;
  canvas.tokens.placeTokens = () => {
    previews++;
    return new Promise(resolve => {
      complete = resolve;
    });
  };
  const starting = f.app.hudActions.companionplace(null, target(f.base.uuid));
  await waitFor(() => previews === 1);
  assert.equal(
    f.app.element.querySelector('[data-action="companionplace"]').disabled,
    true
  );
  await f.app.hudActions.companionplace(null, target(f.base.uuid));
  assert.equal(previews, 1);
  const stale = f.app.hudActions;
  await f.app.close();
  assert.ok(f.calls.some(call => call[0] === "cancel"));
  complete([]);
  await starting;
  await stale.companionplace(null, target(f.base.uuid));
  assert.equal(previews, 1);
  assert.equal((await ownedCompanions(f.actor)).length, 1);
});

test("native actor replacement switches the companion session to the new synthetic actor", async () => {
  const f = await fixture();
  const token = f.token(f.npc(), "owl");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(token.uuid));
  const previous = app.hudActions;
  const replacement = {
    ...token.actor,
    name: "Replacement",
    items: itemCollection()
  };
  token.actor = replacement;
  f.documents.set(replacement.uuid, replacement);
  await previous.ability({}, { dataset: { type: "check", key: "str" } });
  assert.deepEqual(f.calls, []);
  f.hooks.callAll("updateActorDelta", { parent: token });
  await waitFor(
    () => __adventurerHud.actor === replacement && app.hudActions !== previous
  );
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.tokenUuid, token.uuid);
  await app.close();
});
