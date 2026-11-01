import assert from "node:assert/strict";
import test from "node:test";
import { fixture, combatFor, select } from "./helpers/companions.mjs";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { SC, installSc, configureCombat } from "./helpers/venaerys.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import {
  readScInitiative,
  completeScTurn,
  scIntegrationStatus
} from "../scripts/compatibility/sc-venaerys-initiative.js";
import { createGmActions } from "../scripts/hud/gm/gm-actions.js";
import { diagnosticReport } from "../scripts/diagnostics.js";
import { createTroubleshootingController } from "../scripts/settings-applications.js";

restoreGlobalsAfterEach();

async function encounter({ split = "players", twins = false } = {}) {
  const f = await fixture({
    values: { scInitiative: true, showModeNavigation: true }
  });
  installSc();
  const hero = f.token(f.actor, "hero", true);
  const base = f.npc();
  const summon = f.token(base, "summon");
  const tokens = [hero, summon];
  if (twins) tokens.push(f.token(base, "second"));
  const { combat, entries } = combatFor(f, tokens);
  const writes = configureCombat(combat, entries, { split });
  for (const entry of entries)
    Object.assign(entry.flags[SC], { side: "players", phase: "fast" });
  game.combats = itemCollection([combat]);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  return { ...f, base, hero, summon, combat, entries, writes, app };
}

test("player completion can be undone without navigation or advancing other participants", async () => {
  for (const split of ["off", "players"]) {
    const f = await encounter({ split });
    try {
      await f.app.hudActions.endturn();
      const undo = f.app.element.querySelector('[data-action="scundo"]');
      assert.ok(undo);
      assert.equal(undo.getAttribute("aria-pressed"), "true");
      await waitFor(
        () => !f.app.element.querySelector("[data-hud-action-feedback]")
      );
      await f.app.hudActions.scundo();
      assert.equal(readScInitiative(f.combat, f.entries[0]).marked, false);
      assert.equal(f.entries[1].flags[SC].done, null);
      assert.equal(f.entries[1].flags[SC].moved, null);
      assert.equal(__adventurerHud.actor, f.actor);
      assert.ok(f.app.element.querySelector('[data-action="endturn"]'));
      assert.equal(f.writes.length, 2);
      f.entries[0].flags[SC].done = f.combat.round;
      f.combat.combatant.flags[SC].phase = "enemies";
      const before = f.writes.length;
      assert.equal(
        await completeScTurn(
          f.combat,
          f.entries[0],
          () => true,
          f.actor,
          false
        ),
        null
      );
      assert.equal(f.writes.length, before);
    } finally {
      if (f.app.rendered) await f.app.close();
    }
  }
});

test("companion row completes and undoes its exact token without leaving the hero", async () => {
  const f = await encounter();
  try {
    const button = () =>
      f.app.element.querySelector('[data-action="companionscturn"]');
    await f.app.hudActions.companionscturn(null, button());
    assert.equal(f.entries[1].flags[SC].moved, f.combat.round);
    assert.equal(f.entries[0].flags[SC].moved, null);
    assert.equal(__adventurerHud.actor, f.actor);
    assert.equal(button().dataset.scComplete, "false");
    await f.app.hudActions.companionscturn(null, button());
    assert.equal(f.entries[1].flags[SC].moved, null);
    assert.equal(f.pickers.length, 0);
    const stale = button();
    f.combat.flags[SC].actionsHalf = `${f.combat.round}:fast`;
    await f.app.hudActions.companionscturn(null, stale);
    assert.equal(f.writes.length, 2);
  } finally {
    await f.app.close();
  }
});

test("GM undo respects the requested round and half and changes only the addressed participant", async () => {
  const f = await encounter();
  try {
    game.user.isGM = true;
    f.entries[1].flags[SC].moved = f.combat.round;
    const actions = createGmActions({
      gmController: { isGM: () => true, getCombat: () => f.combat },
      performAndRefresh: cb => cb(),
      t: key => key
    });
    const target = {
      dataset: {
        combatantId: f.entries[1].id,
        scComplete: "false",
        scRound: String(f.combat.round),
        scPhase: "fast",
        scHalf: "move"
      }
    };
    await actions.scdone(null, target);
    assert.equal(f.entries[1].flags[SC].moved, null);
    assert.equal(f.entries[0].flags[SC].moved, null);
    f.combat.flags[SC].actionsHalf = `${f.combat.round}:fast`;
    f.entries[1].flags[SC].done = f.combat.round;
    await actions.scdone(null, target);
    assert.equal(f.entries[1].flags[SC].done, f.combat.round);
    target.dataset.scHalf = "act";
    f.combat.round++;
    f.entries[1].flags[SC].done = f.combat.round;
    await actions.scdone(null, target);
    assert.equal(f.writes.length, 1);
  } finally {
    await f.app.close();
  }
});

test("multiple companion tokens use a native chooser and stale phase/Actor choices cannot mutate", async () => {
  for (const change of [null, "phase", "actor", "permission", "session"]) {
    const f = await encounter({ twins: true });
    try {
      const button = f.app.element.querySelector(
        '[data-action="companionscturn"]'
      );
      await f.app.hudActions.companionscturn(null, button);
      assert.equal(f.pickers.length, 1);
      if (change === "phase")
        f.combat.flags[SC].actionsHalf = `${f.combat.round}:fast`;
      if (change === "actor")
        f.entries[2].token.actor = { ...f.entries[2].token.actor };
      if (change === "permission") f.entries[2].isOwner = false;
      if (change === "session") await f.app.close();
      await select(f.pickers[0], 1);
      if (change) assert.equal(f.writes.length, 0, change);
      else {
        assert.equal(f.writes.length, 1);
        assert.equal(f.writes[0][0], f.entries[2].id);
        assert.equal(f.entries[1].flags[SC].moved, null);
        assert.equal(__adventurerHud.actor, f.actor);
      }
    } finally {
      if (f.app.rendered) await f.app.close();
    }
  }
});

test("phase progress counts only visible owned living participants, including separate extra turns", async () => {
  const f = await encounter({ twins: true });
  try {
    f.entries[1].flags[SC].moved = f.combat.round;
    assert.deepEqual(readScInitiative(f.combat).progress, {
      completed: 1,
      total: 3
    });
    f.entries[2].visible = false;
    assert.deepEqual(readScInitiative(f.combat).progress, {
      completed: 1,
      total: 2
    });
    f.entries[2].visible = true;
    f.entries[2].isOwner = false;
    assert.deepEqual(readScInitiative(f.combat).progress, {
      completed: 1,
      total: 2
    });
    f.entries[2].isOwner = true;
    f.entries[2].isDefeated = true;
    assert.deepEqual(readScInitiative(f.combat).progress, {
      completed: 1,
      total: 2
    });
    f.entries[2].isDefeated = false;
    f.entries[2].flags[SC].phase = "slow";
    f.entries[2].flags[SC].extraTurnOf = f.entries[1].id;
    f.combat.combatant = f.entries[2];
    const extra = readScInitiative(f.combat, f.entries[2]);
    assert.equal(extra.extraTurn, true);
    assert.deepEqual(extra.progress, { completed: 0, total: 1 });
  } finally {
    await f.app.close();
  }
});

test("diagnostics explain integration availability and export only bounded metadata", async () => {
  const f = await fixture({ values: { language: "en" } });
  assert.equal(scIntegrationStatus().state, "missing");
  installSc();
  game.modules.get(SC).active = false;
  assert.equal(scIntegrationStatus().state, "inactive");
  game.modules.get(SC).active = true;
  assert.equal(scIntegrationStatus().state, "disabled");
  f.current.set("scInitiative", true);
  assert.equal(scIntegrationStatus().state, "no-combat");
  const combat = {};
  assert.equal(scIntegrationStatus(combat).state, "native-combat");
  configureCombat(combat, []);
  assert.equal(scIntegrationStatus(combat).state, "ready");
  combat.flags[SC].plan = [];
  assert.equal(scIntegrationStatus(combat).state, "invalid-combat");
  delete game.modules.get(SC).api.setMoved;
  assert.equal(scIntegrationStatus(combat).state, "api-unavailable");
  game.combat = {
    ...combat,
    secret: "PRIVATE NAME",
    flags: { [SC]: { ...combat.flags[SC], dc: 12345, plan: "PRIVATE PHASE" } }
  };
  game.modules.get(SC).version = "1.0.5";
  const status = diagnosticReport().context.scInitiative;
  assert.equal(status.scVersion, "1.0.5");
  assert.equal(status.api.setMoved, false);
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE|12345|plan|\.Token\./);
  const app = new (createTroubleshootingController().constructor)();
  const context = await app._prepareContext();
  assert.match(context.scIntegrationState, /API is incomplete/);
  assert.match(context.scIntegrationApi, /setMoved:/);
});
