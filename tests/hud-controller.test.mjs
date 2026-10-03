import assert from "node:assert/strict";
import test from "node:test";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { ACTION_COOLDOWN_MS } from "../scripts/hud/action-cooldown.js";
import { hudFixture, waitFor } from "./helpers/hud.mjs";

restoreGlobalsAfterEach();

test("exploration exposes native short and long rest and revoking ownership blocks both", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const fixture = await hudFixture();
  const calls = [];
  fixture.actor.shortRest = () => calls.push("short");
  fixture.actor.longRest = () => calls.push("long");
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  assert.ok(app.element.querySelector('[data-action="shortrest"]'));
  assert.ok(app.element.querySelector('[data-action="longrest"]'));
  await app.hudActions.shortrest();
  time += ACTION_COOLDOWN_MS;
  await app.hudActions.longrest();
  assert.deepEqual(calls, ["short", "long"]);
  fixture.actor.isOwner = false;
  fixture.hooks.callAll("updateActor", fixture.actor, { ownership: {} });
  fixture.flushFrames();
  assert.equal(
    app.element.querySelector('[data-action="shortrest"]').disabled,
    true
  );
  assert.equal(
    app.element.querySelector('[data-action="longrest"]').disabled,
    true
  );
  await app.hudActions.shortrest();
  await app.hudActions.longrest();
  assert.deepEqual(calls, ["short", "long"]);
  await app.close();
});

test("open HUD follows granted and revoked ownership without reopening", async () => {
  const fixture = await hudFixture({ owned: false });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  const ability = () => app.element.querySelector('[data-action="ability"]');
  assert.equal(ability().disabled, true);
  fixture.actor.isOwner = true;
  fixture.hooks.callAll("updateActor", fixture.actor, {
    ownership: { player: 3 }
  });
  fixture.flushFrames();
  assert.equal(ability().disabled, false);
  await app.options.actions.inspiration();
  assert.equal(fixture.nativeCalls.length, 1);
  fixture.actor.isOwner = false;
  fixture.hooks.callAll("updateUser", game.user, { role: 1 });
  fixture.flushFrames();
  assert.equal(ability().disabled, true);
  assert.equal(
    app.element.querySelector('[data-action="edithp"]').disabled,
    true
  );
  await app.options.actions.inspiration();
  assert.equal(fixture.nativeCalls.length, 1);
  assert.equal(
    fixture.notifications.at(-1)[1],
    "ADVENTURER_HUD.Warnings.NoPermission"
  );
  assert.equal(__adventurerHud.app, app);
  await app.close();
});

test("HP dialog rejects saving after ownership is revoked", async () => {
  const fixture = await hudFixture();
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  const dialog = await app.options.actions.edithp({});
  fixture.actor.isOwner = false;
  await dialog.options.buttons[0].callback(
    {},
    {
      form: { elements: { namedItem: () => ({ value: "5" }) } }
    }
  );
  assert.deepEqual(fixture.nativeCalls, []);
  assert.equal(
    fixture.notifications.at(-1)[1],
    "ADVENTURER_HUD.Warnings.NoPermission"
  );
  await dialog.close();
  await app.close();
});

for (const combat of [false, true]) {
  test(`shortcut hints follow saved and live settings in ${combat ? "combat" : "exploration"} mode`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const fixture = await hudFixture({
      combat,
      values: { showShortcuts: false }
    });
    fixture.actor.items.set("spell", {
      id: "spell",
      name: "Test spell",
      type: "spell",
      system: { level: 1, activities: [] }
    });
    await fixture.api.open(fixture.actor);
    const app = __adventurerHud.app;
    assert.equal(app.element.querySelector(".ws-shortcuts"), null);

    for (const enabled of [true, false]) {
      await game.settings.set("adventurer-hud", "showShortcuts", enabled);
      t.mock.timers.tick(50);
      for (const view of combat
        ? [null]
        : ["main", "skills", "tools", "spells", "inventory"]) {
        if (view) await app.options.actions.view(null, { dataset: { view } });
        const hints = app.element.querySelector(".ws-shortcuts");
        assert.equal(
          Boolean(hints),
          enabled,
          `${view ?? "combat"}: ${enabled}`
        );
        if (enabled) {
          assert.deepEqual(
            [...hints.querySelectorAll("kbd")].map(key => key.textContent),
            ["Shift", "Alt", "Ctrl"]
          );
        }
        if (view) {
          await waitFor(
            () =>
              fixture.current.get("panelStates")?.[fixture.actor.uuid]
                ?.currentView === view
          );
        }
      }
      assert.equal(__adventurerHud.app, app);
    }
    assert.deepEqual(fixture.notifications, []);
    await app.close();
  });
}

test("header menu toggles the existing mode setting and restores automatic mode when hidden", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = await hudFixture({ combat: true });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  assert.ok(
    app.options.window.controls.some(
      control => control.action === "togglemodes"
    )
  );
  assert.equal(app.element.querySelector(".ws-mode-navigation"), null);

  await app.options.actions.togglemodes();
  t.mock.timers.tick(50);
  assert.equal(game.settings.get("adventurer-hud", "showModeNavigation"), true);
  assert.ok(app.element.querySelector(".ws-mode-navigation"));
  await app.options.actions.normal();
  assert.ok(app.element.querySelector("#ws-main"));

  await app.options.actions.togglemodes();
  t.mock.timers.tick(50);
  assert.equal(
    game.settings.get("adventurer-hud", "showModeNavigation"),
    false
  );
  assert.equal(app.element.querySelector(".ws-mode-navigation"), null);
  assert.ok(app.element.querySelector(".ws-combat-stats"));
  assert.equal(__adventurerHud.app, app);
  assert.deepEqual(fixture.notifications, []);
  await app.close();
});

test("opening a supported actor restores its inventory independently of auto-open and closes cleanly", async () => {
  const fixture = await hudFixture({
    values: {
      autoOpenHud: false,
      panelStates: { "Actor.hero": { currentView: "inventory" } }
    }
  });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  assert.equal(app.rendered, true);
  assert.equal(__adventurerHud.actor, fixture.actor);
  assert.equal(
    app.element.querySelector("#ws-inventory").classList.contains("ws-hidden"),
    false
  );
  assert.equal(app.element.querySelector(".ws-actor-identity strong"), null);
  assert.deepEqual(fixture.notifications, []);
  const subscriptionCount = fixture.callbacks.size;
  await app.close();
  assert.equal(__adventurerHud.app, null);
  assert.equal(__adventurerHud.actor, null);
  assert.ok(fixture.callbacks.size < subscriptionCount);
});

test("language changes reopen the real HUD for its actor despite another selected token", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = await hudFixture();
  await fixture.api.open(fixture.actor);
  const first = __adventurerHud.app;
  canvas.tokens.controlled = [
    { actor: { ...fixture.actor, id: "other", uuid: "Actor.other" } }
  ];
  await game.settings.set("adventurer-hud", "language", "en");
  t.mock.timers.tick(50);
  await waitFor(
    () => __adventurerHud.app?.rendered && __adventurerHud.app !== first
  );
  assert.equal(first.rendered, false);
  assert.equal(
    __adventurerHud.app.options.window.title,
    "Exploration — Hero <One>"
  );
  assert.equal(__adventurerHud.actor, fixture.actor);
  assert.equal(
    __adventurerHud.app.element.querySelector(".ws-actor-identity strong")
      .textContent,
    fixture.actor.name
  );
  assert.deepEqual(fixture.notifications, []);
  await __adventurerHud.app.close();
});

test("native feature changes refresh the selected feature category", async () => {
  const fixture = await hudFixture({ combat: true });
  const item = {
    id: "energy",
    name: "Energy Burst",
    type: "feat",
    parent: fixture.actor,
    system: {
      uses: { value: 1, max: 3 },
      activities: [{ id: "burst", activation: { type: "action" }, use() {} }]
    }
  };
  fixture.actor.items.set(item.id, item);
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  const health = app.element.querySelector(".ws-combat-stats");
  await app.options.actions.combatfilter(null, {
    dataset: { category: "features" }
  });
  assert.equal(app.element.querySelector(".ws-combat-stats"), health);
  assert.match(app.element.textContent, /Energy Burst/);
  item.name = "Updated Burst";
  fixture.hooks.callAll("updateItem", item);
  fixture.flushFrames();
  assert.match(app.element.textContent, /Updated Burst/);
  item.system.activities[0].activation.type = "";
  fixture.hooks.callAll("updateItem", item);
  fixture.flushFrames();
  assert.doesNotMatch(app.element.textContent, /Updated Burst/);
  await app.hudActions.featurefilter();
  assert.match(app.element.textContent, /Updated Burst/);
  fixture.actor.items.delete(item.id);
  fixture.hooks.callAll("deleteItem", item);
  fixture.flushFrames();
  assert.equal(app.element.querySelector('[data-category="features"]'), null);
  await app.close();
});

test("non-owner actions and missing items warn without running native workflows", async () => {
  const fixture = await hudFixture({ owned: false });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  await app.options.actions.useitem({}, { dataset: { itemId: "missing" } });
  await app.options.actions.openitem({}, { dataset: { itemId: "missing" } });
  assert.deepEqual(fixture.nativeCalls, []);
  assert.deepEqual(
    fixture.notifications.map(([, message]) => message),
    [
      "ADVENTURER_HUD.Warnings.NoPermission",
      "ADVENTURER_HUD.Combat.ItemMissing"
    ]
  );
  await app.close();
});

test("rejected native item operations report an error and leave the HUD usable", async t => {
  t.mock.method(console, "error", () => {});
  const fixture = await hudFixture();
  fixture.actor.items.set("sword", {
    id: "sword",
    name: "Sword",
    type: "weapon",
    use: () => Promise.reject(new Error("native failure"))
  });
  await fixture.api.open(fixture.actor);
  const app = __adventurerHud.app;
  await app.options.actions.useitem({}, { dataset: { itemId: "sword" } });
  assert.deepEqual(fixture.notifications, [
    ["error", "Adventurer HUD: operation failed: native failure"]
  ]);
  assert.ok(
    diagnosticReport().events.some(
      entry =>
        entry.scope === "hud.action.useitem" &&
        entry.errorClass === "Error" &&
        entry.message === undefined
    )
  );
  assert.equal(app.rendered, true);
  assert.equal(
    app.element.querySelector('[data-action="togglepin"]').disabled,
    false
  );
  await app.close();
});

test("simultaneous opens leave one HUD and no duplicate subscriptions, including actor fallback", async () => {
  const fixture = await hudFixture();
  await fixture.api.open(fixture.actor);
  const subscriptionCount = fixture.callbacks.size;
  const other = {
    ...fixture.actor,
    id: "other",
    uuid: "Actor.other",
    name: "Other"
  };
  await Promise.all([fixture.api.open(fixture.actor), fixture.api.open(other)]);
  assert.equal(document.querySelectorAll(".ws-rolls-dialog").length, 1);
  assert.equal(__adventurerHud.actor, other);
  assert.equal(fixture.callbacks.size, subscriptionCount);
  await __adventurerHud.app.close();
  await fixture.api.open();
  assert.equal(__adventurerHud.actor, fixture.actor);
  assert.equal(document.querySelectorAll(".ws-rolls-dialog").length, 1);
  assert.deepEqual(fixture.notifications, []);
  await __adventurerHud.app.close();
});

test("native favorite writes serialize rapid changes and recover after a failed save", async t => {
  const fixture = await hudFixture();
  for (const id of ["failed", "sword", "wand"])
    fixture.actor.items.set(id, { id, system: {} });
  await fixture.api.open(fixture.actor);
  const actions = __adventurerHud.app.options.actions;
  const update = fixture.actor.update;
  let failed = false;
  t.mock.method(console, "error", () => {});
  t.mock.method(fixture.actor, "update", async changes => {
    if ("system.favorites" in changes && !failed) {
      failed = true;
      throw Error("save failed");
    }
    return update(changes);
  });
  const toggle = itemId =>
    actions.togglefavorite(null, { dataset: { itemId } });
  await Promise.all([toggle("failed"), toggle("sword"), toggle("wand")]);
  assert.deepEqual(
    fixture.actor.system.favorites.map(f => f.id),
    [".Item.sword", ".Item.wand"]
  );
  await Promise.all([toggle("sword"), toggle("sword")]);
  assert.deepEqual(
    fixture.actor.system.favorites.map(f => f.id),
    [".Item.sword", ".Item.wand"]
  );
  assert.deepEqual(fixture.notifications, [
    ["error", "Adventurer HUD: operation failed: save failed"]
  ]);
  await __adventurerHud.app.close();
});

test("character actions share a cooldown across rolls, description sharing and HUD reopen", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const fixture = await hudFixture();
  let rolls = 0,
    shared = 0;
  fixture.actor.rollAbilityCheck = () => {
    rolls++;
  };
  fixture.actor.rollSavingThrow = () => {
    rolls++;
  };
  fixture.actor.items.set("sword", {
    id: "sword",
    name: "Sword",
    type: "weapon",
    displayCard: () => {
      shared++;
    }
  });
  await fixture.api.open(fixture.actor);
  let actions = __adventurerHud.app.options.actions;
  const check = { dataset: { type: "check", key: "str" } };
  const save = { dataset: { type: "save", key: "dex" } };
  await actions.ability({}, check);
  await actions.ability({}, save);
  await actions.openitem({ shiftKey: true }, { dataset: { itemId: "sword" } });
  assert.equal(rolls, 1);
  assert.equal(shared, 0);
  await actions.toggleabilities();
  assert.equal(fixture.notifications.length, 0);
  await fixture.api.open(fixture.actor);
  actions = __adventurerHud.app.options.actions;
  await actions.ability({}, save);
  assert.equal(rolls, 1);
  time = ACTION_COOLDOWN_MS;
  await actions.ability({}, save);
  assert.equal(rolls, 2);
  time = ACTION_COOLDOWN_MS * 2;
  time = ACTION_COOLDOWN_MS * 3;
  await actions.openitem({ shiftKey: true }, { dataset: { itemId: "sword" } });
  assert.equal(shared, 1);
  await __adventurerHud.app.close();
});

test("GM header switches both presets, including an empty encounter and a selected NPC", async () => {
  const f = await hudFixture({ isGM: true });
  await f.api.open();
  let app = __adventurerHud.app;
  assert.equal(__adventurerHud.preset, "gm");
  assert.ok(app.options.window.controls.some(c => c.action === "togglepreset"));
  canvas.tokens.controlled = [{ actor: { type: "npc" } }];
  await app.options.actions.togglepreset();
  await waitFor(
    () => __adventurerHud.preset === "player" && __adventurerHud.app?.rendered
  );
  app = __adventurerHud.app;
  assert.equal(__adventurerHud.actor, f.actor);
  assert.ok(app.options.window.controls.some(c => c.action === "togglepreset"));
  await app.options.actions.togglepreset();
  await waitFor(
    () => __adventurerHud.preset === "gm" && __adventurerHud.app?.rendered
  );
  await __adventurerHud.app.close();
});

test("HUD theme applies immediately, restores Foundry colors and persists on reopening", async () => {
  const f = await hudFixture({ values: { theme: "light" } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.ok(app.element.classList.contains("ws-theme-light"));
  await game.settings.set("adventurer-hud", "theme", "dark");
  assert.ok(app.element.classList.contains("ws-theme-dark"));
  assert.equal(app.element.classList.contains("ws-theme-light"), false);
  assert.equal(__adventurerHud.app, app);
  await game.settings.set("adventurer-hud", "theme", "auto");
  assert.equal(app.element.classList.contains("ws-theme-dark"), false);
  await game.settings.set("adventurer-hud", "theme", "light");
  await app.close();
  await f.api.open(f.actor);
  assert.ok(__adventurerHud.app.element.classList.contains("ws-theme-light"));
  await __adventurerHud.app.close();
});
import { diagnosticReport } from "../scripts/diagnostics.js";
