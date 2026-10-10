import assert from "node:assert/strict";
import test from "node:test";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { fixture, combatFor, target } from "./helpers/companions.mjs";
import { waitFor } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { combatTurnState } from "../scripts/hud/actor-context.js";
import { createActorActions } from "../scripts/hud/actor-actions.js";
import { createGmActions } from "../scripts/hud/gm/gm-actions.js";
import {
  renderGmInitiativeButtons,
  renderGmTurnControls,
  canGoToPreviousTurn
} from "../scripts/hud/gm/gm-combat.js";
import { renderScPhaseStatus } from "../scripts/hud/combat-initiative.js";
import { subscribeHudDocuments } from "../scripts/hud/subscriptions.js";
import {
  readScInitiative,
  completeScTurn,
  openScTracker
} from "../scripts/compatibility/sc-venaerys-initiative.js";

restoreGlobalsAfterEach();
import { SC, plan, installSc, configureCombat } from "./helpers/venaerys.mjs";

test("SC tracker is an editable player/GM block whose placement survives a phase refresh", async () => {
  for (const isGM of [false, true]) {
    const f = await fixture({
      isGM,
      values: { scInitiative: true, gmEnabled: isGM }
    });
    installSc();
    const actor = isGM ? f.npc("orc") : f.actor;
    const hero = f.token(actor, "hero", true);
    const { combat, entries } = combatFor(f, [hero]);
    configureCombat(combat, entries, { split: "players" });
    combat.combatant = entries[0];
    combat.turn = 0;
    combat.scene = canvas.scene;
    game.combats = itemCollection([combat]);
    await f.api.open(actor);
    const app = __adventurerHud.app;
    const block = () =>
      app.element.querySelector('[data-hud-block="sc-phase"]');
    try {
      await app.hudActions.togglehudedit();
      assert.ok(block().querySelector('[data-action="hudblockhide"]'));
      await app.hudActions.hudblockmove(
        null,
        block().querySelector('[data-hud-direction="right"]')
      );
      assert.ok(
        block().parentElement.matches(
          ".ws-player-actions, .ws-gm-action-column"
        )
      );
      await app.hudActions.togglehudedit();
      combat.flags[SC].actionsHalf = "2:fast";
      assert.equal(readScInitiative(combat).half, "act");
      Hooks.callAll("updateCombat", combat, { flags: combat.flags });
      await Promise.resolve();
      f.flushFrames();
      await waitFor(() => block().textContent.includes("Actions")).catch(
        error => {
          throw new Error(
            `${isGM ? "GM" : "Player"} SC summary failed to refresh: ${[...app.element.querySelectorAll(".ws-sc-phase")].map(node => node.textContent).join(" | ")}`,
            { cause: error }
          );
        }
      );
      assert.ok(
        block().parentElement.matches(
          ".ws-player-actions, .ws-gm-action-column"
        )
      );
      assert.equal(app.element.querySelectorAll(".ws-sc-phase").length, 1);
      assert.ok(block().querySelector('[data-action="sctracker"]'));
      await app.hudActions.togglehudedit();
      await app.hudActions.hudblockhide(
        null,
        block().querySelector('[data-action="hudblockhide"]')
      );
      await app.hudActions.togglehudedit();
      assert.ok(block().classList.contains("ws-hud-block-hidden"));
    } finally {
      await app.close();
    }
  }
});

function setup(options = {}) {
  const settings = installSettings({
    values: { scInitiative: true },
    ...options
  });
  const opened = installSc(options);
  const scene = { id: "scene", tokens: new Map() };
  const entries = ["hero", "companion", "enemy"].map(id => {
    const actor = {
      id,
      isOwner: true,
      type: id === "hero" ? "character" : "npc"
    };
    const token = { id, actor, parent: scene };
    scene.tokens.set(id, token);
    return { id, actor, token, initiative: id === "enemy" ? 0 : 18 };
  });
  const combat = {};
  const writes = configureCombat(combat, entries, options);
  game.combat = combat;
  let advances = 0;
  combat.nextTurn = async () => {
    advances++;
    combat.turn++;
    combat.combatant = entries[2];
  };
  return {
    ...settings,
    combat,
    entries,
    writes,
    opened,
    advances: () => advances
  };
}

const actorActions = (f, entry, extra = {}) =>
  createActorActions({
    actor: entry.actor,
    getCombatState: () => combatTurnState(f.combat, entry, entry.actor.isOwner),
    performAndRefresh: callback => callback(),
    performRoll: callback => callback(),
    t: key => key,
    ...extra
  });

test("SC compatibility is a GM world setting disabled by default, with native fallback", () => {
  const f = setup({ values: {} });
  assert.equal(f.registrations.get("scInitiative").default, false);
  assert.equal(f.registrations.get("scInitiative").scope, "world");
  assert.equal(f.registrations.get("scInitiative").config, false);
  assert.equal(readScInitiative(f.combat, f.entries[0]), null);
  assert.equal(combatTurnState(f.combat, f.entries[0], true).isTurn, false);
  assert.equal(combatTurnState(f.combat, f.entries[1], true).isTurn, true);
  f.current.set("scInitiative", true);
  for (const active of [false, true]) {
    game.modules.get(SC).active = active;
    f.combat.flags[SC].enabled = !active;
    assert.equal(readScInitiative(f.combat, f.entries[0]), null);
  }
});

test("every unfinished member can act independently, zero initiative and old round marks remain valid", () => {
  const f = setup();
  f.entries[0].initiative = 0;
  f.entries[0].flags[SC].done = 1;
  assert.equal(combatTurnState(f.combat, f.entries[0], true).canEndTurn, true);
  assert.equal(combatTurnState(f.combat, f.entries[1], true).canEndTurn, true);
  assert.equal(readScInitiative(f.combat, f.entries[0]).canRoll, false);
  f.entries[0].flags[SC].done = 2;
  assert.equal(combatTurnState(f.combat, f.entries[0], true).isTurn, false);
  assert.equal(readScInitiative(f.combat, f.entries[0]).isTurn, true);
  f.entries[1].isDefeated = true;
  assert.equal(combatTurnState(f.combat, f.entries[1], true).canEndTurn, false);
});

test("malformed enabled plans disable HUD phase mutations instead of native nextTurn fallback", async () => {
  for (const invalid of [
    [],
    [{ id: "fast", type: "fast" }],
    [...plan(), plan()[0]],
    plan().map(p => ({ ...p, name: 3 }))
  ]) {
    const f = setup();
    f.combat.flags[SC].plan = invalid;
    assert.equal(readScInitiative(f.combat, f.entries[1]).valid, false);
    await actorActions(f, f.entries[1]).endturn();
    assert.equal(f.advances(), 0);
    assert.equal(f.writes.length, 0);
  }
});

test("ending a displayed participant writes only its Done and returns without phase progression", async () => {
  const f = setup();
  let returned = 0;
  const actions = actorActions(f, f.entries[0], {
    onPlayerTurnEnded: () => returned++
  });
  await actions.endturn();
  await actions.endturn();
  assert.equal(returned, 1);
  assert.equal(f.advances(), 0);
  assert.deepEqual(
    f.writes.map(([id]) => id),
    ["hero"]
  );
  assert.equal(f.entries[1].flags[SC].done, null);
  assert.deepEqual(f.writes[0][2], { render: false, [SC]: { reason: "done" } });
});

test("split phases mark movement first and finish only the displayed participant in Actions", async () => {
  const f = setup({ split: "players" });
  let returned = 0;
  const actions = actorActions(f, f.entries[0], {
    onPlayerTurnEnded: () => returned++
  });
  await actions.endturn();
  assert.equal(f.entries[0].flags[SC].moved, 2);
  assert.equal(f.entries[0].flags[SC].done, null);
  assert.equal(returned, 0);
  assert.equal(readScInitiative(f.combat, f.entries[0]).isActing, false);
  f.combat.flags[SC].actionsHalf = "2:fast";
  await actions.endturn();
  assert.equal(returned, 1);
  assert.equal(f.entries[0].flags[SC].done, 2);
  assert.equal(f.entries[1].flags[SC].done, null);
  assert.equal(f.advances(), 0);
});

test("a queued End Turn cannot finish a later round, phase or half", async () => {
  for (const change of [
    f => f.combat.round++,
    f => (f.combat.flags[SC].actionsHalf = "2:fast"),
    f => (f.entries[1].flags[SC].phase = "slow")
  ]) {
    const f = setup({ split: "players" });
    let execute;
    const actions = actorActions(f, f.entries[0], {
      performAndRefresh: callback => {
        execute = callback;
      }
    });
    await actions.endturn();
    change(f);
    await execute();
    assert.equal(f.writes.length, 0);
  }
});

test("completion rejects lost ownership, replaced token/Actor/Combatant and stale sessions", async () => {
  for (const change of [
    f => (f.entries[0].actor.isOwner = false),
    f => (f.entries[0].isOwner = false),
    f => f.entries[0].token.parent.tokens.delete("hero"),
    f => f.combat.combatants.set("hero", { ...f.entries[0] })
  ]) {
    const f = setup();
    change(f);
    assert.equal(
      await completeScTurn(f.combat, f.entries[0], () => true),
      null
    );
    assert.equal(f.writes.length, 0);
  }
  const f = setup();
  assert.equal(await completeScTurn(f.combat, f.entries[0], () => false), null);
  const displayed = f.entries[0].actor;
  f.entries[0].token.actor = { ...displayed };
  assert.equal(
    await completeScTurn(f.combat, f.entries[0], () => true, displayed),
    null
  );
  assert.equal(f.writes.length, 0);
});

test("simultaneous completion requests share one mutation even during a split-half transition", async () => {
  const f = setup({ split: "players" });
  const update = f.entries[0].update;
  let finish;
  f.entries[0].update = (data, options) =>
    new Promise(resolve => {
      finish = async () => {
        await update(data, options);
        f.combat.flags[SC].actionsHalf = "2:fast";
        resolve(f.entries[0]);
      };
    });
  const first = completeScTurn(f.combat, f.entries[0], () => true);
  assert.equal(await completeScTurn(f.combat, f.entries[0], () => true), null);
  await finish();
  assert.equal(await first, "moved");
  assert.equal(f.writes.length, 1);
  assert.equal(f.entries[0].flags[SC].done, null);
});

test("HUD initiative is blocked for both SC roll sources; disabling compatibility restores native delegation", async () => {
  for (const formula of [true, false]) {
    const f = setup({ formula });
    f.entries[0].initiative = null;
    const event = { altKey: true, ctrlKey: false, shiftKey: true };
    const calls = [];
    const actions = actorActions(f, f.entries[0], {
      adapter: { rollInitiative: (...args) => calls.push(args) }
    });
    await actions.initiative(event);
    assert.equal(f.opened(), 0);
    assert.equal(calls.length, 0);
    await actions.sctracker();
    assert.equal(f.opened(), 1);
    f.current.set("scInitiative", false);
    await actions.initiative(event);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], f.entries[0].actor);
    assert.equal(calls[0][1].combatant, f.entries[0]);
    assert.equal(calls[0][1].event, event);
  }
});

test("SC group initiative is disabled and direct handler calls cannot roll or open a popup", async () => {
  const f = setup({ isGM: true });
  for (const entry of f.entries) entry.initiative = null;
  const calls = [];
  const controller = { getCombat: () => f.combat, isGM: () => true };
  const event = { shiftKey: true };
  const actions = createGmActions({
    gmController: controller,
    t: key => key,
    adapter: {
      rollInitiative: (actor, options) => calls.push([actor, options])
    },
    performAndRefresh: callback => callback()
  });
  await actions.gmrollinitiative(event, {
    dataset: { scope: "players", reroll: "false" }
  });
  assert.deepEqual(calls, []);
  assert.equal(f.opened(), 0);
  assert.match(
    renderGmInitiativeButtons(f.combat, f.entries, key => key),
    /disabled.*SC.RollPlayers/
  );
  assert.doesNotMatch(
    renderGmInitiativeButtons(f.combat, f.entries, key => key, {
      resets: true
    }),
    /gmresetinitiative|data-scope="npc"/
  );
});

test("phase Previous respects occupied phases and halves; GM Done is independent from Next phase", async () => {
  const f = setup({ isGM: true, round: 1 });
  assert.equal(canGoToPreviousTurn(f.combat), false);
  f.combat.flags[SC].split = "players";
  f.combat.flags[SC].actionsHalf = "1:fast";
  assert.equal(canGoToPreviousTurn(f.combat), true);
  assert.match(
    renderGmTurnControls(f.combat, key => key),
    /SC.NextPhase/
  );
  const actions = createGmActions({
    gmController: { getCombat: () => f.combat, isGM: () => true },
    t: key => key,
    performAndRefresh: callback => callback()
  });
  await actions.scdone(null, { dataset: { combatantId: "hero" } });
  assert.equal(f.entries[0].flags[SC].done, 1);
  assert.equal(f.advances(), 0);
});

test("hidden phase names and DCs never enter player markup, while visible custom names are escaped", () => {
  const f = setup();
  for (const entry of f.entries) entry.visible = false;
  f.combat.flags[SC].plan[0].name = '<img src=x onerror="danger">';
  f.combat.flags[SC].dc = { value: 73 };
  const escape = value =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const hidden = renderScPhaseStatus(
    readScInitiative(f.combat, f.entries[0]),
    key => key,
    escape
  );
  assert.match(hidden, /SC.WaitingGm/);
  assert.doesNotMatch(hidden, /img|danger|73/);
  f.entries[0].visible = true;
  const shown = renderScPhaseStatus(
    readScInitiative(f.combat, f.entries[0]),
    key => key,
    escape
  );
  assert.match(shown, /&lt;img/);
  assert.doesNotMatch(shown, /<img/);
});

test("opening the SC tracker warns about a different selected encounter without changing it", () => {
  const f = setup();
  const other = { id: "other" };
  game.combat = other;
  openScTracker(f.combat, key => key);
  assert.equal(game.combat, other);
  assert.equal(f.opened(), 1);
  assert.deepEqual(f.notifications.at(-1), ["info", "SC.ChooseCombat"]);
});

test("document hooks refresh Moved and actionsHalf without repeating full-turn feedback and release on close", () => {
  const f = setup({ split: "players" });
  const callbacks = new Map();
  let refreshes = 0,
    starts = 0;
  const state = () => combatTurnState(f.combat, f.entries[0], true);
  const dispose = subscribeHudDocuments({
    getCombat: () => f.combat,
    hooks: {
      on: (name, callback) => {
        callbacks.set(name, callback);
        return callback;
      },
      off: name => callbacks.delete(name)
    },
    scheduleRefresh: () => refreshes++,
    onTurnStart: () => starts++,
    isPlayersTurn: () => state().isTurn,
    getTurnKey: () => state().sc?.turnKey
  });
  f.entries[0].flags[SC].moved = 2;
  callbacks.get("updateCombatant")(f.entries[0], {
    flags: { [SC]: { moved: 2 } }
  });
  f.combat.flags[SC].actionsHalf = "2:fast";
  callbacks.get("updateCombat")(f.combat, {
    [`flags.${SC}.actionsHalf`]: "2:fast"
  });
  assert.equal(refreshes, 2);
  assert.equal(starts, 0);
  f.combat.round = 3;
  callbacks.get("updateCombat")(f.combat, { round: 3 });
  assert.equal(starts, 1);
  dispose();
  assert.equal(callbacks.size, 0);
});

test("HUD companion Done returns to the exact hero while the shared phase stays active", async () => {
  const f = await fixture({ values: { scInitiative: true } });
  installSc();
  const hero = f.token(f.actor, "hero", true),
    summon = f.token(f.npc(), "summon");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  const { combat, entries } = combatFor(f, [hero, summon]);
  configureCombat(combat, entries);
  combat.nextTurn = () =>
    assert.fail("SC nextTurn must not mark all owned participants");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    assert.ok(app.element.querySelector('[data-action="endturn"]'));
    await app.hudActions.opencompanion(null, target(summon.uuid));
    await app.hudActions.endturn();
    assert.equal(__adventurerHud.actor, f.actor);
    assert.equal(entries[1].flags[SC].done, 2);
    assert.equal(entries[0].flags[SC].done, null);
    assert.equal(combat.turn, 1);
    assert.equal(__adventurerHud.app, app);
  } finally {
    await app.close();
  }
});

test("SC blocks companion row, group and header rolls without opening token pickers or SC popups", async () => {
  for (const formula of [false, true]) {
    const f = await fixture({ values: { scInitiative: true } });
    const opened = installSc({ formula });
    const hero = f.token(f.actor, "hero", true);
    const base = f.npc();
    const first = f.token(base, "first");
    const second = f.token(base, "second");
    const { combat, entries } = combatFor(f, [hero, first, second]);
    configureCombat(combat, entries);
    for (const entry of entries) entry.initiative = null;
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    try {
      await app.hudActions.togglecompanions();
      for (const button of app.element.querySelectorAll(
        '[data-action="initiative"], [data-action="companioninitiative"]'
      ))
        assert.equal(button.hasAttribute("disabled"), true);
      const pickers = f.pickers.length;
      await app.hudActions.companioninitiative(null, target(base.uuid));
      await app.hudActions.companionsinitiative();
      await app.hudActions.initiative();
      assert.equal(f.pickers.length, pickers);
      await app.hudActions.opencompanion(null, target(first.uuid));
      await app.hudActions.initiative();
      assert.equal(f.calls.filter(call => call[0] === "initiative").length, 0);
      assert.equal(opened(), 0);
    } finally {
      await app.close();
    }
  }
});

test("receiving the world SC option updates a player's open HUD without changing encounter flags", async () => {
  const f = await fixture();
  installSc();
  const hero = f.token(f.actor, "hero", true),
    summon = f.token(f.npc(), "summon");
  const { combat, entries } = combatFor(f, [hero, summon]);
  configureCombat(combat, entries);
  const original = structuredClone(combat.flags);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    assert.equal(app.element.querySelector(".ws-sc-phase"), null);
    await game.settings.set("adventurer-hud", "scInitiative", true);
    await waitFor(() => app.element.querySelector(".ws-sc-phase"));
    assert.ok(app.element.querySelector('[data-action="endturn"]'));
    await game.settings.set("adventurer-hud", "scInitiative", false);
    await waitFor(() => !app.element.querySelector(".ws-sc-phase"));
    assert.deepEqual(combat.flags, original);
    assert.equal(__adventurerHud.app, app);
  } finally {
    await app.close();
  }
});

test("an event-only GM encounter keeps SC navigation without creating an Actor session", async () => {
  const f = await fixture({
    isGM: true,
    values: { scInitiative: true, gmEnabled: true }
  });
  installSc();
  const combat = {};
  const marker = { id: "lair", actor: null, token: null, initiative: 0 };
  configureCombat(combat, [marker]);
  combat.flags[SC].plan.push({
    id: "lair",
    type: "event",
    name: "Lair event",
    icon: "fa-solid fa-castle",
    color: "#112233"
  });
  marker.flags[SC].side = "event";
  marker.flags[SC].phase = "lair";
  combat.combatant = marker;
  combat.turn = 0;
  combat.scene = canvas.scene;
  game.combat = combat;
  game.combats = itemCollection([combat]);
  let advances = 0;
  combat.nextTurn = async () => advances++;
  await f.api.open();
  const app = __adventurerHud.app;
  try {
    assert.match(
      app.element.querySelector(".ws-sc-phase").textContent,
      /Lair event/
    );
    assert.equal(
      app.element.querySelector('[data-action="gmnext"]').disabled,
      false
    );
    await app.hudActions.gmnext();
    assert.equal(advances, 1);
    assert.equal(app.element.querySelector('[data-action="scdone"]'), null);
  } finally {
    await app.close();
  }
});

test("shared senses work for a caster outside the pointer and expire at its next phase turn, not half changes", async () => {
  const f = await fixture({ values: { scInitiative: true } });
  installSc();
  const hero = f.token(f.actor, "hero", true),
    familiar = f.token(f.npc(), "owl");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  const { combat, entries } = combatFor(f, [hero, familiar]);
  configureCombat(combat, entries, { split: "players" });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    await app.hudActions.togglecompanions();
    await app.hudActions.companionvision(null, target(familiar.uuid));
    assert.ok(f.visionSources.has(familiar.uuid));
    combat.flags[SC].actionsHalf = "2:fast";
    f.hooks.callAll("updateCombat", combat, {
      [`flags.${SC}.actionsHalf`]: "2:fast"
    });
    assert.ok(f.visionSources.has(familiar.uuid));
    combat.round = 3;
    f.hooks.callAll("updateCombat", combat, { round: 3 });
    await waitFor(() => !f.visionSources.has(familiar.uuid));
  } finally {
    await app.close();
  }
});
