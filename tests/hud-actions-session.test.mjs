import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { createHudActions } from "../scripts/hud/actions.js";
import { combatTurnState } from "../scripts/hud/actor-context.js";
import { getCurrentCombat } from "../scripts/runtime-helpers.js";
import { applyHudSettingChanges } from "../scripts/hud/settings-refresh.js";
import { activateHudWindow } from "../scripts/hud/window-session.js";

restoreGlobalsAfterEach();

test("extracted HUD actions forward roll events through the adapter", async () => {
  const calls = [];
  const event = { altKey: true };
  const actions = createHudActions({
    actor: { id: "hero" },
    adapter: {
      rollAbility: (actor, options) => {
        calls.push([actor.id, options]);
        return true;
      }
    },
    canRollActor: true,
    performRoll: callback => callback()
  });

  assert.equal(
    await actions.ability(event, { dataset: { type: "save", key: "dex" } }),
    true
  );
  assert.deepEqual(calls, [["hero", { type: "save", key: "dex", event }]]);
});

test("end turn advances only the current owned combatant", async () => {
  const previousGame = globalThis.game;
  const combatant = { id: "hero-turn" };
  let advances = 0;
  const combat = {
    started: true,
    combatant,
    async nextTurn() {
      advances++;
      this.combatant = { id: "other-turn" };
    }
  };
  globalThis.game = { combat };
  try {
    const options = {
      canRollActor: true,
      getCombatState: () => combatTurnState(combat, combatant, true),
      performAndRefresh: callback => callback()
    };
    const actions = createHudActions(options);
    await actions.endturn();
    await actions.endturn();
    assert.equal(advances, 1);
    let deferred;
    combat.combatant = combatant;
    await createHudActions({
      ...options,
      performAndRefresh: callback => {
        deferred = callback;
      }
    }).endturn();
    combat.combatant = { id: "changed-before-execution" };
    await deferred();
    assert.equal(advances, 1);
    combat.combatant = combatant;
    await createHudActions({
      ...options,
      getCombatState: () => combatTurnState(combat, combatant, false)
    }).endturn();
    assert.equal(advances, 1);
  } finally {
    globalThis.game = previousGame;
  }
});

test("description opens the sheet normally and Shift-click delegates the chat card to the adapter", async () => {
  const previousUi = globalThis.ui;
  const sheets = [];
  const messages = [];
  const warnings = [];
  const actor = { id: "hero", items: new Map() };
  const item = {
    sheet: { render: options => sheets.push(options) }
  };
  actor.items.set("sword", item);
  globalThis.ui = {
    notifications: { warn: message => warnings.push(message) }
  };
  try {
    const actions = createHudActions({
      actor,
      t: key => key,
      adapter: {
        showItemDescription: (received, options) =>
          messages.push([received, options])
      }
    });
    const target = { dataset: { itemId: "sword" } };
    await actions.openitem({ shiftKey: false }, target);
    assert.deepEqual(sheets, [{ force: true }]);
    assert.deepEqual(messages, []);
    const event = { shiftKey: true };
    await actions.openitem(event, target);
    assert.equal(sheets.length, 1);
    assert.deepEqual(messages, [[item, { event }]]);
    actor.items.delete("sword");
    await actions.openitem({ shiftKey: true }, target);
    assert.deepEqual(warnings, ["Combat.ItemMissing"]);
    assert.equal(messages.length, 1);
  } finally {
    globalThis.ui = previousUi;
  }
});

test("Shift-click on HP restores normal HP without changing temporary HP", async () => {
  const hp = { value: 3, max: 12, temp: 4 };
  const updates = [];
  let dialogs = 0;
  const options = {
    actor: {},
    adapter: {
      combatStats: () => ({ hp }),
      updateHp: (_actor, next) => updates.push(next)
    },
    canRollActor: true,
    openHpDialog: () => dialogs++,
    performAndRefresh: callback => callback()
  };
  const actions = createHudActions(options);
  await actions.edithp({ shiftKey: true });
  assert.deepEqual(updates, [{ damage: -9, temp: 4 }]);
  assert.equal(dialogs, 0);
  hp.value = 12;
  await actions.edithp({ shiftKey: true });
  assert.equal(updates.length, 1);
  actions.edithp({ shiftKey: false });
  assert.equal(dialogs, 1);
});

test("spell preparation toggles only eligible owned spells", async () => {
  const spell = { id: "spell", type: "spell" };
  const calls = [];
  const options = {
    actor: { items: new Map([[spell.id, spell]]) },
    adapter: {
      spellPreparation: item => ({ canPrepare: item === spell }),
      toggleSpellPreparation: item => calls.push(item.id)
    },
    canRollActor: true,
    performAndRefresh: callback => callback()
  };
  await createHudActions(options).togglespellprepared(null, {
    dataset: { itemId: spell.id }
  });
  await createHudActions(options).togglespellprepared(null, {
    dataset: { itemId: "missing" }
  });
  assert.deepEqual(calls, ["spell"]);
});

test("panel toggles save their changed layout", () => {
  const saved = [];
  const hudState = {
    combatAbilitiesExpanded: false,
    combatCategory: null,
    actionMenuOpen: false
  };
  const actions = createHudActions({
    currentMode: () => "combat",
    hudState,
    refreshHud() {},
    savePanelState: () => saved.push({ ...hudState })
  });
  actions.toggleabilities();
  actions.combatfilter(null, { dataset: { category: "features" } });
  actions.combatfilter(null, { dataset: { category: "spells" } });
  assert.equal(saved.length, 3);
  assert.equal(saved[0].combatAbilitiesExpanded, true);
  assert.equal(saved[1].combatCategory, "features");
  assert.equal(saved[2].combatCategory, "spells");
});

test("regular view navigation saves the selected tab", () => {
  const saved = [];
  const hudState = { currentView: "main" };
  const actions = createHudActions({
    hudState,
    setView: view => {
      hudState.currentView = view;
    },
    savePanelState: () => saved.push(hudState.currentView)
  });

  actions.view(null, { dataset: { view: "skills" } });
  assert.deepEqual(saved, ["skills"]);
});

test("initiative can be rolled again after the GM clears one combatant's value", async () => {
  const previousGame = globalThis.game;
  const combatant = { id: "hero-turn", initiative: 18 };
  const rolls = [];
  globalThis.game = {
    combat: null,
    combats: { active: { id: "encounter" } }
  };
  try {
    const actions = createHudActions({
      actor: { id: "hero" },
      adapter: { rollInitiative: (_actor, options) => rolls.push(options) },
      canRollActor: true,
      getCombatState: () =>
        combatTurnState(getCurrentCombat(game), combatant, true),
      performRoll: callback => callback()
    });
    await actions.initiative({ altKey: false });
    assert.equal(rolls.length, 0);
    combatant.initiative = null;
    await actions.initiative({ altKey: true });
    assert.equal(rolls.length, 1);
    assert.equal(rolls[0].combatant, combatant);
  } finally {
    globalThis.game = previousGame;
  }
});

test("batched settings apply runtime values and refresh content once", () => {
  const applied = [];
  let contentRefreshes = 0;
  let controlRefreshes = 0;
  const app = {
    rendered: true,
    applySetting: (key, value) => applied.push([key, value]),
    refreshFromSettings: () => contentRefreshes++
  };
  applyHudSettingChanges({
    app,
    changes: new Map([
      ["pinWindow", true],
      ["showFavorites", false],
      ["showSearch", false],
      ["showTokenControl", true]
    ]),
    refreshControls: () => controlRefreshes++,
    reopen: () => assert.fail("unexpected reopen"),
    strategyFor: key =>
      key === "pinWindow"
        ? "runtime"
        : key === "showTokenControl"
          ? "controls"
          : "content"
  });
  assert.deepEqual(applied, [["pinWindow", true]]);
  assert.equal(contentRefreshes, 1);
  assert.equal(controlRefreshes, 1);
});

test("skill filter saves the user's choice and refreshes the HUD", async () => {
  const previousGame = globalThis.game;
  const writes = [];
  let refreshed = 0;
  globalThis.game = {
    settings: {
      set: async (_module, key, value) => writes.push([key, value])
    }
  };

  try {
    const hudState = { proficientSkillsOnly: true };
    const actions = createHudActions({
      hudState,
      refreshHud: () => refreshed++
    });
    await actions.skillfilter(null, { dataset: { proficient: "false" } });
    assert.equal(hudState.proficientSkillsOnly, false);
    assert.deepEqual(writes, [["proficientSkillsOnly", false]]);
    assert.equal(refreshed, 1);
  } finally {
    globalThis.game = previousGame;
  }
});

test("combat category button opens and closes its item list", () => {
  const hudState = { combatCategory: null, actionMenuOpen: false };
  const refreshes = [];
  const actions = createHudActions({
    hudState,
    refreshHud: region => refreshes.push(region)
  });
  const target = { dataset: { category: "weapons" } };
  actions.combatfilter(null, target);
  assert.equal(hudState.combatCategory, "weapons");
  actions.combatfilter(null, target);
  assert.equal(hudState.combatCategory, null);
  assert.deepEqual(refreshes, ["actions", "actions"]);
});

test("window session updates live settings and releases document hooks", async () => {
  const previousHooks = globalThis.Hooks;
  const hookIds = [];
  const hookCallbacks = new Map();
  const removed = [];
  globalThis.Hooks = {
    callAll() {},
    on(name, callback) {
      hookIds.push(name);
      hookCallbacks.set(name, callback);
      return name;
    },
    off(name, id) {
      removed.push([name, id]);
    }
  };

  try {
    const listeners = new Map();
    const elementListeners = new Map();
    const elementClasses = new Set();
    const app = {
      element: {
        style: { setProperty() {} },
        classList: {
          add: name => elementClasses.add(name),
          remove: (...names) =>
            names.forEach(name => elementClasses.delete(name))
        },
        offsetWidth: 100,
        addEventListener(name, callback) {
          elementListeners.set(name, callback);
        }
      },
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      async render() {},
      updatePinControl() {}
    };
    let sheetOpens = 0;
    const actor = {
      uuid: "Actor.hero",
      sheet: { render: () => sheetOpens++ }
    };
    const state = { app: null, actor, actorUuid: actor.uuid };
    const visibility = { itemDetails: true };
    let pinned = false;
    let refreshed = 0;
    let canceled = 0;
    let playersTurn = false;
    let hp = { value: 5, temp: 0, max: 10 };
    const searches = [];

    await activateHudWindow({
      actor,
      app,
      canRollActor: true,
      visualEffectsEnabled: false,
      isCurrentCombatant: combatant => combatant.id === "own",
      isPlayersTurn: () => playersTurn,
      readHp: () => hp,
      onSearchInput: query => searches.push(query),
      readVisibility: () => ({ itemDetails: false }),
      refreshHud: () => refreshed++,
      refreshScheduler: { schedule() {}, cancel: () => canceled++ },
      setPinned: value => {
        pinned = value;
      },
      state,
      visibility
    });

    assert.equal(state.app, app);
    elementListeners.get("dblclick")({
      target: { closest: () => ({}) }
    });
    elementListeners.get("dblclick")({
      target: { closest: () => null }
    });
    assert.equal(sheetOpens, 1);
    app.applySetting("pinWindow", true);
    app.refreshFromSettings();
    assert.equal(pinned, true);
    assert.equal(visibility.itemDetails, false);
    assert.equal(refreshed, 1);

    assert.equal(elementClasses.has("ws-effects-disabled"), true);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    playersTurn = true;
    hookCallbacks.get("updateCombat")();
    assert.equal(elementClasses.has("ws-turn-arrival"), false);
    playersTurn = false;
    hookCallbacks.get("updateCombat")();
    app.applySetting("showVisualEffects", true);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), true);
    hp = { value: 6, temp: 0, max: 10 };
    hookCallbacks.get("updateActor")({ uuid: actor.uuid }, {});
    assert.equal(elementClasses.has("ws-heal-flash"), true);
    playersTurn = true;
    hookCallbacks.get("updateCombat")();
    assert.equal(elementClasses.has("ws-turn-arrival"), true);
    assert.equal(elementClasses.has("ws-heal-flash"), false);
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    app.applySetting("showVisualEffects", false);
    assert.equal(elementClasses.has("ws-effects-disabled"), true);
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    assert.equal(elementClasses.has("ws-turn-arrival"), false);
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), false);
    app.applySetting("showVisualEffects", true);
    assert.equal(elementClasses.has("ws-effects-disabled"), false);
    playersTurn = false;
    hookCallbacks.get("updateCombat")();
    hookCallbacks.get("createCombatant")({ id: "own", initiative: null });
    assert.equal(elementClasses.has("ws-initiative-flash"), true);

    elementListeners.get("input")({
      target: { matches: () => true, value: "sword" }
    });
    assert.deepEqual(searches, ["sword"]);

    app.element = null;
    listeners.get("close")();
    assert.equal(canceled, 1);
    assert.equal(state.app, null);
    assert.equal(state.actor, null);
    assert.equal(removed.length, hookIds.length);
  } finally {
    globalThis.Hooks = previousHooks;
  }
});
