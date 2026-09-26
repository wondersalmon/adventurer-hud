import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { openActorPicker } from "../scripts/hud/actor-picker.js";
import {
  centeredWindowPosition,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "../scripts/hud/geometry.js";
import { syncHealthAppearance } from "../scripts/hud/health-feedback.js";
import {
  createRefreshScheduler,
  refreshHudView
} from "../scripts/hud/refresh.js";
import { applyHudSettingChange } from "../scripts/hud/settings-refresh.js";
import { subscribeHudDocuments } from "../scripts/hud/subscriptions.js";
import {
  createHudApplicationClass,
  syncPinControl
} from "../scripts/hud/window-controls.js";

class FakeClassList {
  #classes = new Set();

  add(...classes) {
    classes.forEach(value => this.#classes.add(value));
  }

  contains(value) {
    return this.#classes.has(value);
  }

  toggle(value, enabled) {
    if (enabled) this.#classes.add(value);
    else this.#classes.delete(value);
  }
}

restoreGlobalsAfterEach();

test("HUD becomes gray at zero HP and regains color after healing", () => {
  const element = { classList: new FakeClassList() };
  syncHealthAppearance(element, { value: 0 });
  assert.equal(element.classList.contains("ws-unconscious"), true);
  syncHealthAppearance(element, { value: 1 });
  assert.equal(element.classList.contains("ws-unconscious"), false);
});

test("actor picker escapes actor data and resolves the selected actor", async () => {
  let configuration;
  let selected;
  class DialogV2 {
    constructor(options) {
      configuration = options;
    }

    async close() {}

    render() {
      return this;
    }
  }
  const content = { innerHTML: "" };
  const actors = [{ id: 'hero" bad="yes', img: 'hero".webp', name: "<Hero>" }];

  openActorPicker({
    actors,
    DialogV2,
    document: { createElement: () => content },
    escapeHTML: value =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    lang: "en",
    onSelect: actor => {
      selected = actor;
    },
    t: key => key,
    viewportWidth: 1000
  });

  assert.match(content.innerHTML, /data-actor-id="hero&quot; bad=&quot;yes"/);
  assert.match(content.innerHTML, /&lt;Hero&gt;/);
  await configuration.actions.selectactor(null, {
    dataset: { actorId: actors[0].id }
  });
  assert.equal(selected, actors[0]);
});

const createButton = () => ({
  classList: new FakeClassList(),
  dataset: {},
  setAttribute(name, value) {
    this[name] = value;
  }
});

test("pin control is inserted before Foundry controls and updates in place", () => {
  const menu = createButton();
  const header = {
    control: null,
    querySelector(selector) {
      if (selector === '[data-action="togglepin"]') return this.control;
      if (selector.includes('button[data-action="toggleControls"]')) {
        return menu;
      }
      return null;
    }
  };
  menu.before = control => {
    header.control = control;
  };
  const document = { createElement: createButton };

  const control = syncPinControl({
    document,
    header,
    label: "Pin window",
    pinned: false
  });

  assert.equal(header.control, control);
  assert.equal(control.dataset.action, "togglepin");
  assert.equal(control["aria-pressed"], "false");
  assert.equal(control.classList.contains("fa-thumbtack-slash"), true);

  const updated = syncPinControl({
    document,
    header,
    label: "Unpin window",
    pinned: true
  });

  assert.equal(updated, control);
  assert.equal(control["aria-pressed"], "true");
  assert.equal(control.classList.contains("fa-thumbtack"), true);
  assert.equal(control.classList.contains("ws-active"), true);
  assert.equal(control.title, "Unpin window");
});

test("pinned HUD ignores Escape but still permits explicit close", async () => {
  class DialogV2 {
    async close(options) {
      this.closedWith = options;
      return "closed";
    }
  }

  let pinned = true;
  const HudApplication = createHudApplicationClass({
    DialogV2,
    document: {},
    getPinLabel: value => (value ? "Unpin" : "Pin"),
    isPinned: () => pinned
  });
  const app = new HudApplication();

  assert.equal(await app.close({ closeKey: true }), app);
  assert.equal(app.closedWith, undefined);

  pinned = false;
  assert.equal(await app.close({ closeKey: true }), "closed");
  assert.deepEqual(app.closedWith, { closeKey: true });
});

test("refresh scheduler coalesces updates and keeps the broadest region", () => {
  const callbacks = [];
  const refreshes = [];
  const scheduler = createRefreshScheduler(
    region => refreshes.push(region ?? "full"),
    {
      requestFrame(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelFrame() {}
    }
  );

  scheduler.schedule("actions");
  scheduler.schedule("actions");
  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  assert.deepEqual(refreshes, ["actions"]);

  scheduler.schedule("actions");
  scheduler.schedule();
  callbacks.shift()();
  assert.deepEqual(refreshes, ["actions", "full"]);
});

test("HUD refresh follows combat changes and shows a newly rolled initiative", () => {
  let mode = "regular";
  let initiative = null;
  const shell = { innerHTML: "" };
  const title = { textContent: "" };
  const app = {
    rendered: true,
    element: {
      querySelector: selector =>
        selector === ".ws-shell"
          ? shell
          : selector === ".window-title"
            ? title
            : null
    }
  };
  const hudState = { currentView: "main" };
  const options = {
    app,
    availableViews: () => ({ spells: false }),
    hudState,
    renderers: {
      combat: () => `<div>Initiative ${initiative ?? "—"}</div>`,
      regular: () => "<div>Exploration</div>"
    },
    setView() {},
    title: "Rook"
  };

  refreshHudView({ ...options, mode });
  assert.match(shell.innerHTML, /Exploration/);

  mode = "combat";
  refreshHudView({ ...options, mode });
  assert.match(shell.innerHTML, /Initiative —/);

  initiative = 26;
  refreshHudView({ ...options, mode });
  assert.match(shell.innerHTML, /Initiative 26/);

  mode = "regular";
  refreshHudView({ ...options, mode });
  assert.match(shell.innerHTML, /Exploration/);
  assert.equal(title.textContent, "Rook");
});

test("runtime and content settings update an open HUD without reopening it", () => {
  const calls = [];
  const app = {
    rendered: true,
    applySetting: (key, value) => calls.push(["runtime", key, value]),
    refreshFromSettings: () => calls.push(["content"])
  };
  const options = {
    app,
    refreshControls: () => calls.push(["controls"]),
    reopen: () => calls.push(["reopen"])
  };

  applyHudSettingChange({
    ...options,
    key: "pinWindow",
    strategy: "runtime",
    value: true
  });
  applyHudSettingChange({
    ...options,
    key: "showSearch",
    strategy: "content",
    value: false
  });
  applyHudSettingChange({
    ...options,
    key: "fontSize",
    strategy: "reopen",
    value: "large"
  });

  assert.deepEqual(calls, [
    ["runtime", "pinWindow", true],
    ["content"],
    ["reopen"]
  ]);
});

test("document subscriptions filter actor documents and clean up hooks", () => {
  const callbacks = new Map();
  const removed = [];
  const hooks = {
    on(name, callback) {
      callbacks.set(name, callback);
      return `${name}-id`;
    },
    off(name, id) {
      removed.push([name, id]);
    }
  };
  const refreshes = [];
  const unsubscribe = subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks,
    scheduleRefresh: region => refreshes.push(region ?? "full")
  });

  callbacks.get("updateActor")({ uuid: "Actor.other" });
  callbacks.get("updateActor")({ uuid: "Actor.hero" });
  callbacks.get("updateActiveEffect")({ parent: { uuid: "Actor.hero" } });
  callbacks.get("updateItem")({ parent: { uuid: "Actor.other" } });
  callbacks.get("updateCombat")();
  callbacks.get("createCombatant")();
  callbacks.get("updateCombatant")();
  callbacks.get("deleteCombat")();

  assert.deepEqual(refreshes, ["full", "full", "full", "full", "full", "full"]);
  unsubscribe();
  assert.equal(removed.length, callbacks.size);
});

test("tool changes reload tool data while unrelated updates only refresh", () => {
  const callbacks = new Map();
  let reloads = 0;
  subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks: { on: (name, callback) => callbacks.set(name, callback), off() {} },
    onToolsChange: () => reloads++,
    scheduleRefresh() {}
  });
  callbacks.get("updateActor")(
    { uuid: "Actor.hero" },
    { system: { attributes: {} } }
  );
  callbacks.get("updateActor")(
    { uuid: "Actor.hero" },
    { system: { tools: {} } }
  );
  callbacks.get("updateActor")(
    { uuid: "Actor.hero" },
    { "system.tools.thief": 1 }
  );
  callbacks.get("createItem")({ type: "tool", parent: { uuid: "Actor.hero" } });
  callbacks.get("updateItem")({
    type: "weapon",
    parent: { uuid: "Actor.hero" }
  });
  callbacks.get("deleteItem")({
    type: "tool",
    parent: { uuid: "Actor.other" }
  });
  assert.equal(reloads, 3);
});

test("HP changes emit one subtle damage or healing signal", () => {
  const callbacks = new Map();
  let hp = { value: 10, temp: 3 };
  const changes = [];
  const unsubscribe = subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks: {
      on: (name, callback) => {
        callbacks.set(name, callback);
        return name;
      },
      off() {}
    },
    readHp: () => hp,
    onHpChange: kind => changes.push(kind),
    scheduleRefresh() {}
  });
  hp = { value: 10, temp: 1 };
  callbacks.get("updateActor")({ uuid: "Actor.hero" });
  hp = { value: 12, temp: 1 };
  callbacks.get("updateActor")({ uuid: "Actor.hero" });
  callbacks.get("updateActor")({ uuid: "Actor.other" });
  assert.deepEqual(
    changes.map(change => [change.kind, change.delta]),
    [
      ["damage", -2],
      ["heal", 2]
    ]
  );
  unsubscribe();
});

test("initiative request flashes only when own token enters combat without initiative", () => {
  const callbacks = new Map();
  const flashes = [];
  subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks: {
      on: (name, callback) => callbacks.set(name, callback),
      off() {}
    },
    isCurrentCombatant: combatant => combatant.id === "own",
    onInitiativeRequest: () => flashes.push("flash"),
    scheduleRefresh() {}
  });
  callbacks.get("createCombatant")({ id: "other", initiative: null });
  callbacks.get("createCombatant")({ id: "own", initiative: 15 });
  callbacks.get("createCombatant")({ id: "own", initiative: null });
  callbacks.get("updateCombatant")({ id: "own", initiative: null });
  assert.deepEqual(flashes, ["flash"]);
});

test("initiative result feedback follows combatant updates", () => {
  const callbacks = new Map();
  const feedback = [];
  subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks: { on: (name, callback) => callbacks.set(name, callback), off() {} },
    scheduleRefresh: () => feedback.push("refresh"),
    isCurrentCombatant: combatant => combatant.id === "own",
    onInitiativeRolled: () => feedback.push("initiative")
  });
  callbacks.get("updateCombatant")(
    { id: "other", initiative: 12 },
    { initiative: 12 }
  );
  callbacks.get("updateCombatant")(
    { id: "own", initiative: 12 },
    { initiative: 12 }
  );
  callbacks.get("updateCombatant")(
    { id: "own", initiative: null },
    { initiative: null }
  );
  assert.deepEqual(feedback, ["refresh", "refresh", "initiative", "refresh"]);
});

test("turn glow fires once each time the player's turn begins", () => {
  const callbacks = new Map();
  const feedback = [];
  let playersTurn = false;
  subscribeHudDocuments({
    actor: { uuid: "Actor.hero" },
    hooks: { on: (name, callback) => callbacks.set(name, callback), off() {} },
    scheduleRefresh: () => feedback.push("refresh"),
    isPlayersTurn: () => playersTurn,
    onTurnStart: () => feedback.push("turn")
  });

  callbacks.get("updateCombat")();
  playersTurn = true;
  callbacks.get("updateCombat")();
  callbacks.get("updateCombatant")({ id: "own" }, {});
  playersTurn = false;
  callbacks.get("updateCombat")();
  playersTurn = true;
  callbacks.get("updateCombat")();

  assert.deepEqual(feedback, [
    "refresh",
    "refresh",
    "turn",
    "refresh",
    "refresh",
    "refresh",
    "turn"
  ]);
});

test("regular subviews reset when switching to combat", () => {
  const shell = { innerHTML: "" };
  const app = {
    rendered: true,
    element: {
      querySelector: selector => (selector === ".ws-shell" ? shell : null)
    }
  };
  const hudState = { currentView: "inventory" };
  const views = [];
  const options = {
    app,
    availableViews: () => ({ inventory: true, skills: true }),
    hudState,
    mode: "regular",
    renderers: { regular: () => "<div>Exploration</div>" },
    setView: view => views.push(view),
    title: "Rook"
  };

  refreshHudView(options);
  assert.equal(hudState.currentView, "inventory");
  assert.deepEqual(views, ["inventory"]);

  refreshHudView({
    ...options,
    mode: "combat",
    renderers: { combat: () => "" }
  });
  assert.equal(hudState.currentView, "main");
});

test("window geometry is clamped, serialized, and centered", () => {
  assert.deepEqual(
    normalizeWindowGeometry(
      { left: 900, top: -20, width: 200, height: 1200 },
      {
        defaultWidth: 450,
        viewportHeight: 800,
        viewportWidth: 1000
      }
    ),
    { left: 730, top: 0, width: 270, height: 784 }
  );
  assert.deepEqual(storedWindowGeometry({ left: 10, top: 20, width: 330 }), {
    left: 10,
    top: 20,
    width: 330
  });
  assert.equal(storedWindowGeometry({ left: "invalid", top: 0 }), null);
  assert.deepEqual(
    centeredWindowPosition(
      { width: 400, height: 300 },
      { width: 1000, height: 700 }
    ),
    { left: 300, top: 200 }
  );
});
