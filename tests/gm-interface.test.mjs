import test from "node:test";
import assert from "node:assert/strict";
import { createGmActions } from "../scripts/hud/gm/gm-actions.js";
import { createHudState } from "../scripts/hud/state.js";
import { createViewActions } from "../scripts/hud/view-actions.js";
import {
  createPanelPreferences,
  flushPanelPreferences
} from "../scripts/hud/panel-preferences.js";
import { SETTINGS } from "../scripts/settings-access.js";
import { renderGmCombatHeader } from "../scripts/hud/gm/gm-combat.js";
import {
  synchronizeHudLayout,
  changeHudLayout,
  captureHudLayoutUndo,
  undoHudLayout
} from "../scripts/hud/window/hud-layout.js";
import { fragment, escapeHTML } from "./helpers/rendering.mjs";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

test("unrolled roster initiative rolls directly without a dialog", async () => {
  installSettings({ isGM: true });
  const f = setup();
  f.entry.initiative = null;
  foundry.applications.api.DialogV2 = {
    wait: () => {
      throw Error("unexpected dialog");
    }
  };
  await f.actions.gmeditinitiative(null, { dataset: { combatantId: "rook" } });
  assert.deepEqual(f.calls, [["roll", ["rook"], { updateTurn: true }]]);
});

test("NPC initiative reset preserves players and respects cancellation and stale sessions", async () => {
  installSettings({ isGM: true });
  const f = setup();
  const npc = { id: "npc", initiative: 15, isNPC: true };
  f.entry.isNPC = false;
  f.combat.turns.push(npc);
  f.combat.combatants.set(npc.id, npc);
  foundry.applications.api.DialogV2 = { confirm: async () => false };
  await f.actions.gmresetinitiative(null, { dataset: { scope: "npc" } });
  assert.deepEqual(f.calls, []);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await f.actions.gmresetinitiative(null, { dataset: { scope: "npc" } });
  assert.deepEqual(f.calls, [["set", "npc", null]]);
  foundry.applications.api.DialogV2.confirm = async () => {
    f.invalidate();
    return true;
  };
  await f.actions.gmresetinitiative(null, { dataset: { scope: "all" } });
  assert.equal(f.calls.length, 1);
});

test("preparation removes only addressed combatants and leaves scene tokens intact", async () => {
  installSettings({ isGM: true });
  const f = setup();
  f.combat.deleteEmbeddedDocuments = (...args) =>
    f.calls.push(["delete", ...args]);
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  await f.actions.gmremovecombatants(null, {
    dataset: { combatantId: "rook" }
  });
  assert.deepEqual(f.calls, [["delete", "Combatant", ["rook"]]]);
  f.combat.started = true;
  await f.actions.gmremovecombatants(null, { dataset: { scope: "all" } });
  assert.equal(f.calls.length, 1);
  f.combat.started = false;
  foundry.applications.api.DialogV2.confirm = async () => {
    f.combat.combatants.set("rook", { ...f.entry });
    return true;
  };
  await f.actions.gmremovecombatants(null, { dataset: { scope: "all" } });
  assert.equal(f.calls.length, 1);
});

test("roster has one unobtrusive effect marker and describes creatures without effects", () => {
  installSettings({ isGM: true });
  const f = setup();
  const escapeHTML = value =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const render = () =>
    fragment(
      renderGmCombatHeader({
        controller: f.controller,
        adapter: { combatStats: () => ({ hp: { value: 12, max: 20 } }) },
        escapeHTML,
        t: key => key
      })
    );
  const plain = render();
  assert.equal(plain.querySelector(".ws-gm-roster-effect-marker"), null);
  assert.match(
    plain.querySelector(".ws-gm-creature").dataset.tooltip,
    /Rook.*12\/20.*GM.NoEffects/
  );
  f.actor.effects = [
    { id: "one", name: "Bless", img: "bless.webp" },
    { id: "two", name: "Poison", img: "poison.webp" }
  ];
  const active = render();
  assert.equal(
    active.querySelectorAll(".ws-gm-roster-effect-marker").length,
    1
  );
  assert.equal(
    active.querySelector(".ws-gm-roster-effect-marker").children.length,
    0
  );
  assert.match(
    active.querySelector(".ws-gm-creature").dataset.tooltip,
    /Bless.*Poison/
  );
});

function setup() {
  if (typeof foundry !== "undefined") foundry.utils = { escapeHTML };
  const calls = [];
  const actor = { name: "Rook", type: "character", img: "actor.webp" };
  const entry = {
    id: "rook",
    name: "Player Character",
    actor,
    initiative: 12,
    token: {
      uuid: "Scene.test.Token.rook",
      texture: { src: "token.webp" },
      actor
    }
  };
  const combat = {
    started: false,
    turns: [entry],
    combatants: new Map([[entry.id, entry]]),
    setInitiative: (...args) => calls.push(["set", ...args]),
    rollInitiative: (...args) => calls.push(["roll", ...args])
  };
  let current = true;
  const controller = {
    isGM: () => true,
    getCombat: () => combat,
    roster: () => [entry],
    combats: () => [combat]
  };
  const actions = createGmActions({
    gmController: controller,
    isSessionCurrent: () => current,
    performSceneAction: callback => callback(),
    t: key => key
  });
  return {
    calls,
    actor,
    entry,
    combat,
    controller,
    actions,
    invalidate: () => {
      current = false;
    }
  };
}

for (const [choice, expected] of [
  [{ action: "save", value: 19.5 }, ["set", "rook", 19.5]],
  [{ action: "reset" }, ["set", "rook", null]],
  [{ action: "roll" }, ["roll", ["rook"], { updateTurn: true }]]
])
  test(`roster initiative delegates ${choice.action} to the addressed native combatant`, async () => {
    const f = setup();
    globalThis.foundry = {
      utils: { escapeHTML: value => value },
      applications: { api: { DialogV2: { wait: async () => choice } } }
    };
    await f.actions.gmeditinitiative(null, {
      dataset: { combatantId: "rook" }
    });
    assert.deepEqual(f.calls, [expected]);
  });

for (const stale of ["session", "combatant", "cancel"])
  test(`initiative dialog rejects ${stale} after a deferred choice`, async () => {
    const f = setup();
    globalThis.foundry = {
      utils: { escapeHTML: value => value },
      applications: {
        api: {
          DialogV2: {
            wait: async () => {
              if (stale === "session") f.invalidate();
              if (stale === "combatant")
                f.combat.combatants.set("rook", { ...f.entry });
              return stale === "cancel" ? null : { action: "save", value: 18 };
            }
          }
        }
      }
    };
    await f.actions.gmeditinitiative(null, {
      dataset: { combatantId: "rook" }
    });
    assert.deepEqual(f.calls, []);
  });

test("token portrait opens the native image window without sharing automatically", () => {
  const f = setup();
  const windows = [];
  globalThis.foundry = {
    applications: {
      apps: {
        ImagePopout: class {
          constructor(options) {
            windows.push(options);
          }
          render(options) {
            windows.push(options);
          }
          shareImage() {
            assert.fail("sharing requires the GM's explicit action");
          }
        }
      }
    }
  };
  f.actions.gmimage(null, { dataset: { combatantId: "rook" } });
  assert.equal(windows[0].src, "token.webp");
  assert.equal(windows[0].uuid, f.entry.token.uuid);
  assert.deepEqual(windows[1], { force: true });
  f.invalidate();
  f.actions.gmimage(null, { dataset: { combatantId: "rook" } });
  assert.equal(windows.length, 2);
});

test("previous turn cannot return the first participant of round one to preparation", async () => {
  const f = setup();
  f.combat.started = true;
  f.combat.round = 1;
  f.combat.turn = 0;
  f.combat.previousTurn = async () => f.calls.push("previous");
  f.controller.sync = () => {};
  const actions = createGmActions({
    gmController: f.controller,
    performSceneAction: callback => callback(),
    openGmSelection: async () => {}
  });
  await actions.gmprevious();
  assert.deepEqual(f.calls, []);
  f.combat.turn = 1;
  await actions.gmprevious();
  f.combat.turn = 0;
  f.combat.round = 2;
  await actions.gmprevious();
  assert.deepEqual(f.calls, ["previous", "previous"]);
});

for (const scope of ["all", "npc"])
  test(`${scope} initiative prompts only when everyone has rolled and respects cancellation`, async () => {
    const f = setup();
    f.entry.isNPC = false;
    const npc = { id: "npc", isNPC: true, initiative: 15 };
    f.combat.turns.push(npc);
    f.combat.combatants.set(npc.id, npc);
    f.combat.rollAll = async () => f.calls.push("missing-all");
    f.combat.rollNPC = async () => f.calls.push("missing-npc");
    let prompts = 0;
    let accepted = false;
    globalThis.foundry = {
      utils: { escapeHTML: value => value },
      applications: {
        api: {
          DialogV2: {
            confirm: async () => {
              prompts++;
              return accepted;
            }
          }
        }
      }
    };
    const target = { dataset: { scope, reroll: "false" } };
    await f.actions.gmrollinitiative(null, target);
    assert.equal(prompts, 1);
    assert.deepEqual(f.calls, []);
    accepted = true;
    await f.actions.gmrollinitiative(null, target);
    assert.deepEqual(f.calls, [
      [
        "roll",
        scope === "all" ? ["rook", "npc"] : ["npc"],
        { updateTurn: true }
      ]
    ]);
    f.calls.length = 0;
    npc.initiative = null;
    await f.actions.gmrollinitiative(null, target);
    assert.equal(prompts, 2);
    assert.deepEqual(f.calls, [`missing-${scope}`]);
  });

test("reroll confirmation rejects a replaced GM session", async () => {
  const f = setup();
  globalThis.foundry = {
    utils: { escapeHTML: value => value },
    applications: {
      api: {
        DialogV2: {
          confirm: async () => {
            f.invalidate();
            return true;
          }
        }
      }
    }
  };
  await f.actions.gmrollinitiative(null, {
    dataset: { scope: "all", reroll: "false" }
  });
  assert.deepEqual(f.calls, []);
});

test("preparation uses the character name and saves independent block placement with undo", () => {
  const f = setup();
  const body = () =>
    renderGmCombatHeader({
      controller: f.controller,
      adapter: { combatStats: () => ({ hp: { value: 12, max: 20 } }) },
      escapeHTML: value => String(value),
      t: key => key
    });
  const root = fragment(body());
  const state = createHudState({ hudEditing: true });
  synchronizeHudLayout(root, state, key => key);
  assert.equal(
    root.querySelector("[data-hud-layout-mode]").dataset.hudLayoutMode,
    "preparation"
  );
  assert.match(
    root.querySelector(".ws-gm-player-creature strong").textContent,
    /Rook/
  );
  assert.doesNotMatch(
    root.querySelector(".ws-gm-player-creature strong").textContent,
    /Player Character/
  );
  assert.equal(root.querySelectorAll(".ws-hud-block-tools").length, 3);
  assert.equal(
    root
      .querySelector('[data-action="gmstartcombat"]')
      .closest("[data-hud-block]"),
    null
  );
  const setupBlock = root.querySelector('[data-hud-block="setup"]');
  state.hudLayoutUndo = captureHudLayoutUndo(state, "preparation");
  assert.equal(
    changeHudLayout(
      root,
      state,
      setupBlock.querySelector('[data-hud-direction="right"]')
    ),
    true
  );
  assert.ok(state.hudLayouts["preparation:actions"].order.includes("setup"));
  root.innerHTML = body();
  synchronizeHudLayout(root, state, key => key);
  assert.equal(
    root.querySelector('[data-hud-block="setup"]').parentElement.dataset
      .hudLane,
    "actions"
  );
  assert.equal(undoHudLayout(root, state), true);
  synchronizeHudLayout(root, state, key => key);
  assert.equal(
    root.querySelector('[data-hud-block="setup"]').parentElement.dataset
      .hudLane,
    "info"
  );
  assert.deepEqual(state.hudLayouts, {});
});

test("extra column keeps whole categories and search placement outside editing", () => {
  const root = fragment(
    '<div id="ws-combat" class="ws-player-layout"><section class="ws-player-info"></section><section class="ws-player-actions"><div class="ws-item-search">Search</div><div class="ws-combat-actions"><div class="ws-combat-category-sections"><section class="ws-combat-category-section"><button data-category="weapons">Weapons</button><div>Weapon content</div></section></div></div></section></div>'
  );
  const state = createHudState({
    hudEditing: true,
    hudLayouts: { "combat:extra": { order: [], hidden: [] } }
  });
  synchronizeHudLayout(root, state, key => key);
  for (const key of ["tab:weapons", "search"]) {
    const block = root.querySelector(`[data-hud-block="${key}"]`);
    assert.equal(
      changeHudLayout(
        root,
        state,
        block.querySelector('[data-hud-direction="right"]')
      ),
      true
    );
    synchronizeHudLayout(root, state, key => key);
  }
  state.hudEditing = false;
  synchronizeHudLayout(root, state, key => key);
  const extra = root.querySelector('[data-hud-lane="extra"]');
  assert.match(extra.textContent, /Weapon content/);
  assert.equal(
    extra.querySelector('[data-hud-block="search"]').parentElement,
    extra
  );
  assert.equal(extra.querySelector(".ws-hud-block-tools"), null);
});

test("GM layout is shared across exact tokens while native filters and legacy layouts remain separate", async () => {
  let stored = {
    "gm:Token.one": {
      hudLayouts: { "combat:info": { order: ["traits"], hidden: [] } },
      combatCategory: "features"
    },
    "gm:Token.two": {
      hudLayouts: { "combat:info": { order: ["stats"], hidden: [] } },
      combatCategory: "weapons"
    }
  };
  const options = tokenUuid => ({
    actorUuid: "Actor.shared",
    tokenUuid,
    gmActive: true,
    readSetting: key => (key === SETTINGS.panelStates ? stored : true),
    writeSetting: async (_key, value) => {
      stored = value;
    }
  });
  const one = createPanelPreferences(options("Token.one"));
  await flushPanelPreferences();
  const state = createHudState(one.initialState);
  state.hudLayouts = { "combat:extra": { order: ["traits"], hidden: [] } };
  await one.save(state);
  const two = createPanelPreferences(options("Token.two"));
  assert.deepEqual(two.initialState.hudLayouts, state.hudLayouts);
  assert.equal(two.initialState.combatCategory, "weapons");
  assert.deepEqual(stored["gm:Token.two"].hudLayouts, {
    "combat:info": { order: ["stats"], hidden: [] }
  });
  const empty = createPanelPreferences(options(null));
  assert.deepEqual(empty.initialState.hudLayouts, state.hudLayouts);
});

for (const gm of [false, true])
  test(`${gm ? "GM" : "player"} reset restores default blocks, removes the extra column and supports undo`, () => {
    const root = fragment(
      '<div class="ws-rolls-dialog"><div id="ws-combat" class="ws-player-layout"><section class="ws-player-info"><div class="ws-actor-header">Name</div><div class="ws-health-stack">HP</div></section><section class="ws-player-actions"></section></div></div>'
    );
    const state = createHudState({
      hudEditing: true,
      hudLayouts: {
        "combat:extra": { order: ["identity"], hidden: ["hp"] },
        "regular:info": { order: ["favorites"], hidden: [] }
      },
      itemLayouts: { features: { order: ["native"], hidden: [] } }
    });
    const sync = () => synchronizeHudLayout(root, state, key => key);
    sync();
    const before = structuredClone(state.hudLayouts);
    let saves = 0;
    const actions = createViewActions({
      actor: gm ? null : { isOwner: true },
      gmController: gm ? { isGM: () => true } : null,
      hudState: state,
      savePanelState: () => saves++,
      refreshHud: sync
    });
    actions.hudlayoutreset.call({ element: root });
    assert.equal(
      root.querySelector('[data-hud-block="identity"]').parentElement.dataset
        .hudLane,
      "info"
    );
    assert.equal(root.querySelector(".ws-hud-extra-lane"), null);
    assert.equal(
      root
        .querySelector('[data-hud-block="hp"]')
        .classList.contains("ws-hud-block-hidden"),
      false
    );
    assert.deepEqual(state.hudLayouts, {
      "regular:info": before["regular:info"]
    });
    assert.deepEqual(state.itemLayouts.features.order, ["native"]);
    assert.equal(saves, 1);
    actions.hudlayoutundo.call({ element: root });
    assert.deepEqual(state.hudLayouts, before);
    assert.equal(
      root.querySelector('[data-hud-block="identity"]').parentElement.dataset
        .hudLane,
      "extra"
    );
  });
