import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { ownedCompanions } from "../scripts/hud/companions/companions.js";
import { companionInitiative } from "../scripts/hud/companions/companion-details.js";
import { combatFor, fixture, select, target } from "./helpers/companions.mjs";

restoreGlobalsAfterEach();

test("row, header and group initiative pass the original event to native D&D rolls", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const first = f.token(f.npc(), "owl"),
    second = f.token(f.npc("wolf"), "wolf");
  const nativeOptions = [];
  for (const token of [first, second])
    token.actor.getInitiativeRoll = options => {
      nativeOptions.push([token, options]);
      return { options };
    };
  const { entries } = combatFor(f, [first, second]);
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  const alt = { altKey: true },
    ctrl = { ctrlKey: true },
    shift = { shiftKey: true };
  await app.hudActions.companioninitiative(alt, target(first.uuid));
  assert.equal(nativeOptions[0][1].event, alt);
  assert.equal(nativeOptions[0][1].advantage, true);
  entries[0].initiative = null;
  await app.hudActions.opencompanion(null, target(first.uuid));
  await app.hudActions.initiative(ctrl);
  assert.equal(nativeOptions[1][1].event, ctrl);
  assert.equal(nativeOptions[1][1].disadvantage, true);
  await app.hudActions.companionback();
  await app.hudActions.combatmode();
  entries[0].initiative = null;
  await app.hudActions.companionsinitiative(shift);
  assert.equal(nativeOptions.length, 4);
  assert.ok(
    nativeOptions.slice(2).every(([, options]) => options.event === shift)
  );
  await app.close();
});

test("ambiguous actor row has no turn highlight when the encounter has no active combatant", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const base = f.npc();
  f.token(base, "one");
  f.token(base, "two");
  const { combat } = combatFor(f, []);
  combat.combatant = null;
  const [entry] = await ownedCompanions(f.actor);
  assert.equal(companionInitiative(entry).isTurn, false);
});

test("group initiative rolls all exact tokens once and golden row/header/siblings follow native turns", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const base = f.npc();
  const first = f.token(base, "first"),
    second = f.token(base, "second"),
    wolf = f.token(f.npc("wolf"), "wolf");
  const { combat, entries } = combatFor(f, [first, second, wolf]);
  combat.combatant = entries[1];
  entries[0].initiative = 20;
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  assert.equal(
    app.element.querySelector(".ws-companion-open.ws-companion-turn").dataset
      .companionUuid,
    base.uuid
  );
  await Promise.all([
    app.hudActions.companionsinitiative(),
    app.hudActions.companionsinitiative()
  ]);
  assert.deepEqual(
    f.calls.filter(call => call[0] === "initiative").map(call => call[1]),
    [[second.id], [wolf.id]]
  );
  await app.hudActions.opencompanion(null, target(base.uuid));
  await select(f.pickers.at(-1), 1);
  assert.equal(__adventurerHud.actor, second.actor);
  assert.ok(app.element.querySelector(".ws-actor-identity.ws-companion-turn"));
  await app.hudActions.opencompanion(null, target(wolf.uuid));
  assert.equal(__adventurerHud.actor, wolf.actor);
  assert.equal(
    app.element.querySelector(".ws-companion-switch.ws-companion-turn").dataset
      .companionUuid,
    base.uuid
  );
  await app.hudActions.companionback();
  await app.hudActions.combatmode();
  assert.equal(__adventurerHud.actor, f.actor);
  await app.close();
});

test("companion initiative placeholders become available on joining combat and remain disabled on leaving", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const base = f.npc();
  const first = f.token(base, "first"),
    second = f.token(base, "second");
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const rowButton = () =>
    app.element.querySelector('[data-action="companioninitiative"]');
  assert.equal(rowButton().disabled, true);
  assert.ok(rowButton().querySelector(".fa-dice-d20"));
  assert.equal(
    app.element.querySelector('[data-action="companionsinitiative"]'),
    null
  );
  const { combat, entries } = combatFor(f, [second]);
  combat.started = false;
  f.hooks.callAll("createCombatant", entries[0]);
  await waitFor(() => rowButton() && !rowButton().disabled);
  assert.equal(rowButton().disabled, false);
  await app.hudActions.companioninitiative(null, target(base.uuid));
  assert.deepEqual(f.calls, [
    ["initiative", [second.id], { updateTurn: true }]
  ]);
  assert.equal(f.pickers.length, 1); // HUD only: the sole participant needs no picker.
  await app.hudActions.opencompanion(null, target(base.uuid));
  await select(f.pickers.at(-1), 0);
  assert.equal(__adventurerHud.actor, first.actor);
  assert.equal(app.element.querySelector('[data-action="initiative"]'), null);
  await app.hudActions.companionback();
  await app.hudActions.combatmode();
  await app.hudActions.opencompanion(null, target(base.uuid));
  await select(f.pickers.at(-1), 1);
  assert.ok(app.element.querySelector('[data-action="initiative"]'));
  combat.combatants = [];
  f.hooks.callAll("deleteCombatant", entries[0]);
  await waitFor(() => !app.element.querySelector('[data-action="initiative"]'));
  await app.hudActions.companionback();
  await app.hudActions.combatmode();
  assert.equal(rowButton().disabled, true);
  assert.ok(rowButton().querySelector(".fa-dice-d20"));
  await app.close();
});

test("group initiative hides after every roll and returns when a roll is cleared", async () => {
  const f = await fixture({
    values: {
      showModeNavigation: true,
      showCompanionHealth: false,
      showCompanionPortraits: false,
      showCompanionInitiative: false
    }
  });
  const first = f.token(f.npc("first"), "first");
  const second = f.token(f.npc("second"), "second");
  const { entries } = combatFor(f, [first, second]);
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const group = () =>
    app.element.querySelector('[data-action="companionsinitiative"]');
  assert.ok(group());
  assert.equal(
    app.element.querySelectorAll(".ws-companion-open img").length,
    2
  );
  assert.equal(app.element.querySelectorAll(".ws-companion-hp").length, 2);
  assert.equal(
    app.element.querySelectorAll('[data-action="companioninitiative"]').length,
    2
  );
  entries[0].initiative = 0;
  f.hooks.callAll("updateCombatant", entries[0], { initiative: 0 });
  await waitFor(
    () =>
      app.element.querySelector(".ws-companion-initiative strong")
        ?.textContent === "0"
  );
  assert.ok(group());
  entries[1].initiative = 12;
  f.hooks.callAll("updateCombatant", entries[1], { initiative: 12 });
  await waitFor(() => !group());
  entries[0].initiative = null;
  f.hooks.callAll("updateCombatant", entries[0], { initiative: null });
  await waitFor(group);
  assert.equal(group().disabled, false);
  await app.close();
});

test("encounter companions sort above nonparticipants; unrolled rows show d20 and gold, including a sole participant", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const outsider = f.token(f.npc("a-outsider"), "outsider"),
    unrolled = f.token(f.npc("b-unrolled"), "unrolled"),
    rolled = f.token(f.npc("c-rolled"), "rolled");
  const { combat, entries } = combatFor(f, [unrolled, rolled]);
  entries[1].initiative = 0;
  combat.combatant = entries[0];
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  try {
    await app.hudActions.togglecompanions();
    const rows = () => [...app.element.querySelectorAll(".ws-companion-open")];
    assert.deepEqual(
      rows().map(row => row.dataset.companionUuid),
      [unrolled.baseActor.uuid, rolled.baseActor.uuid, outsider.baseActor.uuid]
    );
    assert.equal(rows()[0].classList.contains("ws-companion-unrolled"), true);
    assert.equal(rows()[1].classList.contains("ws-companion-unrolled"), false);
    assert.equal(rows()[2].classList.contains("ws-companion-unrolled"), false);
    assert.ok(
      rows()[0].parentElement.querySelector(
        ".ws-companion-initiative .fa-dice-d20"
      )
    );
    assert.equal(
      rows()[1].parentElement.querySelector(".ws-companion-initiative strong")
        .textContent,
      "0"
    );
    combat.combatant = null;
    f.hooks.callAll("updateCombat", combat, {});
    await waitFor(
      () => rows()[0].dataset.companionUuid === rolled.baseActor.uuid
    );
    combat.combatants = [entries[0]];
    f.hooks.callAll("deleteCombatant", entries[1]);
    await waitFor(
      () => rows()[1].dataset.companionUuid === outsider.baseActor.uuid
    );
    const group = app.element.querySelector(
      '[data-action="companionsinitiative"]'
    );
    assert.ok(group && !group.disabled);
    await app.hudActions.companionsinitiative({ shiftKey: true });
    assert.deepEqual(
      f.calls.filter(call => call[0] === "initiative").map(call => call[1]),
      [[unrolled.id]]
    );
    assert.equal(app.element.querySelector(".ws-companion-unrolled"), null);
  } finally {
    await app.close();
  }
});

test("rolled companions follow initiative descending and the active exact token always leads", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const slow = f.token(f.npc("a-slow"), "slow"),
    fast = f.token(f.npc("b-fast"), "fast"),
    middle = f.token(f.npc("c-middle"), "middle");
  const { combat, entries } = combatFor(f, [slow, fast, middle]);
  [4, 20, 12].forEach((value, index) => {
    entries[index].initiative = value;
  });
  await f.api.open(f.actor);
  await __adventurerHud.app.hudActions.combatmode();
  const app = __adventurerHud.app;
  try {
    await app.hudActions.togglecompanions();
    const order = () =>
      [...app.element.querySelectorAll(".ws-companion-open")].map(
        row => row.dataset.companionUuid
      );
    assert.deepEqual(order(), [
      fast.baseActor.uuid,
      middle.baseActor.uuid,
      slow.baseActor.uuid
    ]);
    combat.combatant = entries[0];
    f.hooks.callAll("updateCombat", combat, {});
    await waitFor(() => order()[0] === slow.baseActor.uuid);
    assert.deepEqual(order(), [
      slow.baseActor.uuid,
      fast.baseActor.uuid,
      middle.baseActor.uuid
    ]);
    combat.combatant = entries[2];
    f.hooks.callAll("updateCombat", combat, {});
    await waitFor(() => order()[0] === middle.baseActor.uuid);
    assert.deepEqual(order(), [
      middle.baseActor.uuid,
      fast.baseActor.uuid,
      slow.baseActor.uuid
    ]);
  } finally {
    await app.close();
  }
});
