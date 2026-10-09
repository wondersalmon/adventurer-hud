import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { flushPanelPreferences } from "../scripts/hud/panel-preferences.js";

restoreGlobalsAfterEach();

for (const combat of [false, true]) {
  test(`${combat ? "combat" : "exploration"} skill filter refreshes once and unrelated user updates preserve the dice tray`, async () => {
    const f = await hudFixture({
      combat,
      values: { showModeNavigation: true, playerFooter: true }
    });
    CONFIG.DND5E.skills = { acr: { label: "Acrobatics" } };
    f.actor.system.skills.acr = { prof: 1, total: 3, ability: "dex" };
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    if (combat)
      await app.hudActions.combatfilter(null, {
        dataset: { category: "skills" }
      });
    app.refreshFromSettings();
    f.flushFrames();
    let refreshes = 0,
      closes = 0;
    const sync = app.syncHudLayout;
    app.syncHudLayout = () => {
      refreshes++;
      sync();
    };
    app.closeDiceTray = () => closes++;
    await app.hudActions.skillfilter(null, {
      dataset: { proficient: "false" }
    });
    assert.equal(refreshes, 1);
    assert.equal(closes, 1);
    assert.equal(
      app.element
        .querySelector('[data-action="skillfilter"][data-proficient="false"]')
        .classList.contains("ws-active"),
      true
    );
    refreshes = closes = 0;
    const header = app.element.querySelector(".ws-actor-header");
    f.hooks.callAll(
      "updateUser",
      { id: "another-user" },
      { "flags.other-module.foo": 1 }
    );
    f.hooks.callAll("updateUser", game.user, { "flags.other-module.foo": 1 });
    f.flushFrames();
    assert.equal(refreshes, 0);
    assert.equal(closes, 0);
    f.hooks.callAll("updateActor", f.actor, {
      "system.details.biography.value": "unchanged HUD"
    });
    f.flushFrames();
    assert.equal(closes, 0);
    assert.equal(app.element.querySelector(".ws-actor-header"), header);
    // Access changes still refresh native disabled controls.
    f.actor.isOwner = false;
    f.hooks.callAll("updateUser", game.user, { role: 1 });
    f.flushFrames();
    assert.equal(
      app.element.querySelector('[data-action="inspiration"]').disabled,
      true
    );
    await flushPanelPreferences();
    await app.close();
  });
}

test("combat categories preserve character and moved search nodes after saving block order", async () => {
  const f = await hudFixture({
    combat: true,
    values: { showModeNavigation: true }
  });
  CONFIG.DND5E.skills = { acr: { label: "Acrobatics" } };
  f.actor.system.skills.acr = { prof: 1, total: 3, ability: "dex" };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglehudedit();
  for (const [key, direction] of [
    ["identity", "down"],
    ["search", "right"]
  ]) {
    await app.hudActions.hudblockmove(
      null,
      app.element.querySelector(
        `[data-hud-block="${key}"] [data-hud-direction="${direction}"]`
      )
    );
  }
  await app.hudActions.togglehudedit();
  const header = app.element.querySelector(".ws-actor-header");
  const search = app.element.querySelector(".ws-global-search");
  for (const [category, expanded] of [
    ["skills", true],
    ["inventory", true],
    ["skills", false]
  ]) {
    await app.hudActions.combatfilter(
      null,
      app.element.querySelector(
        `[data-action="combatfilter"][data-category="${category}"]`
      )
    );
    assert.equal(app.element.querySelector(".ws-actor-header"), header);
    assert.equal(app.element.querySelector(".ws-global-search"), search);
    assert.equal(search.parentElement.dataset.hudLane, "actions");
    assert.equal(
      app.element
        .querySelector(
          `[data-action="combatfilter"][data-category="${category}"]`
        )
        .getAttribute("aria-expanded"),
      String(expanded)
    );
  }
  assert.equal(
    app.element
      .querySelector('[data-category="inventory"]')
      .getAttribute("aria-expanded"),
    "true"
  );
  await flushPanelPreferences();
  await app.close();
});
