import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

test("skill/tool repeats retain native keys and separate character histories", async t => {
  const f = await hudFixture({
    values: { playerFooter: true, showCompanions: false }
  });
  let time = 0;
  t.mock.method(performance, "now", () => time);
  CONFIG.DND5E.skills = { prc: { label: "Perception" } };
  CONFIG.DND5E.tools = { thief: { label: "Thieves tools" } };
  f.actor.system.skills.prc = { prof: 1, total: 5, ability: "wis" };
  f.actor.system.tools.thief = { prof: 1, total: 5, ability: "dex" };
  const calls = [];
  f.actor.rollSkill = options => {
    calls.push(["skill", options]);
    return [{ total: 15 }];
  };
  f.actor.rollToolCheck = options => {
    calls.push(["tool", options]);
    return [{ total: 12 }];
  };
  await f.api.open(f.actor);
  let app = __adventurerHud.app;
  time += 1000;
  await app.hudActions.skill({ type: "click" }, { dataset: { key: "prc" } });
  time += 1000;
  await app.hudActions.tool({ type: "click" }, { dataset: { key: "thief" } });
  assert.deepEqual(
    [...app.element.querySelectorAll(".ws-recent-action")].map(node => [
      node.dataset.action,
      node.dataset.key
    ]),
    [
      ["tool", "thief"],
      ["skill", "prc"]
    ]
  );
  const event = { type: "click", altKey: true };
  time += 1000;
  await app.hudActions.tool(
    event,
    app.element.querySelector('.ws-recent-action[data-action="tool"]')
  );
  assert.deepEqual(calls.at(-1), ["tool", { tool: "thief", event }]);
  const another = {
    ...f.actor,
    id: "second",
    uuid: "Actor.second",
    name: "Second"
  };
  game.actors.set(another.id, another);
  await f.api.open(another);
  app = __adventurerHud.app;
  assert.equal(app.element.querySelectorAll(".ws-recent-action").length, 0);
  await f.api.open(f.actor);
  app = __adventurerHud.app;
  assert.equal(app.element.querySelectorAll(".ws-recent-action").length, 2);
  await app.close();
});

test("recent actions record only completed native rolls, repeat fresh events and survive mode/reopen", async t => {
  const f = await hudFixture({
    values: { playerFooter: true, showModeNavigation: true }
  });
  let time = 0,
    result = null;
  t.mock.method(performance, "now", () => time);
  const calls = [];
  f.actor.system.abilities = Object.fromEntries(
    ["str", "dex", "con", "wis"].map(key => [key, { value: 14 }])
  );
  f.actor.rollAbilityCheck = options => {
    calls.push(options);
    return result;
  };
  await f.api.open(f.actor);
  let app = __adventurerHud.app;
  const buttons = () => [
    ...app.element.querySelectorAll(".ws-footer-recent button")
  ];
  const roll = async (key, event = { type: "click" }) => {
    time += 1000;
    await app.hudActions.ability(event, { dataset: { type: "check", key } });
  };
  for (result of [null, false, undefined, []]) await roll("str");
  assert.equal(buttons().length, 0);
  result = [{ total: 14 }];
  for (const key of ["str", "dex", "con", "wis"]) await roll(key);
  assert.deepEqual(
    buttons().map(node => node.dataset.key),
    ["wis", "con", "dex"]
  );
  const event = { type: "click", shiftKey: true, altKey: true };
  time += 1000;
  await app.hudActions.ability(event, buttons()[2]);
  assert.equal(calls.at(-1).event, event);
  assert.deepEqual(
    buttons().map(node => node.dataset.key),
    ["dex", "wis", "con"]
  );
  await app.hudActions.combatmode();
  assert.deepEqual(
    buttons().map(node => node.dataset.key),
    ["dex", "wis", "con"]
  );
  await app.close();
  await f.api.open(f.actor);
  app = __adventurerHud.app;
  assert.equal(buttons().length, 3);
  f.actor.isOwner = false;
  time += 1000;
  const before = calls.length;
  await app.hudActions.ability(event, buttons()[0]);
  assert.equal(calls.length, before);
  await app.close();
});

test("recent activity repeats the selected activity, rejects stale sessions and removes deleted entries", async t => {
  const f = await hudFixture({ values: { playerFooter: true } });
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const calls = [];
  const activity = {
    id: "strike",
    name: "Strike",
    type: "attack",
    activation: { type: "action" },
    use: options => {
      calls.push(options);
      return { message: {} };
    }
  };
  const item = {
    id: "sword",
    name: 'Sword <b> & "test"',
    type: "weapon",
    img: "icons/svg/sword.svg",
    system: { equipped: true, activities: itemCollection([activity]) }
  };
  f.actor.items = itemCollection([item]);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  time += 1000;
  await app.hudActions.useactivity(
    { type: "click" },
    { dataset: { itemId: "sword", activityId: "strike" } }
  );
  const button = app.element.querySelector(".ws-recent-action");
  assert.ok(button);
  assert.equal(button.dataset.activityId, "strike");
  assert.equal(button.querySelector("b"), null);
  const event = { type: "click", ctrlKey: true };
  time += 1000;
  await app.hudActions.useactivity(event, button);
  assert.equal(calls.at(-1).event, event);
  assert.equal(app.element.querySelectorAll(".ws-recent-action").length, 1);
  f.actor.items = itemCollection([]);
  f.hooks.callAll("deleteItem", { parent: f.actor });
  f.flushFrames();
  assert.equal(app.element.querySelectorAll(".ws-recent-action").length, 0);
  await app.close();
  time += 1000;
  await app.hudActions.useactivity(event, button);
  assert.equal(calls.length, 2);
});
