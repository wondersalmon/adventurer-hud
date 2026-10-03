import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import {
  ownedCompanions,
  resolveCompanion,
  companionNavigationContext
} from "../scripts/hud/companions/companions.js";
import { companionEffects } from "../scripts/hud/companions/companion-details.js";
import { fixture, target } from "./helpers/companions.mjs";

restoreGlobalsAfterEach();

test("roster scans the actor and token catalogs once and action resolution stays fresh", async t => {
  const f = await fixture();
  const actors = Array.from({ length: 500 }, (_, index) =>
    f.npc(`creature${index}`)
  );
  for (const actor of actors.slice(0, 10)) f.token(actor, actor.id);
  const nativeActors = game.actors.values.bind(game.actors);
  const nativeTokens = canvas.scene.tokens.values.bind(canvas.scene.tokens);
  let actorVisits = 0,
    tokenVisits = 0;
  t.mock.method(game.actors, "values", function* () {
    for (const actor of nativeActors()) {
      actorVisits++;
      yield actor;
    }
  });
  t.mock.method(canvas.scene.tokens, "values", function* () {
    for (const token of nativeTokens()) {
      tokenVisits++;
      yield token;
    }
  });
  const entries = await ownedCompanions(f.actor);
  assert.equal(entries.length, 500);
  assert.equal(actorVisits, 501);
  assert.equal(tokenVisits, 10);
  actors[20].isOwner = false;
  assert.equal(
    (await resolveCompanion(f.actor, { uuid: actors[20].uuid })).actor,
    null
  );
});

test("companion refresh ignores unrelated items and discovers ownership changes", async t => {
  const f = await fixture();
  const base = f.npc();
  f.token(base, "owl");
  const unrelated = f.npc("unrelated");
  unrelated.isOwner = false;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  let reads = 0;
  const values = game.actors.values.bind(game.actors);
  t.mock.method(game.actors, "values", () => {
    reads++;
    return values();
  });
  f.hooks.callAll("updateItem", { parent: unrelated });
  f.hooks.callAll("updateActiveEffect", { parent: { parent: unrelated } });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(reads, 0);
  f.hooks.callAll("updateItem", { parent: base });
  await waitFor(() => reads > 0);
  unrelated.isOwner = true;
  f.hooks.callAll("updateActor", unrelated, { ownership: {} });
  await app.hudActions.companionfilter(null, {
    dataset: { companionFilter: "all" }
  });
  await waitFor(
    () => app.element.querySelectorAll(".ws-companion-row").length === 2
  );
  await app.close();
});

test("automatic roster includes owned characters and NPCs once and excludes the assigned hero", async () => {
  const f = await fixture();
  const owl = f.npc(),
    ally = f.npc("ally"),
    denied = f.npc("denied"),
    otherHero = f.npc("otherHero");
  ally.type = otherHero.type = "character";
  denied.isOwner = false;
  game.user.character = otherHero;
  f.token(owl, "one");
  f.token(owl, "two");
  f.token(otherHero, "hero");
  const entries = await ownedCompanions(f.actor);
  assert.deepEqual(
    entries.map(entry => entry.uuid),
    [owl.uuid, ally.uuid]
  );
  assert.equal(entries[0].tokenOptions.length, 2);
  assert.equal(entries[0].actor, owl);
  assert.equal(
    (
      await resolveCompanion(
        f.actor,
        { uuid: owl.uuid },
        entries[0].tokenOptions[1].uuid
      )
    ).actor,
    entries[0].tokenOptions[1].actor
  );
  const unrelated = f.token(ally, "ally-token");
  assert.equal(
    (await resolveCompanion(f.actor, { uuid: owl.uuid }, unrelated.uuid)).actor,
    null
  );
  assert.equal(
    (
      await companionNavigationContext({
        ownerUuid: f.actor.uuid,
        companionUuid: denied.uuid
      })
    ).actor,
    f.actor
  );
});

test("token-only ownership retains exact synthetic identities without exposing the world actor", async () => {
  const f = await fixture();
  const base = f.npc();
  base.isOwner = false;
  const first = f.token(base, "first"),
    second = f.token(base, "second");
  first.actor.isOwner = second.actor.isOwner = true;
  const entries = await ownedCompanions(f.actor);
  assert.deepEqual(
    entries.map(entry => entry.uuid),
    [first.uuid, second.uuid]
  );
  assert.equal(entries[0].actor, first.actor);
  assert.equal(
    (await resolveCompanion(f.actor, { uuid: first.uuid }, second.uuid)).actor,
    null
  );
});

test("compact filters default to scene, list sheets for off-scene actors and update ownership live", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const off = f.npc("ally");
  off.type = "character";
  const owl = f.npc();
  f.token(owl, "owl");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const count = () => app.element.querySelectorAll(".ws-companion-row").length;
  assert.equal(count(), 1);
  assert.equal(
    app.element
      .querySelector('[data-companion-filter="scene"]')
      .getAttribute("aria-pressed"),
    "true"
  );
  assert.equal(app.hudActions.linkcompanion, undefined);
  assert.equal(app.hudActions.unlinkcompanion, undefined);
  assert.equal(app.hudActions.editcompanions, undefined);
  await app.hudActions.companionfilter(null, {
    dataset: { companionFilter: "all" }
  });
  assert.equal(count(), 2);
  assert.equal(
    app.element.querySelectorAll('[data-action="companionsheet"]').length,
    2
  );
  await app.hudActions.companionsheet(null, target(off.uuid));
  assert.deepEqual(f.calls, [["sheet", off.uuid]]);
  await app.hudActions.combatmode();
  assert.equal(count(), 2);
  off.isOwner = false;
  f.hooks.callAll("updateActor", off, { ownership: {} });
  await waitFor(() => count() === 1);
  await app.close();
  await f.api.open(f.actor);
  const next = __adventurerHud.app;
  assert.equal(
    next.element
      .querySelector('[data-companion-filter="scene"]')
      .getAttribute("aria-pressed"),
    "true"
  );
  await next.close();
});

test("companion effects include buffs and transferred effects, deduplicate statuses and omit inactive effects", async () => {
  await fixture();
  const blessing = {
    uuid: "ActiveEffect.buff",
    name: "Bless",
    img: "buff.svg",
    statuses: new Set()
  };
  const actor = {
    statuses: new Set(["poisoned"]),
    *allApplicableEffects() {
      yield {
        name: "Poison",
        statuses: new Set(["poisoned"]),
        img: "poison.svg"
      };
      yield blessing;
      yield blessing;
      yield { name: "Disabled", disabled: true, statuses: new Set() };
      yield {
        name: "Suppressed",
        isSuppressed: true,
        statuses: new Set(["stunned"])
      };
    }
  };
  assert.deepEqual(
    companionEffects(actor, {
      statusDefinitions: () => [
        { id: "poisoned", name: "Poisoned", img: "status.svg" }
      ]
    }).map(effect => [effect.name, effect.img]),
    [
      ["Poisoned", "status.svg"],
      ["Bless", "buff.svg"]
    ]
  );
});

test("losing ownership of the character invalidates companion access even when the NPC stays owned", async () => {
  const f = await fixture();
  const token = f.token(f.npc(), "owl");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(token.uuid));
  f.actor.isOwner = false;
  await app.hudActions.ability({}, { dataset: { type: "check", key: "str" } });
  assert.deepEqual(f.calls, []);
  f.hooks.callAll("updateActor", f.actor, { ownership: {} });
  await waitFor(() => __adventurerHud.actor === f.actor);
  assert.equal(app.element.querySelector(".ws-companions-panel"), null);
  assert.deepEqual(await ownedCompanions(f.actor), []);
  await app.close();
});

test("removed owner closes the panel and releases all companion subscriptions", async () => {
  const f = await fixture();
  const baseline = f.callbacks.size;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  game.actors.delete(f.actor.id);
  f.documents.delete(f.actor.uuid);
  f.hooks.callAll("deleteActor", f.actor);
  await waitFor(() => !app.rendered);
  assert.equal(__adventurerHud.app, null);
  assert.equal(f.callbacks.size, baseline);
});
