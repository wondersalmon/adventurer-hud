import assert from "node:assert/strict";
import test from "node:test";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import { focusHudToken, hudSceneTokens } from "../scripts/hud/token-focus.js";
import {
  getSetting,
  SETTINGS,
  settingRefreshStrategy
} from "../scripts/settings.js";

restoreGlobalsAfterEach();

function fixture() {
  const actor = { id: "hero", uuid: "Actor.hero", isOwner: true };
  const scene = { id: "scene", tokens: new Map() };
  const calls = [];
  const token = {
    id: "hero",
    uuid: "Scene.scene.Token.hero",
    actor,
    parent: scene
  };
  scene.tokens.set(token.id, token);
  const placeable = {
    document: token,
    actor,
    visible: true,
    center: { x: 100, y: 200 },
    control: options => {
      calls.push(["control", options]);
      return true;
    }
  };
  globalThis.canvas = {
    scene,
    tokens: { controlled: [], get: id => (id === token.id ? placeable : null) },
    animatePan: async center => calls.push(["pan", center])
  };
  globalThis.game = { user: { isGM: false } };
  return { actor, scene, token, placeable, calls };
}

test("companion autofocus defaults to enabled and changes without reopening the HUD", () => {
  installSettings();
  assert.equal(getSetting(SETTINGS.companionAutoFocus), true);
  assert.equal(settingRefreshStrategy(SETTINGS.companionAutoFocus), "none");
});

test("focus selects only the displayed token and delegates vision and panning to Foundry", async () => {
  const f = fixture();
  assert.equal(await focusHudToken({ actor: f.actor }), null);
  assert.deepEqual(f.calls, [
    ["control", { releaseOthers: true }],
    ["pan", f.placeable.center]
  ]);
});

test("scene focus rejects missing, off-scene and replaced tokens, even with shared actor UUIDs", async () => {
  const f = fixture();
  const context = { actor: f.actor, token: f.token };
  f.token.parent = { id: "other-scene" };
  assert.equal(await focusHudToken(context), "Actor.TokenNotOnScene");
  f.token.parent = f.scene;
  f.scene.tokens.delete(f.token.id);
  assert.equal(await focusHudToken(context), "Actor.TokenNotOnScene");
  f.scene.tokens.set(f.token.id, { ...f.token, actor: { ...f.actor } });
  assert.deepEqual(hudSceneTokens(context), []);
  assert.deepEqual(hudSceneTokens({ actor: f.actor }), []);
  f.scene.tokens.set(f.token.id, f.token);
  f.placeable.document = { ...f.token };
  assert.equal(await focusHudToken(context), "Actor.TokenNotOnScene");
  assert.deepEqual(f.calls, []);
});

test("focus rechecks ownership, GM-hidden tokens and native control refusal before panning", async () => {
  const f = fixture();
  f.actor.isOwner = false;
  assert.equal(
    await focusHudToken({ actor: f.actor }),
    "Warnings.NoPermission"
  );
  f.actor.isOwner = true;
  f.token.hidden = true;
  assert.equal(
    await focusHudToken({ actor: f.actor }),
    "Warnings.NoPermission"
  );
  f.token.hidden = false;
  f.placeable.control = () => false;
  assert.equal(
    await focusHudToken({ actor: f.actor }),
    "Warnings.NoPermission"
  );
  assert.deepEqual(f.calls, []);
});

test("focus can select an owned token outside the currently controlled token's vision", async () => {
  const f = fixture();
  const summon = { document: { uuid: "Scene.scene.Token.summon" } };
  canvas.tokens.controlled = [summon];
  f.placeable.visible = false;
  f.placeable.control = options => {
    if (!options.force) return false;
    f.calls.push(["control", options]);
    canvas.tokens.controlled = [f.placeable];
    return true;
  };
  assert.equal(await focusHudToken({ actor: f.actor, token: f.token }), null);
  assert.deepEqual(canvas.tokens.controlled, [f.placeable]);
  assert.deepEqual(f.calls, [
    ["control", { releaseOthers: true, force: true }],
    ["pan", f.placeable.center]
  ]);
  // Being owned does not make a deliberately hidden token selectable by players.
  f.calls.length = 0;
  f.token.hidden = true;
  assert.equal(
    await focusHudToken({ actor: f.actor }),
    "Warnings.NoPermission"
  );
  assert.deepEqual(f.calls, []);
});

test("multiple hero tokens require an exact context or a single already selected token", async () => {
  const f = fixture();
  f.scene.tokens.set("other", {
    ...f.token,
    id: "other",
    uuid: "Scene.scene.Token.other"
  });
  assert.equal(await focusHudToken({ actor: f.actor }), "Warnings.OneToken");
  assert.deepEqual(f.calls, []);
  canvas.tokens.controlled = [f.placeable];
  assert.equal(await focusHudToken({ actor: f.actor }), null);
  assert.equal(f.calls.length, 2);
  canvas.tokens.controlled = [];
  assert.equal(await focusHudToken({ actor: f.actor, token: f.token }), null);
  assert.equal(f.calls.length, 4);
});

test("player ping delegates to native canvas without changing selection or camera and rejects lost ownership", async () => {
  const f = fixture();
  canvas.ping = async center => f.calls.push(["ping", center]);
  assert.equal(
    await focusHudToken(
      { actor: f.actor, token: f.token },
      { ping: true, pan: false }
    ),
    null
  );
  assert.deepEqual(f.calls, [["ping", f.placeable.center]]);
  f.actor.isOwner = false;
  assert.equal(
    await focusHudToken({ actor: f.actor, token: f.token }, { ping: true }),
    "Warnings.NoPermission"
  );
  assert.equal(f.calls.length, 1);
});
