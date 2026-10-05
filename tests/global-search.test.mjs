import test from "node:test";
import assert from "node:assert/strict";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { bindHudAxisResize } from "../scripts/hud/window/axis-resize.js";
import { fragment } from "./helpers/rendering.mjs";

restoreGlobalsAfterEach();

for (const combat of [false, true]) {
  test(`global search finds native items, activities and rolls across the character in ${combat ? "combat" : "exploration"}`, async () => {
    const f = await hudFixture({
      combat,
      values: { showSearch: true, fontSize: "large" }
    });
    CONFIG.DND5E.skills = { arc: { label: "Arcana" } };
    CONFIG.DND5E.abilities = { str: { label: "Strength" } };
    f.actor.system.skills.arc = { total: 5, prof: 0 };
    f.actor.system.abilities.str = { check: { total: 2 }, save: { total: 4 } };
    f.actor.system.tools = { alchemist: { prof: 1, ability: "int" } };
    const activity = {
      id: "burst",
      name: "Burst",
      canUse: true,
      use: event => f.nativeCalls.push(["burst", event])
    };
    for (const [id, name, type, system] of [
      ["rope", "Rope", "equipment", {}],
      ["spell", "Unprepared Spell", "spell", { level: 2, prepared: 0 }],
      ["passive", "Passive Feature", "feat", {}],
      [
        "wand",
        "Wand",
        "equipment",
        { activities: new Map([[activity.id, activity]]) }
      ],
      ["tool", "Alchemist Kit", "tool", { type: { baseItem: "alchemist" } }]
    ])
      f.actor.items.set(id, {
        id,
        name,
        type,
        system,
        img: "icons/svg/item-bag.svg"
      });
    for (const method of [
      "rollSkill",
      "rollToolCheck",
      "rollSavingThrow",
      "rollAbilityCheck"
    ])
      f.actor[method] = options => f.nativeCalls.push([method, options]);
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    let input = app.element.querySelector('[data-action="searchitems"]');
    const search = query => {
      input.value = query;
      input.dispatchEvent(
        new document.defaultView.Event("input", { bubbles: true })
      );
      assert.equal(
        app.element.querySelector('[data-action="searchitems"]'),
        input,
        "typing preserves the input node"
      );
      return app.element.querySelector(".ws-search-results");
    };
    for (const [query, id] of [
      ["rope", "rope"],
      ["unprepared", "spell"],
      ["passive", "passive"]
    ]) {
      assert.equal(
        search(query).querySelector(".ws-combat-item").dataset.itemId,
        id
      );
    }
    const result = search("burst").querySelector('[data-action="useactivity"]');
    assert.equal(result.dataset.activityId, "burst");
    assert.equal(result.dataset.itemId, "wand");
    for (const [query, action, key] of [
      ["arcana", "skill", "arc"],
      ["alchemist", "tool", "alchemist"],
      ["strength", "ability", "str"]
    ]) {
      const result = search(query).querySelector(`[data-action="${action}"]`);
      assert.ok(result, `${query}: ${search(query).innerHTML}`);
      assert.equal(result.dataset.key, key);
    }
    const button = search("strength").querySelector(
      '[data-action="ability"][data-type="save"]'
    );
    const event = { shiftKey: true, altKey: true, ctrlKey: false };
    await app.hudActions.ability(event, button);
    assert.ok(
      f.nativeCalls.some(
        call => call[0] === "rollSavingThrow" && call[1].event === event
      )
    );
    input = app.element.querySelector('[data-action="searchitems"]');
    assert.ok(search("not anywhere").querySelector(".ws-empty"));
    await app.hudActions.clearsearch();
    assert.equal(input.value, "");
    assert.equal(app.element.querySelector(".ws-search-results"), null);
    await app.close();
  });
}

test("moved search remains above identity while typing, clearing and refreshing; hiding disables it in both modes", async () => {
  const f = await hudFixture({ values: { showSearch: true } });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglehudedit();
  await app.hudActions.hudblockmove.call(app, null, {
    dataset: { hudKey: "search", hudDestination: "identity" }
  });
  await app.hudActions.togglehudedit();
  const panel = app.element.querySelector('[data-hud-block="search"]');
  const input = panel.querySelector("input");
  for (const value of ["s", "sp", "spe"]) {
    input.value = value;
    input.dispatchEvent(
      new document.defaultView.Event("input", { bubbles: true })
    );
    assert.equal(app.element.querySelector('[data-hud-block="search"]'), panel);
    assert.equal(panel.nextElementSibling.dataset.hudBlock, "identity");
  }
  await app.hudActions.clearsearch();
  assert.equal(panel.parentElement.dataset.hudLane, "info");
  await app.hudActions.togglehudedit();
  await app.hudActions.hudblockhide.call(app, null, {
    dataset: { hudKey: "search" }
  });
  assert.equal(app.element.querySelector('[data-action="searchitems"]'), null);
  await app.hudActions.combatmode();
  assert.equal(app.element.querySelector('[data-action="searchitems"]'), null);
  await app.hudActions.hudblockhide.call(
    app,
    null,
    app.element.querySelector('.ws-hud-layout-restore [data-hud-key="search"]')
  );
  assert.equal(
    app.element.querySelector('[data-action="searchitems"]').value,
    ""
  );
  await app.hudActions.togglehudedit();
  await waitFor(() => {
    const saved = f.current.get("panelStates")[f.actor.uuid];
    return (
      saved &&
      Object.values(saved.hudLayouts).every(
        value => !value.hidden.includes("search")
      )
    );
  });
  await app.close();
});

test("joining an unstarted combat switches an open exploration panel immediately; exploration always uses rests instead of initiative", async () => {
  const f = await hudFixture({
    values: { openPlayerOnCombat: false, showModeNavigation: true }
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.equal(app.element.querySelector('[data-action="initiative"]'), null);
  assert.equal(app.element.querySelector(".ws-player-initiative-slot"), null);
  assert.ok(
    app.element.querySelector(
      '.ws-exploration-rests [data-action="shortrest"] span'
    )
  );
  assert.ok(
    app.element.querySelector(
      '.ws-exploration-rests [data-action="longrest"] span'
    )
  );
  await app.hudActions.normal();
  const combatant = { id: "hero-join", actorId: f.actor.id, initiative: null };
  game.combat = {
    id: "joining",
    started: false,
    combatants: [combatant],
    combatant: null
  };
  f.hooks.callAll("createCombatant", combatant);
  f.flushFrames();
  assert.ok(app.element.querySelector("#ws-combat"));
  assert.ok(app.element.querySelector('[data-action="initiative"]'));
  await app.hudActions.featurefilter();
  await app.hudActions.normal();
  assert.ok(app.element.querySelector("#ws-main"));
  assert.equal(app.element.querySelector('[data-action="initiative"]'), null);
  f.hooks.callAll("updateCombat", game.combat, { round: 1 });
  f.flushFrames();
  assert.ok(
    app.element.querySelector("#ws-main"),
    "ordinary updates respect a manual exploration choice"
  );
  await app.hudActions.featurefilter();
  await app.close();
});

test("axis handles resize only their axis, anchor opposite edges, obey pinning and release listeners", () => {
  const root = fragment("<header></header>");
  root.ownerDocument.body.append(root);
  const app = {
    element: root,
    rendered: true,
    position: { left: 20, top: 30, width: 630, height: 460 },
    hudPinState: () => false,
    hudMinimumHeight: () => 350,
    setPosition(value) {
      Object.assign(this.position, value);
    }
  };
  const dispose = bindHudAxisResize(app, key => key);
  const event = (type, data) =>
    Object.assign(
      new root.ownerDocument.defaultView.Event(type, { bubbles: true }),
      data
    );
  const east = root.querySelector(".ws-axis-east"),
    north = root.querySelector(".ws-axis-north");
  east.dispatchEvent(
    event("pointerdown", { button: 0, clientX: 650, clientY: 70, pointerId: 1 })
  );
  root.ownerDocument.dispatchEvent(
    event("pointermove", { clientX: 680, clientY: 200, pointerId: 1 })
  );
  assert.deepEqual(app.position, {
    left: 20,
    top: 30,
    width: 660,
    height: 460
  });
  root.ownerDocument.dispatchEvent(event("pointerup", {}));
  north.dispatchEvent(event("keydown", { key: "ArrowUp" }));
  assert.deepEqual(app.position, {
    left: 20,
    top: 25,
    width: 660,
    height: 465
  });
  app.hudPinState = () => true;
  north.dispatchEvent(event("keydown", { key: "ArrowDown", shiftKey: true }));
  assert.equal(app.position.height, 465);
  app.hudPinState = () => false;
  dispose();
  assert.equal(root.querySelector(".ws-axis-resize"), null);
  east.dispatchEvent(
    event("pointerdown", { button: 0, clientX: 650, clientY: 70, pointerId: 2 })
  );
  root.ownerDocument.dispatchEvent(
    event("pointermove", { clientX: 700, clientY: 200, pointerId: 2 })
  );
  assert.equal(app.position.width, 660);
});
