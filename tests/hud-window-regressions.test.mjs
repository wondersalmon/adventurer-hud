import assert from "node:assert/strict";
import test from "node:test";
import { createHudActions } from "../scripts/hud/actions.js";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { SETTINGS } from "../scripts/settings.js";
import { diagnosticReport } from "../scripts/diagnostics.js";

restoreGlobalsAfterEach();

test("item previews use the displayed Actor and respond to live settings without reopening", async t => {
  const f = await hudFixture();
  f.actor.items.set("trait", {
    id: "trait",
    name: "Passive trait",
    type: "feat",
    system: { description: { value: "<p>Actor description</p>" } }
  });
  f.actor.system.favorites = [{ type: "item", id: ".Item.trait" }];
  foundry.applications.ux = {
    TextEditor: { implementation: { enrichHTML: async text => text } }
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const sessionElement = app.element;
  const create = document.createElement.bind(document);
  t.mock.method(document, "createElement", tag => {
    const node = create(tag);
    node.getBoundingClientRect = () => ({ height: 90 });
    return node;
  });
  const card = app.element.querySelector('[data-description-item-id="trait"]');
  card.getBoundingClientRect = () => ({ left: 20, right: 80, top: 40 });
  const show = () => {
    const event = new document.defaultView.Event("keydown", {
      bubbles: true,
      cancelable: true
    });
    Object.assign(event, { key: "F2" });
    card.querySelector("button").dispatchEvent(event);
  };
  show();
  await waitFor(() => app.element.querySelector(".ws-item-preview"));
  assert.equal(
    app.element.querySelector(".ws-item-preview-body").textContent,
    "Actor description"
  );
  const originalActions = app.hudActions;
  await game.settings.set(
    "adventurer-hud",
    SETTINGS.showItemDescriptions,
    false
  );
  await waitFor(() => !app.element.querySelector(".ws-item-preview"));
  assert.equal(app.hudActions, originalActions);
  show();
  await waitFor(() => app.element.querySelector(".ws-item-preview"));
  await app.close();
  assert.equal(sessionElement.querySelector(".ws-item-preview"), null);
  show();
  await Promise.resolve();
  assert.equal(sessionElement.querySelector(".ws-item-preview"), null);
  assert.deepEqual(f.notifications, []);
});

test("item context gestures route descriptions and clean up when the session closes", async () => {
  const f = await hudFixture();
  const calls = [];
  f.actor.items.set("item", {
    id: "item",
    name: "Item",
    type: "feat",
    system: {},
    sheet: { render: () => calls.push("sheet") },
    displayCard: () => calls.push("chat")
  });
  f.actor.system.favorites = [{ type: "item", id: ".Item.item" }];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const child = app.element.querySelector(
    ".ws-favorites .ws-combat-item strong"
  );
  const gesture = (type, options = {}) => {
    const event = new document.defaultView.Event(type, {
      bubbles: true,
      cancelable: true
    });
    Object.assign(event, options);
    child.dispatchEvent(event);
    return event;
  };
  assert.equal(
    gesture("contextmenu", { button: 2, shiftKey: false }).defaultPrevented,
    true
  );
  assert.equal(
    gesture("contextmenu", { button: 2, shiftKey: true }).defaultPrevented,
    true
  );
  await Promise.resolve();
  assert.deepEqual(calls, ["sheet", "chat"]);
  assert.equal(
    gesture("contextmenu", { button: 0, shiftKey: true }).defaultPrevented,
    false
  );
  assert.deepEqual(calls, ["sheet", "chat"]);
  assert.equal(
    gesture("keydown", { key: "F10", shiftKey: true }).defaultPrevented,
    false
  );
  assert.deepEqual(calls, ["sheet", "chat"]);
  assert.equal(
    gesture("keydown", { key: "ContextMenu" }).defaultPrevented,
    true
  );
  assert.deepEqual(calls, ["sheet", "chat", "sheet"]);
  assert.equal(gesture("keydown", { key: "Enter" }).defaultPrevented, false);
  await app.close();
  gesture("contextmenu", { button: 2, shiftKey: false });
  gesture("keydown", { key: "ContextMenu" });
  assert.deepEqual(calls, ["sheet", "chat", "sheet"]);
  assert.deepEqual(f.notifications, []);
});

for (const isGM of [false, true]) {
  test(`closed ${isGM ? "GM" : "player"} HUD stays closed at page startup and manual opening clears the preference`, async () => {
    const f = await hudFixture({
      isGM,
      values: { autoOpenHud: true, hudClosed: true }
    });
    f.hooks.callAll("ready");
    assert.equal(__adventurerHud.app?.rendered ?? false, false);
    await f.api.open(isGM ? undefined : f.actor);
    assert.equal(
      game.settings.get("adventurer-hud", SETTINGS.hudClosed),
      false
    );
    const app = __adventurerHud.app;
    await app.close();
    assert.equal(game.settings.get("adventurer-hud", SETTINGS.hudClosed), true);
  });
}

test("GM right-click routes the addressed card and removes its handler on close", async () => {
  const f = await hudFixture({ isGM: true });
  await f.api.open();
  const app = __adventurerHud.app;
  const card = document.createElement("button");
  card.dataset.resetInitiativeId = "creature";
  const child = document.createElement("span");
  card.append(child);
  app.element.append(card);
  const addressed = [];
  app.hudActions.gmresetcombatantinitiative = (_event, target) =>
    addressed.push(target.dataset.resetInitiativeId);
  const click = () => {
    const event = new document.defaultView.Event("contextmenu", {
      bubbles: true,
      cancelable: true
    });
    child.dispatchEvent(event);
    return event;
  };
  assert.equal(click().defaultPrevented, true);
  assert.deepEqual(addressed, ["creature"]);
  await app.close();
  click();
  assert.deepEqual(addressed, ["creature"]);
});

test("player defaults open a narrow panel at the lower left", async () => {
  const f = await hudFixture();
  window.innerWidth = 788;
  window.innerHeight = 1597;
  await f.api.open(f.actor);
  assert.deepEqual(__adventurerHud.app.position, {
    width: 320,
    height: 830,
    left: 0,
    top: 623
  });
  await __adventurerHud.app.close();
});

test("GM defaults follow the screenshot proportions and sit above the bottom edge", async () => {
  for (const viewport of [
    { width: 2048, height: 875 },
    { width: 1366, height: 768 },
    { width: 640, height: 480 }
  ]) {
    const f = await hudFixture({ isGM: true });
    window.innerWidth = viewport.width;
    window.innerHeight = viewport.height;
    await f.api.open();
    const app = __adventurerHud.app;
    const { width, height, left, top } = app.position;
    assert.equal(width, Math.round(viewport.width * 0.78));
    assert.equal(height, Math.round(viewport.height * 0.45));
    assert.ok(Math.abs(left + width / 2 - viewport.width / 2) <= 0.5);
    assert.equal(top + height, viewport.height - 16);
    await app.close();
  }
});

test("GM search and category preferences apply live, retain spells and leave player mode unchanged", async () => {
  const f = await hudFixture({ isGM: true });
  canvas.scene = { id: "scene" };
  const actor = { ...f.actor, type: "npc", uuid: "Actor.monster" };
  actor.items = itemCollection([
    {
      id: "sword",
      name: "Sword",
      type: "weapon",
      parent: actor,
      system: {
        activities: [
          { id: "attack", type: "attack", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "spell",
      name: "Spell",
      type: "spell",
      parent: actor,
      system: {
        level: 1,
        activities: [
          { id: "cast", type: "save", activation: { type: "action" } }
        ]
      }
    }
  ]);
  const token = {
    id: "monster",
    uuid: "Scene.scene.Token.monster",
    parent: canvas.scene,
    actor
  };
  const entry = {
    id: "monster",
    sceneId: "scene",
    tokenId: token.id,
    actorId: actor.id,
    token,
    actor,
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    turns: [entry],
    combatant: entry,
    combatants: itemCollection([entry])
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  const app = __adventurerHud.app;
  const search = () => app.element.querySelector('[data-action="searchitems"]');
  const tabs = () =>
    [...app.element.querySelectorAll('[data-action="combatfilter"]')].map(
      button => button.dataset.category
    );
  assert.equal(search(), null);
  assert.deepEqual(tabs(), ["action"]);
  assert.ok(app.element.querySelector('[data-item-id="spell"]'));
  await game.settings.set("adventurer-hud", SETTINGS.gmHideSearch, false);
  assert.ok(search());
  search().value = "no item matches";
  search().dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true })
  );
  assert.equal(app.element.querySelector('[data-item-id="spell"]'), null);
  await game.settings.set("adventurer-hud", SETTINGS.gmHideSearch, true);
  assert.equal(search(), null);
  assert.ok(app.element.querySelector('[data-item-id="spell"]'));
  await game.settings.set("adventurer-hud", SETTINGS.gmActionTypesOnly, false);
  assert.ok(tabs().includes("weapons"));
  assert.ok(tabs().includes("spells"));
  await game.settings.set("adventurer-hud", SETTINGS.showActionTypes, false);
  await game.settings.set("adventurer-hud", SETTINGS.gmActionTypesOnly, true);
  assert.deepEqual(tabs(), ["action"]);
  assert.ok(app.element.querySelector('[data-item-id="spell"]'));
  assert.equal(__adventurerHud.app, app);
  await app.close();
  await game.settings.set("adventurer-hud", SETTINGS.gmEnabled, false);
  game.combat = null;
  game.combats = itemCollection();
  await f.api.open(f.actor);
  await __adventurerHud.app.options.actions.regularview(null, {
    dataset: { view: "inventory" }
  });
  assert.ok(
    __adventurerHud.app.element.querySelector('[data-action="searchitems"]')
  );
  await __adventurerHud.app.close();
});

test("GM and player restore and retain independent dimensions and pins across mode switches", async () => {
  const playerGeometry = { left: 20, top: 30, width: 300, height: 450 };
  const gmGeometry = { left: 70, top: 80, width: 900, height: 400 };
  const f = await hudFixture({
    isGM: true,
    values: {
      windowGeometry: playerGeometry,
      gmWindowGeometry: gmGeometry,
      pinWindow: false,
      gmPinWindow: true
    }
  });
  game.user.character = f.actor;
  await f.api.open();
  const gm = __adventurerHud.app;
  assert.deepEqual(gm.position, gmGeometry);
  assert.equal(gm.hudPinState(), true);
  await gm.options.actions.togglepreset();
  await waitFor(
    () => __adventurerHud.preset === "player" && __adventurerHud.app?.rendered
  );
  const player = __adventurerHud.app;
  assert.deepEqual(player.position, playerGeometry);
  assert.equal(player.hudPinState(), false);
  player.element.getBoundingClientRect = () => ({ width: 320, height: 550 });
  player.setPosition({ width: 320, height: 550 });
  player.listeners.get("position")();
  await player.options.actions.togglepin();
  assert.equal(game.settings.get("adventurer-hud", "gmPinWindow"), true);
  await player.options.actions.togglepreset();
  await waitFor(
    () => __adventurerHud.preset === "gm" && __adventurerHud.app?.rendered
  );
  const restoredGm = __adventurerHud.app;
  assert.deepEqual(restoredGm.position, gmGeometry);
  await restoredGm.options.actions.togglepin();
  assert.equal(game.settings.get("adventurer-hud", "pinWindow"), true);
  assert.equal(game.settings.get("adventurer-hud", "gmPinWindow"), false);
  await restoredGm.options.actions.togglepreset();
  await waitFor(
    () => __adventurerHud.preset === "player" && __adventurerHud.app?.rendered
  );
  assert.equal(__adventurerHud.app.position.width, 320);
  assert.equal(__adventurerHud.app.position.height, 550);
  assert.equal(__adventurerHud.app.hudPinState(), true);
  await __adventurerHud.app.close();
});

for (const isGM of [false, true]) {
  test(`Escape closure is opt-in and independent of the ${isGM ? "GM" : "player"} pin`, async () => {
    const f = await hudFixture();
    game.user.isGM = isGM;
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    await app.close({ closeKey: true });
    assert.equal(app.rendered, true);
    await app.options.actions.togglepin();
    await app.close({ closeKey: true });
    assert.equal(app.rendered, true);
    await game.settings.set("adventurer-hud", SETTINGS.closeOnEscape, true);
    await app.close({ closeKey: true });
    assert.equal(app.rendered, false);
    await f.api.open(f.actor);
    await game.settings.set("adventurer-hud", SETTINGS.closeOnEscape, false);
    const reopened = __adventurerHud.app;
    await reopened.close();
    assert.equal(reopened.rendered, false);
    assert.equal(__adventurerHud.app, null);
  });
}

for (const isGM of [false, true]) {
  test(`pinning freezes position and dimensions of the ${isGM ? "GM" : "player"} window`, async () => {
    const f = await hudFixture({ isGM });
    await f.api.open(isGM ? undefined : f.actor);
    const app = __adventurerHud.app;
    app.element.getBoundingClientRect = () => ({ width: 450, height: 500 });
    const control = app.element.querySelector('[data-action="togglepin"]');
    assert.equal(app.hudPinState(), false);
    assert.equal(
      app.options.window.controls.some(
        entry => entry.action === "togglesizelock"
      ),
      false
    );
    const previous = { ...app.position };
    await app.options.actions.togglepin();
    assert.equal(app.options.window.resizable, false);
    assert.equal(control.getAttribute("aria-pressed"), "true");
    const request = { width: 270, height: 200, left: 40, top: 50 };
    app.setPosition(request);
    assert.equal(app.position.width, 450);
    assert.equal(app.position.height, 500);
    assert.equal(app.position.left, previous.left);
    assert.equal(app.position.top, previous.top);
    assert.equal(request.height, 200);
    const reset = app.options.actions.resetwindow();
    await reset;
    assert.equal(app.position.left, previous.left);
    assert.equal(app.position.width, 450);
    await app.options.actions.togglepin();
    app.setPosition({ width: 300, height: 100 });
    assert.equal(app.position.width, 300);
    assert.equal(app.position.height, isGM ? 180 : 350);
    assert.equal(app.options.window.resizable, true);
    assert.equal(control.getAttribute("aria-pressed"), "false");
    await app.options.actions.togglepin();
    await app.close();
    await f.api.open(isGM ? undefined : f.actor);
    assert.equal(__adventurerHud.app.hudPinState(), true);
    assert.equal(__adventurerHud.app.options.window.resizable, false);
    await __adventurerHud.app.close();
  });
}

test("player mode restores small saved windows at the requested 350px minimum", async () => {
  const f = await hudFixture({
    values: { windowGeometry: { left: 10, top: 10, width: 270, height: 220 } }
  });
  await f.api.open(f.actor);
  assert.equal(__adventurerHud.app.position.height, 350);
  assert.equal(
    __adventurerHud.app.element.classList.contains("ws-player-mode"),
    true
  );
  await __adventurerHud.app.close();
});

test("GM secondary toolbar actions toggle their accessible state without rendering", async () => {
  const f = await hudFixture({ isGM: true });
  await f.api.open();
  const app = __adventurerHud.app;
  const menu = document.createElement("div");
  menu.className = "ws-gm-more";
  menu.innerHTML =
    '<button class="ws-gm-more-toggle" aria-expanded="false"></button>';
  app.element.append(menu);
  const body = app.element.querySelector(".ws-shell").firstElementChild;
  app.options.actions.togglegmtools();
  assert.equal(menu.classList.contains("ws-expanded"), true);
  assert.equal(menu.firstElementChild.getAttribute("aria-expanded"), "true");
  app.options.actions.togglegmtools();
  assert.equal(menu.classList.contains("ws-expanded"), false);
  assert.equal(menu.firstElementChild.getAttribute("aria-expanded"), "false");
  assert.equal(app.element.querySelector(".ws-shell").firstElementChild, body);
  await app.close();
});

test("a missing player character keeps the GM window and saved preset consistent", async () => {
  const f = await hudFixture({ isGM: true });
  game.actors.clear();
  await f.api.open();
  const app = __adventurerHud.app;
  await app.options.actions.togglepreset();
  await waitFor(
    () =>
      f.notifications.length > 0 &&
      game.settings.get("adventurer-hud", "gmEnabled")
  );
  assert.equal(__adventurerHud.preset, "gm");
  assert.equal(__adventurerHud.app, app);
  assert.equal(app.rendered, true);
  assert.equal(f.notifications[0][0], "warn");
  await app.close();
});

test("canceling the player picker keeps GM mode; choosing commits the player preset", async () => {
  const f = await hudFixture({ isGM: true });
  const second = {
    ...f.actor,
    id: "second",
    uuid: "Actor.second",
    name: "Second"
  };
  game.actors.set(second.id, second);
  const created = [];
  const Base = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = class extends Base {
    constructor(options) {
      super(options);
      created.push(this);
    }
  };
  await f.api.open();
  const app = __adventurerHud.app;
  const picker = () =>
    created.findLast(dialog =>
      dialog.options.classes.includes("ws-actor-picker")
    );
  await app.options.actions.togglepreset();
  await waitFor(
    () => picker()?.rendered && game.settings.get("adventurer-hud", "gmEnabled")
  );
  await picker().close();
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.preset, "gm");
  await app.options.actions.togglepreset();
  await waitFor(
    () => picker()?.rendered && game.settings.get("adventurer-hud", "gmEnabled")
  );
  await picker().options.actions.selectactor(
    {},
    { dataset: { actorId: second.id } }
  );
  assert.equal(__adventurerHud.preset, "player");
  assert.equal(game.settings.get("adventurer-hud", "gmEnabled"), false);
  assert.equal(__adventurerHud.actor, second);
  await __adventurerHud.app.close();
});

test("typing in the middle of search preserves focus and the selection direction", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.options.actions.view({}, { dataset: { view: "inventory" } });
  const input = app.element.querySelector('[data-action="searchitems"]');
  input.value = "hero";
  Object.assign(input, {
    selectionStart: 1,
    selectionEnd: 3,
    selectionDirection: "backward"
  });
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    writable: true,
    value: input
  });
  const prototype = Object.getPrototypeOf(input);
  const priorFocus = prototype.focus;
  const priorSelection = prototype.setSelectionRange;
  const selections = [];
  prototype.focus = function () {
    document.activeElement = this;
  };
  prototype.setSelectionRange = function (...range) {
    selections.push([this, ...range]);
  };
  try {
    input.dispatchEvent(
      new document.defaultView.Event("input", { bubbles: true })
    );
    const next = app.element.querySelector('[data-action="searchitems"]');
    assert.notEqual(next, input);
    assert.equal(document.activeElement, next);
    assert.deepEqual(selections, [[next, 1, 3, "backward"]]);
  } finally {
    prototype.focus = priorFocus;
    if (priorSelection) prototype.setSelectionRange = priorSelection;
    else delete prototype.setSelectionRange;
    await app.close();
  }
});

test("stale GM selection blocks actor commands while window commands remain available", async () => {
  installSettings({ isGM: true });
  let settingsOpened = 0;
  game.settings.sheet = { rendered: true, render: () => settingsOpened++ };
  const calls = [];
  const actor = {
    uuid: "Actor.old",
    sheet: { render: () => calls.push("sheet") }
  };
  let selected = null;
  const actions = createHudActions({
    actor,
    gmCombatantId: "old",
    gmController: { isGM: () => true, sync: () => selected },
    canRollActor: true,
    adapter: { rollAbility: () => calls.push("roll") },
    performRoll: callback => callback(),
    togglePin: () => calls.push("pin"),
    resetWindow: () => calls.push("reset")
  });
  for (selected of [null, { id: "new", actor: { uuid: "Actor.new" } }]) {
    await actions.ability({}, { dataset: { type: "check", key: "str" } });
    await actions.gmsheet();
    await actions.togglepin();
    await actions.resetwindow();
    await actions.settings();
    await actions.togglemodes();
  }
  assert.deepEqual(calls, ["pin", "reset", "pin", "reset"]);
  assert.equal(settingsOpened, 2);
  selected = { id: "old", actor };
  await actions.ability({}, { dataset: { type: "check", key: "str" } });
  assert.equal(calls.at(-1), "roll");
});

test("empty GM refresh preserves visible preparation, collapsed roster and focus", async () => {
  const f = await hudFixture({ isGM: true });
  await f.api.open();
  const app = __adventurerHud.app;
  const setup = app.element.querySelector(".ws-gm-encounter-tools");
  app.element.querySelector(".ws-gm-list").open = false;
  const button = setup.querySelector('[data-action="gmaddcreatures"]');
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    value: button
  });
  const focused = [];
  const prototype = Object.getPrototypeOf(button);
  const previousFocus = prototype.focus;
  prototype.focus = function () {
    focused.push(this);
  };
  try {
    f.hooks.callAll("updateCombat", { id: "battle" }, { round: 1 });
    f.flushFrames();
    assert.equal(
      app.element.querySelector(".ws-gm-encounter-tools").tagName,
      "SECTION"
    );
    assert.equal(app.element.querySelector(".ws-gm-list").open, false);
    assert.equal(
      focused[0],
      app.element.querySelector(
        '.ws-gm-encounter-tools [data-action="gmaddcreatures"]'
      )
    );
    assert.notEqual(focused[0], button);
  } finally {
    prototype.focus = previousFocus;
    await app.close();
  }
});

test("one GM window keeps menus, pin state and subscriptions across empty and populated sessions", async () => {
  const f = await hudFixture({ isGM: true, values: { theme: "light" } });
  canvas.scene = { id: "scene" };
  await f.api.open();
  const app = __adventurerHud.app;
  const controls = app.options.window.controls.map(c => c.action);
  assert.ok(controls.includes("settings"));
  assert.equal(controls.includes("resetwindow"), false);
  await app.options.actions.togglepin();
  const hookCount = f.callbacks.size;
  const actor = {
    ...f.actor,
    type: "npc",
    uuid: "Scene.scene.Token.npc.Actor.hero"
  };
  const token = {
    id: "npc",
    uuid: "Scene.scene.Token.npc",
    parent: canvas.scene,
    actor
  };
  const entry = {
    id: "npc",
    sceneId: "scene",
    tokenId: "npc",
    actorId: actor.id,
    token,
    actor,
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    turns: [entry],
    combatant: entry,
    combatants: itemCollection([entry])
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, actor);
  assert.equal(app.hudPinState(), true);
  assert.equal(app.element.classList.contains("ws-theme-light"), true);
  assert.equal(f.callbacks.size, hookCount);
  assert.deepEqual(
    app.options.window.controls.map(c => c.action),
    controls
  );
  combat.turns = [];
  combat.combatants.clear();
  combat.combatant = null;
  await f.api.open();
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, null);
  assert.equal(app.hudPinState(), true);
  assert.equal(f.callbacks.size, hookCount);
  await app.options.actions.togglepin();
  assert.equal(game.settings.get("adventurer-hud", "gmPinWindow"), false);
  app.element.getBoundingClientRect = () => ({
    width: app.position.width,
    height: app.position.height
  });
  const reset = app.options.actions.resetwindow();
  f.flushFrames();
  await reset;
  assert.equal(app.position.width, 780);
  assert.equal(app.position.height, 360);
  assert.equal(app.position.left, 110);
  assert.equal(app.position.top, 424);
  assert.equal(__adventurerHud.position.width, 780);
  assert.deepEqual(f.notifications, []);
  await app.close();
  assert.ok(f.callbacks.size < hookCount);
});

for (const isGM of [false, true]) {
  test(`diagnostic reports collect resized HUD dimensions without a header badge in ${isGM ? "GM" : "player"} mode`, async () => {
    const f = await hudFixture({ isGM, values: { debugWindowSize: true } });
    await f.api.open(isGM ? undefined : f.actor);
    const app = __adventurerHud.app;
    app.setPosition({ width: 500, height: 650 });
    const first = diagnosticReport().context.panel;
    assert.equal(first.width, 500);
    assert.equal(first.height, 650);
    app.setPosition({ width: 300, height: 450 });
    const resized = diagnosticReport().context.panel;
    assert.equal(resized.width, 300);
    assert.equal(resized.height, 450);
    assert.equal(app.element.querySelector(".ws-window-size"), null);
    await app.close();
  });
}
