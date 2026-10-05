import assert from "node:assert/strict";
import test from "node:test";
import { waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { SETTINGS } from "../scripts/settings.js";
import {
  startDiagnosticRecording,
  stopDiagnosticRecording,
  clearDiagnostics
} from "../scripts/diagnostics.js";
import { combatFor, fixture, select, target } from "./helpers/companions.mjs";
import { ACTION_COOLDOWN_MS } from "../scripts/hud/action-cooldown.js";

restoreGlobalsAfterEach();

test("ending a companion turn returns to the exact owner token; cancellation stays in the companion panel", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const f = await fixture({ values: { companionAutoFocus: true } });
  const hero = f.token(f.actor, "hero"),
    summon = f.token(f.npc(), "summon");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  const { combat, entries } = combatFor(f, [hero, summon]);
  combat.combatant = entries[1];
  combat.round = 1;
  combat.turn = 1;
  let advances = 0;
  combat.nextTurn = async () => {
    advances++;
    return null;
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    await app.hudActions.opencompanion(null, target(summon.uuid));
    await app.hudActions.endturn();
    assert.equal(__adventurerHud.actor, summon.actor);
    assert.equal(advances, 1);
    time += ACTION_COOLDOWN_MS;
    combat.nextTurn = async () => {
      advances++;
      combat.round++;
      combat.turn = 0;
      combat.combatant = entries[0];
      f.hooks.callAll("updateCombat", combat, { turn: 0, round: 2 });
      return combat;
    };
    await app.hudActions.endturn();
    assert.equal(advances, 2);
    assert.equal(__adventurerHud.app, app);
    assert.equal(__adventurerHud.actor, f.actor);
    assert.equal(canvas.tokens.controlled[0].document, hero);
    assert.equal(
      app.element.querySelector('[data-action="companionback"]'),
      null
    );
  } finally {
    await app.close();
  }
});

test("an old companion turn completion cannot replace a newly selected companion", async () => {
  const f = await fixture();
  const first = f.token(f.npc("first"), "first"),
    second = f.token(f.npc("second"), "second");
  const { combat, entries } = combatFor(f, [first, second]);
  combat.combatant = entries[0];
  let finish;
  combat.nextTurn = () =>
    new Promise(resolve => {
      finish = () => {
        combat.combatant = entries[1];
        resolve(combat);
      };
    });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    await app.hudActions.opencompanion(null, target(first.uuid));
    const pending = app.hudActions.endturn();
    await waitFor(() => typeof finish === "function");
    await app.hudActions.opencompanion(null, target(second.uuid));
    finish();
    await pending;
    assert.equal(__adventurerHud.actor, second.actor);
    assert.ok(app.element.querySelector('[data-action="companionback"]'));
  } finally {
    await app.close();
  }
});

test("world and synthetic hero HUDs return to the exact selected unlinked token in both modes", async () => {
  for (const world of [true, false])
    for (const mode of ["normal", "combatmode"]) {
      const f = await fixture({
        values: { companionAutoFocus: true, showModeNavigation: true }
      });
      f.token(f.actor, "first");
      const hero = f.token(f.actor, "second");
      hero.actor.type = "character";
      hero.actor.isToken = true;
      const summon = f.token(f.npc(), "summon");
      const displayed = world ? f.actor : hero.actor;
      canvas.tokens.controlled = [f.placeables.get(hero.id)];
      await f.api.open(displayed);
      let app = __adventurerHud.app;
      await app.hudActions[mode]();
      await app.hudActions.opencompanion(null, target(summon.uuid));
      f.placeables.get(hero.id).visible = false;
      await app.hudActions.companionback();
      app = __adventurerHud.app;
      assert.equal(__adventurerHud.actor, displayed);
      assert.equal(canvas.tokens.controlled[0].document, hero);
      f.current.set(SETTINGS.companionAutoFocus, false);
      await app.hudActions.opencompanion(null, target(summon.uuid));
      await app.hudActions.actorcenter();
      await app.hudActions.companionback();
      app = __adventurerHud.app;
      assert.equal(canvas.tokens.controlled[0].document, summon);
      await app.hudActions.actorcenter();
      assert.equal(canvas.tokens.controlled[0].document, hero);
      await app.close();
    }
});

test("main synthetic hero refresh replaces its Actor instance and invalidates old commands", async () => {
  const f = await fixture();
  const token = f.token(f.actor, "hero");
  token.actor.type = "character";
  token.actor.isToken = true;
  canvas.tokens.controlled = [f.placeables.get(token.id)];
  await f.api.open(token.actor);
  const app = __adventurerHud.app;
  const stale = app.hudActions;
  const replacement = {
    ...token.actor,
    system: structuredClone(token.actor.system)
  };
  replacement.system.attributes.hp.value = 4;
  token.actor = replacement;
  f.documents.set(replacement.uuid, replacement);
  f.hooks.callAll("updateActorDelta", { parent: token });
  await waitFor(
    () => __adventurerHud.actor === replacement && app.hudActions !== stale
  );
  assert.equal(__adventurerHud.app, app);
  await stale.ability(null, { dataset: { key: "str", type: "check" } });
  assert.equal(
    f.calls.some(call => call[0] === "roll"),
    false
  );
  assert.equal(
    app.element
      .querySelector('[data-action="edithp"]')
      .textContent.includes("4"),
    true
  );
  await app.close();
});

test("return without a remembered hero token asks once and validates the exact choice", async () => {
  const f = await fixture({ values: { companionAutoFocus: true } });
  f.token(f.actor, "first");
  const hero = f.token(f.actor, "second");
  const summon = f.token(f.npc(), "summon");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(summon.uuid));
  f.calls.length = 0;
  await app.hudActions.companionback();
  assert.equal(__adventurerHud.actor, summon.actor);
  assert.deepEqual(f.calls, []);
  hero.actor.isOwner = false;
  await select(f.pickers.at(-1), 1);
  assert.equal(__adventurerHud.actor, summon.actor);
  assert.deepEqual(f.calls, []);
  hero.actor.isOwner = true;
  await app.hudActions.companionback();
  await select(f.pickers.at(-1), 1);
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(canvas.tokens.controlled[0].document, hero);
  assert.deepEqual(f.calls, [
    ["control", hero.uuid],
    ["pan", f.placeables.get(hero.id).center]
  ]);
  await app.hudActions.opencompanion(null, target(summon.uuid));
  f.calls.length = 0;
  await app.hudActions.companionback();
  assert.equal(canvas.tokens.controlled[0].document, hero);
  assert.equal(
    f.pickers.filter(p => p.options.classes.includes("ws-companion-picker"))
      .length,
    2
  );
  await app.close();
});

test("return after the remembered hero token is deleted never substitutes another hero token", async () => {
  const f = await fixture({ values: { companionAutoFocus: true } });
  const other = f.token(f.actor, "other");
  const hero = f.token(f.actor, "hero");
  const summon = f.token(f.npc(), "summon");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  const { combat } = combatFor(f, [other]);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(summon.uuid));
  canvas.scene.tokens.delete(hero.id);
  f.documents.delete(hero.uuid);
  f.placeables.delete(hero.id);
  f.calls.length = 0;
  await app.hudActions.companionback();
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(canvas.tokens.controlled[0].document, summon);
  assert.deepEqual(f.calls, []);
  assert.equal(app.element.querySelector('[data-action="initiative"]'), null);
  assert.equal(combat.combatants[0].initiative, null);
  await app.hudActions.actorcenter();
  assert.deepEqual(f.calls, []);
  await app.close();
});

test("a GM transition closes the named HP dialog and rejects its delayed save", async () => {
  const f = await fixture({
    isGM: true,
    values: { gmEnabled: true, gmFollowTurn: false }
  });
  const one = f.token(f.npc("one"), "one"),
    two = f.token(f.npc("two"), "two");
  const { combat, entries } = combatFor(f, [one, two]);
  Object.assign(combat, {
    id: "fight",
    scene: canvas.scene,
    turns: entries,
    combatant: entries[0]
  });
  for (const entry of entries) entry.players = [];
  combat.combatants = itemCollection(entries);
  await f.api.open();
  const app = __adventurerHud.app;
  await app.hudActions.edithp({ shiftKey: false });
  const hpDialog = f.pickers.at(-1);
  assert.equal(hpDialog.options.window.title.includes(one.actor.name), true);
  await app.hudActions.gmselect(null, {
    dataset: { combatantId: entries[1].id }
  });
  assert.equal(__adventurerHud.actor, two.actor);
  assert.equal(hpDialog.rendered, false);
  await hpDialog.options.buttons[0].callback(null, {
    form: {
      elements: { namedItem: name => ({ value: name === "value" ? "1" : "" }) }
    }
  });
  assert.equal(one.actor.system.attributes.hp.value, 12);
  assert.equal(two.actor.system.attributes.hp.value, 12);
  assert.equal(
    f.calls.some(call => call[0] === "update"),
    false
  );
  await app.close();
});

test("ambiguous actor rows pick exact tokens for ping and recheck permissions at submission", async () => {
  const f = await fixture();
  const base = f.npc();
  const first = f.token(base, "first"),
    second = f.token(base, "second");
  canvas.tokens.controlled = [f.placeables.get(first.id)];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.companionping(null, target(base.uuid));
  assert.deepEqual(f.calls, []);
  await select(f.pickers.at(-1), 1);
  assert.deepEqual(f.calls, [["ping", f.placeables.get(second.id).center]]);
  assert.equal(canvas.tokens.controlled[0].document, first);
  f.calls.length = 0;
  await app.hudActions.companionsheet(null, target(base.uuid));
  second.actor.isOwner = false;
  await select(f.pickers.at(-1), 1);
  assert.deepEqual(f.calls, []);
  await app.close();
});

test("collapsible companions share character modes, retain actions and save expansion across sessions", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  f.token(f.npc(), "owl");
  await f.api.open(f.actor);
  let app = __adventurerHud.app;
  assert.equal(
    app.element
      .querySelector('[data-action="togglecompanions"]')
      .getAttribute("aria-expanded"),
    "false"
  );
  assert.equal(app.element.querySelector(".ws-companions-list"), null);
  await app.options.actions.togglecompanions();
  assert.ok(app.element.querySelector('.ws-nav[data-view="inventory"]'));
  assert.ok(app.element.querySelector('[data-action="shortrest"]'));
  assert.ok(app.element.querySelector(".ws-companions-list"));
  await app.options.actions.combatmode();
  assert.ok(
    app.element.querySelector(
      '#ws-combat .ws-ability-cards [data-action="ability"]'
    )
  );
  assert.ok(app.element.querySelector("#ws-combat .ws-companions-list"));
  assert.equal(
    app.element.querySelector('[data-action="combatmode"]').disabled,
    true
  );
  await app.options.actions.normal();
  assert.ok(app.element.querySelector("#ws-main .ws-companions-list"));
  await app.options.actions.togglecompanions();
  assert.equal(app.element.querySelector(".ws-companions-list"), null);
  assert.ok(app.element.querySelector('.ws-nav[data-view="inventory"]'));
  await app.close();
  await f.api.open(f.actor);
  app = __adventurerHud.app;
  assert.equal(
    app.element
      .querySelector('[data-action="togglecompanions"]')
      .getAttribute("aria-expanded"),
    "false"
  );
  await app.options.actions.togglecompanions();
  await app.close();
  await f.api.open(f.actor);
  app = __adventurerHud.app;
  assert.ok(app.element.querySelector(".ws-companions-list"));
  await app.options.actions.view(null, { dataset: { view: "inventory" } });
  await waitFor(
    () =>
      f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
      "inventory"
  );
  await app.options.actions.view(null, { dataset: { view: "main" } });
  await waitFor(
    () =>
      f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
      "main"
  );
  assert.ok(app.element.querySelector(".ws-companions-list"));
  await app.close();
});

test("companion skills respect the combat skill visibility setting live", async () => {
  const f = await fixture({ values: { showCombatSkills: false } });
  CONFIG.DND5E.skills = { acr: { label: "Acrobatics" } };
  const token = f.token(f.npc(), "owl");
  token.actor.system.skills = { acr: { prof: 1, total: 3 } };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(token.uuid));
  assert.equal(app.element.querySelector('[data-category="skills"]'), null);
  f.current.set(SETTINGS.showCombatSkills, true);
  app.refreshFromSettings();
  assert.ok(app.element.querySelector('[data-category="skills"]'));
  await app.hudActions.combatfilter(null, { dataset: { category: "skills" } });
  assert.ok(app.element.querySelector('[data-action="skill"]'));
  f.current.set(SETTINGS.showCombatSkills, false);
  app.refreshFromSettings();
  assert.equal(app.element.querySelector('[data-category="skills"]'), null);
  assert.equal(app.element.querySelector('[data-action="skill"]'), null);
  await app.close();
});

test("automatic actor refresh keeps the caster HUD and closing cannot reopen it after unlinked token focus", async () => {
  const f = await fixture({ values: { autoUpdateActor: true } });
  const hero = f.token(f.actor, "hero"),
    familiar = f.token(f.npc(), "owl");
  hero.actor.type = "character";
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  const actions = app.hudActions;
  await actions.companionvision(null, target(familiar.uuid));
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(__adventurerHud.app, app);
  assert.equal(app.hudActions, actions);
  assert.equal(
    app.element
      .querySelector('[data-action="companionvision"]')
      .getAttribute("aria-pressed"),
    "true"
  );
  assert.deepEqual(
    canvas.tokens.controlled.map(p => p.document.uuid),
    [hero.uuid]
  );
  await app.close();
  assert.equal(f.visionSources.has(familiar.uuid), false);
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(__adventurerHud.app, null);
});

test("automatic focus can be disabled live while manual focus works in exploration and combat", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const hero = f.token(f.actor, "hero", true);
  const token = f.token(f.npc(), "owl");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.equal(
    app.element.querySelector('#ws-main [data-action="actorcenter"]').disabled,
    false
  );
  await app.hudActions.actorcenter();
  assert.deepEqual(f.calls, [
    ["control", hero.uuid],
    ["pan", f.placeables.get(hero.id).center]
  ]);
  f.calls.length = 0;
  await app.hudActions.opencompanion(null, target(token.uuid));
  assert.deepEqual(f.calls, []);
  assert.equal(
    app.element.querySelector('#ws-combat [data-action="actorcenter"]')
      .disabled,
    false
  );
  await app.hudActions.actorcenter();
  assert.deepEqual(f.calls, [
    ["control", token.uuid],
    ["pan", f.placeables.get(token.id).center]
  ]);
  f.calls.length = 0;
  f.current.set(SETTINGS.companionAutoFocus, true);
  await app.hudActions.companionback();
  assert.equal(f.calls[0][1], hero.uuid);
  f.calls.length = 0;
  f.current.set(SETTINGS.companionAutoFocus, false);
  await app.hudActions.opencompanion(null, target(token.uuid));
  await app.hudActions.companionback();
  assert.deepEqual(f.calls, []);
  await app.close();
});

test("companion return button names the owner in both languages and escapes their name", async () => {
  for (const language of ["en", "ru"]) {
    const f = await fixture({ values: { language } });
    f.actor.name = 'Aria <img src=x onerror="alert(1)"> & friends';
    const summon = f.token(f.npc(), "summon");
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    await app.hudActions.opencompanion(null, target(summon.uuid));
    const button = app.element.querySelector('[data-action="companionback"]');
    const label = `${language === "ru" ? "Вернуться к" : "Return to"} ${f.actor.name}`;
    assert.equal(button.textContent, label);
    assert.equal(button.title, label);
    assert.equal(button.querySelector("img"), null);
    await app.hudActions.companionback();
    assert.equal(__adventurerHud.actor, f.actor);
    await app.close();
  }
});

test("automatic focus tolerates companions without a current scene token", async () => {
  const f = await fixture({ values: { companionAutoFocus: true } });
  const npc = f.npc();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(npc.uuid));
  assert.equal(__adventurerHud.actor, npc);
  assert.equal(
    app.element.querySelector('[data-action="actorcenter"]').disabled,
    true
  );
  assert.deepEqual(f.calls, []);
  await app.hudActions.companionback();
  assert.equal(__adventurerHud.actor, f.actor);
  assert.deepEqual(f.calls, []);
  await app.close();
});

test("owner panel opens owned creature actions in one window and returns without selecting any token", async () => {
  const f = await fixture();
  const actor = f.npc();
  const token = f.token(actor, "owl");
  token.actor.items.set("bite", {
    id: "bite",
    name: "Bite",
    type: "weapon",
    system: {},
    use: () => f.calls.push(["bite", token.actor.uuid])
  });
  const moduleSubscriptions = f.callbacks.size;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const subscriptions = f.callbacks.size;
  await app.hudActions.togglecompanions();
  assert.equal(app.element.querySelectorAll(".ws-companion-row").length, 1);
  assert.equal(
    f.current.get(SETTINGS.panelStates)[f.actor.uuid].companionsExpanded,
    true
  );
  const ownerHp = f.actor.system.attributes.hp.value;
  await app.hudActions.opencompanion(null, target(token.uuid));
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, token.actor);
  assert.equal(document.querySelectorAll(".ws-rolls-dialog").length, 1);
  assert.equal(app.element.querySelector(".ws-companions-panel"), null);
  assert.ok(app.element.querySelector('[data-action="companionback"]'));
  for (const action of [
    "inspiration",
    "death",
    "shortrest",
    "longrest",
    "togglefavorite",
    "gmnext"
  ])
    assert.equal(app.element.querySelector(`[data-action="${action}"]`), null);
  await app.hudActions.useitem({}, { dataset: { itemId: "bite" } });
  assert.deepEqual(f.calls, [["bite", token.actor.uuid]]);
  assert.equal(f.actor.system.attributes.hp.value, ownerHp);
  assert.deepEqual(canvas.tokens.controlled, []);
  await app.hudActions.companionback();
  assert.equal(__adventurerHud.actor, f.actor);
  assert.equal(__adventurerHud.app, app);
  assert.ok(app.element.querySelector(".ws-companions-list"));
  assert.equal(f.callbacks.size, subscriptions);
  await app.close();
  assert.equal(f.callbacks.size, moduleSubscriptions);
});

test("HP editing and sheets address the chosen summon, while ping preserves token selection", async () => {
  const f = await fixture();
  const base = f.npc();
  const first = f.token(base, "first");
  const second = f.token(base, "second");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.companionsheet(null, target(second.uuid));
  await select(f.pickers.at(-1), 1);
  assert.deepEqual(f.calls, [["sheet", second.actor.uuid]]);
  assert.deepEqual(canvas.tokens.controlled, []);
  await app.hudActions.companionping(null, target(second.uuid));
  await select(f.pickers.at(-1), 1);
  assert.deepEqual(f.calls[1], ["ping", f.placeables.get(second.id).center]);
  assert.deepEqual(canvas.tokens.controlled, []);
  await app.hudActions.opencompanion(null, target(second.uuid));
  await select(f.pickers.at(-1), 1);
  const hp = await app.hudActions.edithp({});
  await hp.options.buttons[0].callback(
    {},
    {
      form: {
        elements: {
          namedItem: name => ({ value: name === "value" ? "7" : "" })
        }
      }
    }
  );
  assert.equal(second.actor.system.attributes.hp.value, 7);
  assert.equal(first.actor.system.attributes.hp.value, 12);
  assert.equal(base.system.attributes.hp.value, 12);
  assert.equal(f.actor.system.attributes.hp.value, 12);
  await hp.close();
  await app.close();
});

test("language changes keep a verified companion in the same window, and unrelated NPCs remain unsupported", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await fixture();
  const token = f.token(f.npc(), "owl");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.opencompanion(null, target(token.uuid));
  const previous = app.hudActions;
  const unrelated = f.npc("wolf");
  canvas.tokens.controlled = [{ actor: unrelated }];
  await game.settings.set("adventurer-hud", SETTINGS.language, "en");
  t.mock.timers.tick(50);
  await waitFor(
    () =>
      app.hudActions !== previous &&
      app.element.querySelector('[data-action="companionback"]')
  );
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, token.actor);
  assert.equal(__adventurerHud.tokenUuid, token.uuid);
  await f.api.open(unrelated);
  assert.equal(__adventurerHud.actor, token.actor);
  await app.close();
});

test("recording indicator follows session reuse and releases its listener when HUD closes", async () => {
  clearDiagnostics();
  const f = await fixture();
  const token = f.token(f.npc(), "companion");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  startDiagnosticRecording();
  assert.equal(
    app.element.querySelectorAll("[data-diagnostic-recording]").length,
    1
  );
  await app.hudActions.opencompanion(null, target(token.uuid));
  assert.equal(
    app.element.querySelectorAll("[data-diagnostic-recording]").length,
    1
  );
  const oldElement = app.element;
  await app.close();
  stopDiagnosticRecording();
  startDiagnosticRecording();
  assert.equal(
    oldElement.querySelectorAll("[data-diagnostic-recording]").length,
    0
  );
  stopDiagnosticRecording();
  clearDiagnostics();
});
