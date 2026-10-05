import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { SETTINGS } from "../scripts/settings.js";
import { diagnosticReport } from "../scripts/diagnostics.js";
import {
  familiarFixture,
  combatFor,
  fixture,
  target
} from "./helpers/companions.mjs";

restoreGlobalsAfterEach();

test("world-character HUD shares sight through its unlinked caster token on its own turn", async () => {
  const f = await fixture({ values: { language: "ru" } });
  const hero = f.token(f.actor, "hero"),
    familiar = f.token(f.npc(), "owl");
  const { combat, entries } = combatFor(f, [hero, familiar]);
  Object.assign(combat, {
    combatant: entries[0],
    round: 1,
    turn: 0,
    turns: entries
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.equal(__adventurerHud.actor, f.actor);
  await app.hudActions.togglecompanions();
  const eye = () =>
    app.element.querySelector('[data-action="companionvision"]');
  assert.equal(eye().disabled, false);
  await app.hudActions.companionvision(null, target(familiar.uuid));
  assert.equal(eye().getAttribute("aria-pressed"), "true");
  assert.equal(__adventurerHud.actor, f.actor);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document),
    [hero]
  );
  await app.hudActions.companionvisionstop();
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document),
    [hero]
  );
  familiar.sight.enabled = false;
  f.hooks.callAll("updateToken", familiar, {});
  await waitFor(() => eye().disabled);
  assert.match(eye().title, /зрение|vision/i);
  familiar.sight.enabled = true;
  combat.combatant = entries[1];
  f.hooks.callAll("updateCombat", combat, {});
  await waitFor(() => /бонусн|Bonus Action/i.test(eye().title));
  assert.equal(app.element.querySelector(".ws-companion-status"), null);
  combat.combatant = entries[0];
  f.hooks.callAll("updateCombat", combat, {});
  await waitFor(() => !eye().disabled);
  await app.close();
});

test("familiar sight adds native senses, stays in the caster HUD, glows green and restores the exact unseen caster", async () => {
  const f = await familiarFixture();
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  assert.equal(
    f.app.element.querySelectorAll('[data-action="companionvision"]').length,
    2
  );
  const hp = structuredClone(f.actor.system.attributes.hp);
  const sight = structuredClone(f.familiar.sight);
  f.placeables.get(f.familiar.id).visible = false;
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(__adventurerHud.tokenUuid, f.hero.uuid);
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  assert.ok(f.app.element.querySelector(".ws-familiar-vision"));
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  assert.deepEqual(f.calls, [
    ["control", f.hero.uuid],
    ["pan", f.placeables.get(f.familiar.id).center]
  ]);
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid, f.familiar.uuid]);
  assert.equal(
    f.visionSources.get(f.familiar.uuid).object,
    f.placeables.get(f.familiar.id)
  );
  await f.app.hudActions.combatmode();
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  f.placeables.get(f.hero.id).visible = false;
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  assert.equal(f.app.element.querySelector(".ws-familiar-vision"), null);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  assert.deepEqual(f.actor.system.attributes.hp, hp);
  assert.deepEqual(f.familiar.sight, sight);
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid]);
  assert.equal(
    f.calls.some(call => call[0] === "update"),
    false
  );
  await f.app.close();
});

test("2024 familiar sight is a caster-turn bonus action and expires at the caster's next turn, including a single-combatant round", async () => {
  const f = await familiarFixture();
  const { combat, entries } = combatFor(f, [f.hero, f.familiar]);
  Object.assign(combat, {
    round: 1,
    turn: 1,
    combatant: entries[1],
    turns: entries
  });
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  assert.deepEqual(f.calls, []);
  Object.assign(combat, { turn: 0, combatant: entries[0] });
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  f.hooks.callAll("updateCombat", combat, { initiative: 1 });
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  Object.assign(combat, { turn: 1, combatant: entries[1] });
  f.hooks.callAll("updateCombat", combat, { turn: 1 });
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  Object.assign(combat, { round: 2, turn: 0, combatant: entries[0] });
  f.hooks.callAll("updateCombat", combat, { round: 2, turn: 0 });
  await waitFor(() => f.eye().getAttribute("aria-pressed") === "false");
  assert.equal(f.visionSources.has(f.familiar.uuid), false);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  combat.combatants = combat.turns = [entries[0]];
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  combat.round = 3;
  f.hooks.callAll("updateCombat", combat, { round: 3 });
  await waitFor(() => f.eye().getAttribute("aria-pressed") === "false");
  await f.app.close();
});

test("exploration familiar sight uses advanced game time and closing or manual actor focus releases it", async () => {
  const f = await familiarFixture();
  const baseline = f.callbacks.size;
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  game.time.worldTime = 105;
  f.hooks.callAll("updateWorldTime", 105);
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  game.time.worldTime = 106;
  f.hooks.callAll("updateWorldTime", 106);
  await waitFor(() => f.eye().getAttribute("aria-pressed") === "false");
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  await f.app.hudActions.actorcenter();
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  const oldActions = f.app.hudActions;
  await f.api.open(f.actor);
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(canvas.tokens.controlled.length, 1);
  await oldActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(canvas.tokens.controlled.length, 1);
  const nextApp = __adventurerHud.app;
  await nextApp.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(canvas.tokens.controlled.length, 1);
  assert.ok(f.visionSources.has(f.familiar.uuid));
  await nextApp.close();
  assert.equal(canvas.tokens.controlled.length, 1);
  assert.ok(f.callbacks.size < baseline);
});

test("familiar sight rejects unavailable senses and ends when HP, permissions or selection changes", async t => {
  for (const reason of ["vision", "hp", "permission", "selection", "scene"]) {
    await t.test(reason, async () => {
      const f = await familiarFixture();
      if (reason === "vision") {
        f.familiar.sight.enabled = false;
        await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
        assert.deepEqual(f.calls, []);
      } else {
        await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
        if (reason === "hp") {
          f.familiar.actor.system.attributes.hp.value = 0;
          f.hooks.callAll("updateActor", f.familiar.actor, {});
        }
        if (reason === "permission") {
          f.familiar.actor.isOwner = false;
          f.hooks.callAll("updateActor", f.familiar.actor, {});
        }
        if (reason === "selection")
          f.placeables.get(f.summon.id).control({ releaseOthers: true });
        if (reason === "scene") {
          canvas.scene = { id: "elsewhere", tokens: itemCollection() };
          f.hooks.callAll("canvasReady");
        }
        await waitFor(
          () => !f.app.element.querySelector(".ws-familiar-vision")
        );
        if (reason === "selection")
          assert.deepEqual(
            canvas.tokens.controlled.map(p => p.document.uuid),
            [f.summon.uuid]
          );
      }
      await f.app.close();
    });
  }
});

test("stopping shared senses during camera animation keeps the button off and stale activation cannot reclaim tokens", async () => {
  const f = await familiarFixture();
  const animations = [];
  canvas.animatePan = () => new Promise(resolve => animations.push(resolve));
  const starting = f.app.hudActions.companionvision(
    null,
    target(f.familiar.uuid)
  );
  await waitFor(() => animations.length === 1);
  const finishing = f.app.hudActions.companionvisionstop();
  await waitFor(() => canvas.tokens.controlled.length === 1);
  animations.forEach(resolve => resolve());
  await Promise.all([starting, finishing]);
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  await f.app.close();
  assert.equal(canvas.tokens.controlled.length, 1);
});

test("shared sight follows native token movement and special senses while only the caster is selected", async () => {
  const f = await familiarFixture();
  const familiar = f.placeables.get(f.familiar.id);
  const original = familiar._isVisionSource;
  f.familiar.sight = {
    enabled: true,
    range: 60,
    visionMode: "darkvision",
    angle: 180
  };
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid, f.familiar.uuid]);
  assert.deepEqual(
    f.visionSources.get(f.familiar.uuid).sight,
    f.familiar.sight
  );
  assert.equal(f.visionSources.has(f.summon.uuid), false);
  // Foundry reinitializes the token's source during movement and canvas refresh.
  familiar.center = { x: 900, y: 400 };
  familiar.initializeVisionSource();
  assert.deepEqual(f.visionSources.get(f.familiar.uuid).center, {
    x: 900,
    y: 400
  });
  canvas.perception.update({ initializeVision: true });
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid, f.familiar.uuid]);
  const before = { ...familiar.center };
  for (const selected of canvas.tokens.controlled) selected.center.x += 100;
  assert.deepEqual(familiar.center, before);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  await f.app.hudActions.companionvisionstop();
  assert.equal(familiar._isVisionSource, original);
  assert.equal(Object.hasOwn(familiar, "_isVisionSource"), false);
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid]);
  await f.app.close();
});

test("manual familiar selection ends sharing and retains its ordinary native vision and control", async () => {
  const f = await familiarFixture();
  const familiar = f.placeables.get(f.familiar.id),
    original = familiar._isVisionSource;
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  familiar.control({ releaseOthers: true });
  await waitFor(() => !f.app.element.querySelector(".ws-familiar-vision"));
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.familiar.uuid]
  );
  assert.equal(familiar._isVisionSource, original);
  assert.deepEqual([...f.visionSources.keys()], [f.familiar.uuid]);
  await f.app.close();
});

test("canvas teardown restores native eligibility before the scene's sources are discarded", async () => {
  const f = await familiarFixture();
  const familiar = f.placeables.get(f.familiar.id),
    original = familiar._isVisionSource;
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  f.hooks.callAll("canvasTearDown", canvas);
  assert.equal(familiar._isVisionSource, original);
  assert.equal(f.visionSources.has(f.familiar.uuid), false);
  canvas.ready = false;
  canvas.scene = { id: "new", tokens: itemCollection() };
  f.visionSources.clear();
  f.hooks.callAll("canvasReady", canvas);
  await waitFor(() => !f.app.element.querySelector(".ws-familiar-vision"));
  assert.equal(f.visionSources.size, 0);
  await f.app.close();
});

test("another module's later eligibility wrapper survives stopping without keeping shared sight active", async () => {
  const f = await familiarFixture();
  const familiar = f.placeables.get(f.familiar.id);
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  const shared = familiar._isVisionSource;
  const later = function (...args) {
    return shared.apply(this, args);
  };
  familiar._isVisionSource = later;
  await f.app.hudActions.companionvisionstop();
  assert.equal(familiar._isVisionSource, later);
  assert.equal(familiar._isVisionSource(), false);
  assert.equal(f.visionSources.has(f.familiar.uuid), false);
  await f.app.close();
});

test("missing native vision APIs disable sharing, and source initialization failure restores native eligibility", async t => {
  t.mock.method(console, "error", () => {});
  const f = await familiarFixture();
  const familiar = f.placeables.get(f.familiar.id),
    original = familiar._isVisionSource;
  const initialize = familiar.initializeVisionSource;
  familiar.initializeVisionSource = null;
  f.hooks.callAll("updateToken", f.familiar, {});
  await waitFor(() => f.eye().disabled);
  assert.ok(
    diagnosticReport().history.some(
      event =>
        event.scope === "hud.vision.availability" &&
        event.reason === "Companions.VisionUnsupported" &&
        event.data.missing.includes("Token.initializeVisionSource")
    )
  );
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.deepEqual(f.calls, []);
  familiar.initializeVisionSource = initialize;
  f.hooks.callAll("updateToken", f.familiar, {});
  await waitFor(() => !f.eye().disabled);
  familiar.initializeVisionSource = function () {
    if (this._isVisionSource())
      throw new Error("Native vision initialization failed");
    return initialize.call(this);
  };
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.ok(
    diagnosticReport().events.some(
      event => event.scope === "hud.action.companionvision"
    )
  );
  assert.equal(familiar._isVisionSource, original);
  assert.equal(f.eye().getAttribute("aria-pressed"), "false");
  assert.equal(f.visionSources.has(f.familiar.uuid), false);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  familiar.initializeVisionSource = initialize;
  await f.app.close();
});

test("return and manual focus switch to owned tokens outside the current vision in both modes", async () => {
  for (const mode of ["normal", "combatmode"]) {
    const f = await fixture({
      values: { companionAutoFocus: true, showModeNavigation: true }
    });
    const hero = f.token(f.actor, "hero", true);
    const summon = f.token(f.npc(), "summon");
    canvas.tokens.controlled = [f.placeables.get(hero.id)];
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    await app.hudActions[mode]();
    await app.hudActions.opencompanion(null, target(summon.uuid));
    f.placeables.get(hero.id).visible = false;
    f.calls.length = 0;
    await app.hudActions.companionback();
    assert.equal(__adventurerHud.actor, f.actor);
    assert.equal(canvas.tokens.controlled[0].document, hero);
    assert.deepEqual(f.calls, [
      ["control", hero.uuid],
      ["pan", f.placeables.get(hero.id).center]
    ]);
    f.placeables.get(summon.id).visible = false;
    f.calls.length = 0;
    await app.hudActions.companionping(null, target(summon.uuid));
    assert.equal(canvas.tokens.controlled[0].document, hero);
    assert.deepEqual(f.calls, [["ping", f.placeables.get(summon.id).center]]);
    f.current.set(SETTINGS.companionAutoFocus, false);
    await app.hudActions.opencompanion(null, target(summon.uuid));
    await app.hudActions.actorcenter();
    assert.equal(canvas.tokens.controlled[0].document, summon);
    await app.hudActions.companionback();
    f.calls.length = 0;
    await app.hudActions.actorcenter();
    assert.equal(canvas.tokens.controlled[0].document, hero);
    assert.deepEqual(f.calls, [
      ["control", hero.uuid],
      ["pan", f.placeables.get(hero.id).center]
    ]);
    await app.close();
  }
});

test("shared senses can keep the camera still while retaining caster control and native vision", async () => {
  const f = await familiarFixture();
  f.current.set(SETTINGS.companionVisionPan, false);
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.eye().getAttribute("aria-pressed"), "true");
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid, f.familiar.uuid]);
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [f.hero.uuid]
  );
  await f.app.hudActions.companionvisionstop();
  assert.deepEqual([...f.visionSources.keys()], [f.hero.uuid]);
  assert.equal(
    f.calls.some(call => call[0] === "pan"),
    false
  );
  f.current.set(SETTINGS.companionVisionPan, true);
  await f.app.hudActions.companionvision(null, target(f.familiar.uuid));
  assert.equal(f.calls.filter(call => call[0] === "pan").length, 1);
  f.current.set(SETTINGS.companionVisionPan, false);
  await f.app.hudActions.companionvisionstop();
  assert.equal(f.calls.filter(call => call[0] === "pan").length, 1);
  await f.app.close();
});
