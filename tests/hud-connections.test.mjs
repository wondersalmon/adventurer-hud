import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { SETTINGS } from "../scripts/settings.js";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { layoutFixture } from "../test-ui/layout-fixture.mjs";
import { ACTION_COOLDOWN_MS } from "../scripts/hud/action-cooldown.js";

restoreGlobalsAfterEach();

test("column divider keyboard changes persist in settings, and pinning blocks further changes", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    app.setPosition({ width: 900 });
    app.syncHudLayout();
    const view = app.element.querySelector(".ws-player-layout");
    Object.defineProperty(view, "clientWidth", {
      value: 850,
      configurable: true
    });
    view.ownerDocument.defaultView.getComputedStyle = () => ({
      paddingLeft: "0",
      paddingRight: "0"
    });
    const handle = view.querySelector(".ws-column-divider");
    const press = () => {
      const event = new document.defaultView.Event("keydown", {
        bubbles: true
      });
      event.key = "ArrowRight";
      handle.dispatchEvent(event);
    };
    press();
    await waitFor(() => f.current.get(SETTINGS.playerColumnRatio) > 0.48);
    const ratio = f.current.get(SETTINGS.playerColumnRatio);
    await game.settings.set("adventurer-hud", SETTINGS.pinWindow, true);
    press();
    assert.equal(f.current.get(SETTINGS.playerColumnRatio), ratio);
    assert.equal(handle.getAttribute("aria-disabled"), "true");
  } finally {
    await app.close();
  }
});

test("fixed toolbar follows player settings and mode changes without duplicating native commands", async () => {
  const f = await hudFixture({
    combat: true,
    values: { playerFooter: true, showModeNavigation: true }
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    assert.ok(
      app.element.querySelector('.ws-footer-controls [data-action="endturn"]')
    );
    assert.ok(
      app.element.querySelector(
        '.ws-footer-controls [data-action="actorcenter"]'
      )
    );
    assert.ok(
      app.element.querySelector('.ws-footer-controls [data-action="actorping"]')
    );
    assert.equal(
      app.element.querySelectorAll('[data-action="actorcenter"]').length,
      1
    );
    await app.hudActions.normal();
    assert.equal(app.element.querySelector('[data-action="endturn"]'), null);
    assert.ok(app.element.querySelector(".ws-player-footer"));
    await game.settings.set("adventurer-hud", SETTINGS.playerFooter, false);
    assert.equal(app.element.querySelector(".ws-player-footer"), null);
    assert.ok(
      app.element.querySelector(
        '.ws-actor-quick-controls [data-action="actorcenter"]'
      )
    );
    await app.hudActions.combatmode();
    assert.ok(
      app.element.querySelector(
        '.ws-actor-quick-controls [data-action="endturn"]'
      )
    );
  } finally {
    await app.close();
  }
});

test("player rework preserves native roll events, speed expansion and favorites editing across both modes", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const f = await hudFixture({
    combat: true,
    values: { showModeNavigation: true }
  });
  f.actor.system.attributes.movement.fly = 60;
  f.actor.system.currency = { gp: 37, sp: 8 };
  f.actor.system.abilities.dex = { save: { value: 7 }, check: { value: 4 } };
  f.actor.items.set("staff", {
    id: "staff",
    name: "Staff",
    type: "weapon",
    system: { equipped: true }
  });
  const rolls = [];
  f.actor.rollSavingThrow = (...args) => rolls.push(["save", ...args]);
  f.actor.rollAbilityCheck = (...args) => rolls.push(["check", ...args]);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    app.setPosition({ width: 900 });
    app.syncHudLayout();
    for (const mode of ["combat", "regular"]) {
      await app.options.actions[mode === "regular" ? "normal" : "combatmode"]();
      const root = app.element;
      assert.equal(
        root.querySelectorAll(
          ".ws-player-initiative-slot .ws-header-initiative"
        ).length,
        mode === "combat" ? 1 : 0
      );
      for (const type of ["save", "check"]) {
        const target = root.querySelector(
          `.ws-ability-table [data-type="${type}"][data-key="dex"]`
        );
        assert.equal(
          target.querySelector("strong").textContent,
          type === "save" ? "+7" : "+4"
        );
        const event = { altKey: true, shiftKey: true };
        await app.options.actions.ability(event, target);
        time += ACTION_COOLDOWN_MS;
        assert.equal(rolls.at(-1)[0], type);
        assert.equal(rolls.at(-1)[1].event, event);
      }
      const speed = () =>
        app.element.querySelector('[data-action="togglespeeds"]');
      assert.ok(speed());
      assert.equal(speed().getAttribute("aria-expanded"), "false");
      await app.options.actions.togglespeeds();
      assert.equal(speed().getAttribute("aria-expanded"), "true");
      assert.match(
        app.element.querySelector(".ws-player-secondary-speed").textContent,
        /60/
      );
      app.refreshFromSettings();
      assert.equal(speed().getAttribute("aria-expanded"), "true");
      await app.options.actions.togglespeeds();
      assert.equal(speed().getAttribute("aria-expanded"), "false");
      assert.ok(app.element.querySelector(".ws-favorites-empty"));
      if (mode === "regular")
        await app.options.actions.view(null, {
          dataset: { view: "inventory" }
        });
      else
        await app.options.actions.combatfilter(null, {
          dataset: { category: "inventory" }
        });
      assert.ok(app.element.querySelector('[data-action="inventoryfilter"]'));
      assert.ok(app.element.querySelector(".ws-inventory-weight"));
      assert.equal(
        app.element.querySelector(".ws-coin-gp span").textContent,
        "37"
      );
      assert.equal(
        app.element.querySelector(".ws-coin-sp span").textContent,
        "8"
      );
      assert.ok(app.element.querySelector('[data-item-id="staff"]'));
      assert.ok(
        app.element.querySelector(
          '[data-action="togglefavorite"][data-item-id="staff"]'
        )
      );
      await app.options.actions.togglefavorites();
      assert.equal(app.element.querySelector(".ws-favorites-empty"), null);
      await waitFor(
        () =>
          f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]
            ?.favoritesExpanded === false
      );
      await app.options.actions.togglefavorites();
      await waitFor(
        () =>
          f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]
            ?.favoritesExpanded === true
      );
    }
  } finally {
    await app.close();
  }
});

test("global search is wired to input events and never filters the open inventory", async () => {
  const f = await hudFixture();
  for (const [id, name] of [
    ["sword", "Sword"],
    ["bow", "Bow"]
  ]) {
    f.actor.items.set(id, {
      id,
      name,
      type: "weapon",
      img: "icons/svg/sword.svg",
      system: { equipped: true, quantity: 1 }
    });
  }
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.options.actions.view(null, { dataset: { view: "inventory" } });
  await waitFor(
    () =>
      f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
      "inventory"
  );
  assert.equal(app.element.querySelectorAll(".ws-combat-item").length, 2);
  const input = app.element.querySelector('[data-action="searchitems"]');
  input.value = "Sword";
  input.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true })
  );
  assert.equal(
    app.element.querySelectorAll("#ws-inventory .ws-combat-item").length,
    2
  );
  assert.equal(
    app.element.querySelectorAll(".ws-search-results .ws-combat-item").length,
    1
  );
  assert.equal(
    app.element.querySelector(".ws-search-results .ws-combat-item").dataset
      .itemId,
    "sword"
  );
  await app.options.actions.clearsearch();
  assert.equal(
    app.element.querySelector('[data-action="searchitems"]').value,
    ""
  );
  assert.equal(app.element.querySelectorAll(".ws-combat-item").length, 2);
  await app.close();
});

test("rendered player, companion and GM controls all have application action routes", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const routes = new Set(Object.keys(app.options.actions));
  for (const control of app.options.window.controls) {
    assert.ok(routes.has(control.action), `header: ${control.action}`);
  }
  await app.close();
  for (const language of ["en", "ru"]) {
    const { bodies } = await layoutFixture(language);
    for (const [scenario, html] of Object.entries(bodies)) {
      const root = document.createElement("section");
      root.innerHTML = html;
      for (const button of root.querySelectorAll("[data-action]")) {
        if (button.dataset.action === "searchitems") {
          assert.equal(button.tagName, "INPUT");
          assert.equal(button.type, "search");
          continue;
        }
        assert.ok(
          routes.has(button.dataset.action),
          `${language} ${scenario}: ${button.dataset.action}`
        );
      }
    }
  }
});

test("exploration navigation opens its actual view and returns to main with rest controls", async t => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  t.after(() => app.rendered && app.close());
  const views = [
    ...app.element.querySelectorAll('[data-exploration-section="true"]')
  ].map(button => button.dataset.view);
  assert.ok(views.includes("skills"));
  assert.equal(views.includes("tools"), false);
  assert.ok(views.includes("inventory"));
  for (const view of views) {
    await app.options.actions.view(null, { dataset: { view } });
    await waitFor(
      () =>
        f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
        view
    );
    const selected = app.element.querySelector(`#ws-${view}`);
    assert.ok(selected);
    assert.equal(
      app.element.querySelector(".ws-view:not(.ws-hidden)").id,
      "ws-exploration"
    );
    assert.equal(
      selected.closest(".ws-view").classList.contains("ws-hidden"),
      false
    );
    const back = app.element.querySelector(
      '[data-action="view"][data-view="main"]'
    );
    assert.ok(back);
    await app.options.actions.view(null, back);
    await waitFor(
      () =>
        f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
        "main"
    );
    assert.ok(app.element.querySelector('#ws-main [data-action="shortrest"]'));
    assert.ok(app.element.querySelector('#ws-main [data-action="longrest"]'));
  }
  await app.close();
});

test("wide exploration sections expand inline and collapse without losing character controls", async t => {
  const f = await hudFixture({ values: { twoColumnWidth: 480 } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  t.after(() => app.rendered && app.close());
  app.setPosition({ width: 900 });
  try {
    const skills = app.element.querySelector(
      '[data-exploration-section][data-view="skills"]'
    );
    assert.equal(skills.getAttribute("aria-expanded"), "true");
    await app.options.actions.view(null, skills);
    for (const view of ["skills", "inventory"]) {
      const header = () =>
        app.element.querySelector(
          '[data-exploration-section="true"][data-view="' + view + '"]'
        );
      await app.options.actions.view(null, header());
      assert.equal(header().getAttribute("aria-expanded"), "true");
      const panel = app.element.querySelector(
        "#ws-exploration-content-" + view
      );
      assert.equal(panel.hidden, false);
      assert.ok(panel.querySelector("#ws-" + view));
      assert.equal(
        app.element.querySelectorAll(".ws-exploration-section.ws-expanded")
          .length,
        1
      );
      assert.ok(
        app.element.querySelector('.ws-player-info [data-action="shortrest"]')
      );
      await app.options.actions.view(null, header());
      assert.equal(header().getAttribute("aria-expanded"), "false");
      assert.equal(
        app.element.querySelector("#ws-exploration-content-" + view).hidden,
        true
      );
      assert.equal(
        app.element.querySelectorAll(".ws-exploration-section.ws-expanded")
          .length,
        0
      );
      assert.equal(
        app.element
          .querySelector('[data-view="skills"][data-exploration-section]')
          .getAttribute("aria-expanded"),
        "false"
      );
      app.refreshFromSettings();
      assert.equal(header().getAttribute("aria-expanded"), "false");
    }
    await waitFor(
      () =>
        f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
        "main"
    );
  } finally {
    await app.close();
  }
});
test("trained tools follow skills in both filters and HUD modes", async () => {
  const f = await hudFixture({
    combat: true,
    values: { showModeNavigation: true }
  });
  CONFIG.DND5E.skills = { acr: { label: "Acrobatics" } };
  f.actor.system.skills = { acr: { prof: 0, total: 2 } };
  f.actor.system.tools = {
    trained: { prof: 1 },
    expert: { prof: 2 },
    half: { prof: 0.5 }
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    for (const mode of ["regular", "combat"]) {
      await app.options.actions[mode === "regular" ? "normal" : "combatmode"]();
      if (mode === "regular")
        await app.options.actions.view(null, { dataset: { view: "skills" } });
      else
        await app.options.actions.combatfilter(null, {
          dataset: { category: "skills" }
        });
      for (const proficient of ["true", "false"]) {
        await app.options.actions.skillfilter(null, {
          dataset: { proficient }
        });
        const tools = [...app.element.querySelectorAll('[data-action="tool"]')];
        assert.deepEqual(
          tools.map(tool => tool.dataset.key),
          ["expert", "trained"]
        );
        const block = app.element.querySelector(".ws-tools-content");
        assert.ok(
          block.previousElementSibling.classList.contains(
            mode === "combat" ? "ws-combat-item-grid" : "ws-entry-grid"
          )
        );
        assert.equal(
          app.element.querySelector(
            '[data-exploration-section][data-view="tools"]'
          ),
          null
        );
      }
    }
  } finally {
    await app.close();
  }
});
