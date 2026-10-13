import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { flushPanelPreferences } from "../scripts/hud/panel-preferences.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { ACTION_COOLDOWN_MS } from "../scripts/hud/action-cooldown.js";
restoreGlobalsAfterEach();
async function move(app, key, lane) {
  const target = app.element.querySelector(
    '[data-hud-block="' + key + '"] [data-action="hudblockmove"]'
  );
  assert.ok(target, "movable " + key);
  target.dataset.hudLane = lane;
  await app.hudActions.hudblockmove(null, target);
}
async function hide(app, key) {
  const target = app.element.querySelector(
    '[data-hud-block="' + key + '"] [data-action="hudblockhide"]'
  );
  assert.ok(target, "hideable " + key);
  await app.hudActions.hudblockhide(null, target);
}

test("initiative remains one direct native command with its bonus and original event", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const f = await hudFixture({ combat: true });
  f.actor.system.attributes.init = { total: 7 };
  const calls = [];
  f.actor.getInitiativeRoll = options => {
    calls.push(options);
    return { total: 17, options };
  };
  game.combat.rollInitiative = async () => {};
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    const button = app.element.querySelector('[data-action="initiative"]');
    assert.equal(
      button.querySelector(".ws-initiative-bonus").textContent,
      "+7"
    );
    assert.equal(button.hasAttribute("aria-expanded"), false);
    assert.equal(app.element.querySelector(".ws-initiative-details"), null);
    const event = { altKey: true, shiftKey: true };
    await app.hudActions.initiative(event, button);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].event, event);
    game.combat.combatant.initiative = 0;
    time += ACTION_COOLDOWN_MS;
    app.refreshFromSettings();
    assert.equal(
      app.element
        .querySelector('[data-action="initiative"]')
        .hasAttribute("disabled"),
      true
    );
  } finally {
    await app.close();
  }
});

test("weapon mastery uses native availability, with a conservative fallback for older system data", () => {
  globalThis.game = { i18n: { localize: value => value } };
  globalThis.CONFIG = {
    DND5E: { weaponMasteries: { push: { label: "Push" } } }
  };
  const actor = {
    system: {
      traits: { weaponProf: { mastery: { value: new Set(["pike"]) } } }
    }
  };
  const item = {
    type: "weapon",
    system: { mastery: "push", type: { baseItem: "pike" } }
  };
  assert.deepEqual(dnd5eAdapter.weaponMastery(actor, item), {
    label: "Push",
    available: true
  });
  item.system.masteryOptions = null;
  assert.equal(dnd5eAdapter.weaponMastery(actor, item).available, false);
  item.system.masteryOptions = [{ value: "push", label: "Push" }];
  assert.equal(dnd5eAdapter.weaponMastery(actor, item).available, true);
  item.type = "spell";
  assert.equal(dnd5eAdapter.weaponMastery(actor, item), null);
});

test("feature source groups collapse, retain hidden cards and restore their state on reopening", async () => {
  const f = await hudFixture({
    combat: true,
    hudState: { combatCategory: "features" }
  });
  CONFIG.DND5E.featureTypes = {
    class: { label: "Class" },
    race: { label: "Species" }
  };
  for (const [id, type] of [
    ["class-feat", "class"],
    ["race-feat", "race"]
  ])
    f.actor.items.set(id, {
      id,
      name: id,
      type: "feat",
      system: {
        type: { value: type },
        activities: [{ activation: { type: "action" } }]
      }
    });
  await f.api.open(f.actor);
  let app = __adventurerHud.app;
  try {
    await app.hudActions.combatfilter(null, {
      dataset: { category: "features" }
    });
    const group = app.element.querySelector('[data-feature-group="class"]');
    assert.ok(group);
    await app.hudActions.togglefeaturegroup(null, group);
    assert.equal(
      app.element
        .querySelector('[data-feature-group="class"]')
        .getAttribute("aria-expanded"),
      "false"
    );
    assert.equal(
      app.element
        .querySelector('[data-feature-group="race"]')
        .getAttribute("aria-expanded"),
      "true"
    );
    await flushPanelPreferences();
    await app.close();
    await f.api.open(f.actor);
    app = __adventurerHud.app;
    assert.equal(
      app.element
        .querySelector('[data-feature-group="class"]')
        .getAttribute("aria-expanded"),
      "false"
    );
    await app.hudActions.togglefeaturegroup(
      null,
      app.element.querySelector('[data-feature-group="class"]')
    );
    assert.equal(
      app.element
        .querySelector('[data-feature-group="class"]')
        .getAttribute("aria-expanded"),
      "true"
    );
  } finally {
    if (app.rendered) {
      if (app.hudEditingState?.()) await app.hudActions.togglehudedit();
      await app.close();
    }
  }
});

test("footer blocks move between lanes, retain native controls and hide an empty footer", async () => {
  const f = await hudFixture({
    values: { playerFooter: true, diceTray: true }
  });
  await f.api.open(f.actor);
  let app = __adventurerHud.app;
  try {
    await app.hudActions.togglehudedit();
    for (const key of ["recent-actions", "footer-controls"])
      await move(app, key, "info");
    assert.equal(
      app.element.querySelectorAll('[data-action="actorcenter"]').length,
      1
    );
    assert.equal(
      app.element.querySelectorAll('[data-dice-tray="toggle"]').length,
      1
    );
    for (const key of ["recent-actions", "footer-controls"])
      assert.equal(
        app.element.querySelector('[data-hud-block="' + key + '"]')
          .parentElement.dataset.hudLane,
        "info"
      );
    await hide(app, "effects");
    await app.hudActions.togglehudedit();
    assert.equal(app.element.querySelector(".ws-player-footer").hidden, true);
    await flushPanelPreferences();
    await app.close();
    await f.api.open(f.actor);
    app = __adventurerHud.app;
    assert.equal(
      app.element.querySelector('[data-hud-block="footer-controls"]')
        .parentElement.dataset.hudLane,
      "info"
    );
    assert.equal(app.element.querySelector(".ws-player-footer").hidden, true);
    await app.hudActions.togglehudedit();
    await move(app, "footer-controls", "footer");
    await app.hudActions.togglehudedit();
    assert.equal(app.element.querySelector(".ws-player-footer").hidden, false);
    assert.ok(
      app.element.querySelector('.ws-player-footer [data-action="actorping"]')
    );
  } finally {
    if (app.rendered) {
      if (app.hudEditingState?.()) await app.hudActions.togglehudedit();
      await app.close();
    }
  }
});

test("inventory summary stays in Inventory and can be hidden and restored with Inventory closed", async () => {
  const f = await hudFixture();
  f.actor.system.currency = { gp: 37 };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const summary = () => app.element.querySelector('[data-hud-block="weight"]');
  const toggle = () =>
    app.element.querySelector(
      '[data-action="hudblockhide"][data-hud-key="weight"]'
    );
  await app.hudActions.togglehudedit();
  assert.equal(summary(), null);
  assert.equal(app.element.querySelector('[data-hud-block="currency"]'), null);
  await app.hudActions.hudblockhide(null, toggle());
  await app.hudActions.view(null, { dataset: { view: "inventory" } });
  assert.ok(summary().querySelector(".ws-inventory-weight"));
  assert.ok(summary().querySelector(".ws-inventory-currency"));
  assert.ok(summary().closest('[data-hud-block="tab:inventory"]'));
  assert.equal(summary().querySelector('[data-action="hudblockmove"]'), null);
  await app.hudActions.hudblockmove(null, {
    dataset: { hudKey: "weight", hudLane: "info" }
  });
  assert.ok(summary().closest('[data-hud-block="tab:inventory"]'));
  await app.hudActions.togglehudedit();
  assert.equal(summary().classList.contains("ws-hud-block-hidden"), true);
  f.actor.system.currency.gp = 42;
  app.refreshFromSettings();
  assert.match(summary().textContent, /42/);
  assert.equal(app.element.querySelectorAll(".ws-inventory-summary").length, 1);
  await flushPanelPreferences();
  await waitFor(() =>
    f.current
      .get("panelStates")
      ?.["player:layout"]?.hudLayouts?.["regular:footer"]?.hidden.includes(
        "weight"
      )
  );
  await app.close();
  await f.api.open(f.actor);
  const reopened = __adventurerHud.app;
  await reopened.hudActions.togglehudedit();
  await reopened.hudActions.hudblockhide(
    null,
    reopened.element.querySelector(
      '[data-action="hudblockhide"][data-hud-key="weight"]'
    )
  );
  await reopened.hudActions.view(null, { dataset: { view: "inventory" } });
  assert.equal(
    reopened.element
      .querySelector(".ws-inventory-summary")
      .classList.contains("ws-hud-block-hidden"),
    false
  );
  await reopened.hudActions.togglehudedit();
  await reopened.close();
});

test("hiding the requested footer blocks retains the separate native End turn control", async () => {
  const f = await hudFixture({ combat: true, values: { playerFooter: true } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    await app.hudActions.togglehudedit();
    for (const key of ["effects", "recent-actions", "footer-controls"])
      await hide(app, key);
    await app.hudActions.togglehudedit();
    assert.equal(app.element.querySelector(".ws-player-footer").hidden, false);
    assert.ok(
      app.element.querySelector('.ws-footer-turn [data-action="endturn"]')
    );
  } finally {
    await app.close();
  }
});
