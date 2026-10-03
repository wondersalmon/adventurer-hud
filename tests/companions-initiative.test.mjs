import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { ownedCompanions } from "../scripts/hud/companions/companions.js";
import { companionInitiative } from "../scripts/hud/companions/companion-details.js";
import { combatFor, fixture, select, target } from "./helpers/companions.mjs";

restoreGlobalsAfterEach();

test("row, header and group initiative pass the original event to native D&D rolls", async () => {
  const f = await fixture();
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
  entries[0].initiative = null;
  await app.hudActions.companionsinitiative(shift);
  assert.equal(nativeOptions.length, 4);
  assert.ok(
    nativeOptions.slice(2).every(([, options]) => options.event === shift)
  );
  await app.close();
});

test("ambiguous actor row has no turn highlight when the encounter has no active combatant", async () => {
  const f = await fixture();
  const base = f.npc();
  f.token(base, "one");
  f.token(base, "two");
  const { combat } = combatFor(f, []);
  combat.combatant = null;
  const [entry] = await ownedCompanions(f.actor);
  assert.equal(companionInitiative(entry).isTurn, false);
});

test("group initiative rolls all exact tokens once and golden row/header/siblings follow native turns", async () => {
  const f = await fixture();
  const base = f.npc();
  const first = f.token(base, "first"),
    second = f.token(base, "second"),
    wolf = f.token(f.npc("wolf"), "wolf");
  const { combat, entries } = combatFor(f, [first, second, wolf]);
  combat.combatant = entries[1];
  entries[0].initiative = 20;
  await f.api.open(f.actor);
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
  assert.equal(__adventurerHud.actor, f.actor);
  await app.close();
});

test("initiative controls appear on joining combat and disappear on leaving, like the hero", async () => {
  const f = await fixture();
  const base = f.npc();
  const first = f.token(base, "first"),
    second = f.token(base, "second");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const rowButton = () =>
    app.element.querySelector('[data-action="companioninitiative"]');
  assert.equal(rowButton(), null);
  assert.equal(
    app.element.querySelector('[data-action="companionsinitiative"]'),
    null
  );
  const { combat, entries } = combatFor(f, [second]);
  combat.started = false;
  f.hooks.callAll("createCombatant", entries[0]);
  await waitFor(rowButton);
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
  await app.hudActions.opencompanion(null, target(base.uuid));
  await select(f.pickers.at(-1), 1);
  assert.ok(app.element.querySelector('[data-action="initiative"]'));
  combat.combatants = [];
  f.hooks.callAll("deleteCombatant", entries[0]);
  await waitFor(() => !app.element.querySelector('[data-action="initiative"]'));
  await app.hudActions.companionback();
  assert.equal(rowButton(), null);
  await app.close();
});

test("group initiative hides after every roll and returns when a roll is cleared", async () => {
  const f = await fixture({
    values: {
      showCompanionHealth: false,
      showCompanionPortraits: false,
      showCompanionInitiative: false
    }
  });
  const first = f.token(f.npc("first"), "first");
  const second = f.token(f.npc("second"), "second");
  const { entries } = combatFor(f, [first, second]);
  await f.api.open(f.actor);
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
