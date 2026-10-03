import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { SETTINGS } from "../scripts/settings.js";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { layoutFixture } from "../test-ui/layout-fixture.mjs";

restoreGlobalsAfterEach();

test("inventory search is wired to input events and clear search restores the cards", async () => {
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
  assert.equal(app.element.querySelectorAll(".ws-combat-item").length, 1);
  assert.equal(
    app.element.querySelector(".ws-combat-item").dataset.itemId,
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

test("exploration navigation opens its actual view and returns to main with rest controls", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const views = [
    ...app.element.querySelectorAll('.ws-nav[data-action="view"]')
  ].map(button => button.dataset.view);
  assert.ok(views.includes("skills"));
  assert.ok(views.includes("tools"));
  assert.ok(views.includes("inventory"));
  for (const view of views) {
    await app.options.actions.view(null, { dataset: { view } });
    await waitFor(
      () =>
        f.current.get(SETTINGS.panelStates)?.[f.actor.uuid]?.currentView ===
        view
    );
    assert.ok(app.element.querySelector(`#ws-${view}`));
    assert.equal(
      app.element.querySelector(".ws-view:not(.ws-hidden)").id,
      `ws-${view}`
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
