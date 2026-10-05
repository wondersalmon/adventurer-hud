import assert from "node:assert/strict";
import test from "node:test";
import { createHudState } from "../scripts/hud/state.js";
import { createPanelPreferences } from "../scripts/hud/panel-preferences.js";
import { createViewActions } from "../scripts/hud/view-actions.js";
import {
  itemLayoutKey,
  normalizeItemLayouts,
  renderItemLayout
} from "../scripts/hud/items/item-layout.js";
import { bindItemLayoutInteractions } from "../scripts/hud/items/item-layout-interactions.js";
import {
  fragment,
  escapeHTML,
  itemRendererFixture
} from "./helpers/rendering.mjs";
import { installDom, restoreGlobalsAfterEach } from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();
const entries = ["a", "b", "c"].map(key => ({
  key,
  name: key,
  html: `<button class="ws-combat-item" data-action="useitem">${key}</button>`
}));
const render = (state, scope = "combat:action") =>
  renderItemLayout({
    entries,
    scope,
    hudState: state,
    escapeHTML,
    t: key => key
  });

for (const gm of [false, true]) {
  test(`${gm ? "GM" : "player"} list preferences reorder/hide and restore without changing native items`, async () => {
    const items = ["a", "b", "c"].map(id => ({
      id,
      name: id,
      type: "weapon",
      sort: 7
    }));
    const state = createHudState({ combatCategory: "weapons" });
    const f = itemRendererFixture({
      items,
      hudState: state,
      visibility: { gm, showActionTypes: true },
      adapter: { combatItems: () => items }
    });
    const root = fragment("");
    const refresh = () => {
      root.innerHTML = f.renderer.combatActions();
    };
    refresh();
    const before = JSON.stringify(items);
    const actions = createViewActions({
      actor: { isOwner: true },
      hudState: f.hudState,
      visibility: {},
      currentMode: () => "combat",
      refreshHud: refresh,
      t: key => key
    });
    actions.togglehudedit();
    actions.moveitemdown(
      null,
      root.querySelector('[data-action="moveitemdown"]')
    );
    assert.deepEqual(
      [
        ...root.querySelectorAll(
          ".ws-organized-entry .ws-combat-item-content strong"
        )
      ].map(node => node.textContent),
      ["b", "a", "c"]
    );
    actions.toggleitemhidden(
      null,
      root.querySelector('[data-action="toggleitemhidden"]')
    );
    assert.equal(root.querySelectorAll(".ws-organized-entry").length, 2);
    assert.ok(root.querySelector('[data-action="togglehiddenitems"]'));
    actions.togglehudedit();
    assert.deepEqual(
      [
        ...root.querySelectorAll(
          ".ws-organized-entry .ws-combat-item-content strong"
        )
      ].map(node => node.textContent),
      ["a", "c"]
    );
    assert.equal(root.querySelector('[data-action="togglehiddenitems"]'), null);
    actions.togglehudedit();
    actions.togglehiddenitems(
      null,
      root.querySelector('[data-action="togglehiddenitems"]')
    );
    assert.equal(root.querySelectorAll(".ws-organized-entry").length, 2);
    assert.equal(root.querySelectorAll(".ws-item-layout-restore").length, 1);
    actions.toggleitemhidden(
      null,
      root.querySelector(
        '.ws-item-layout-restore [data-action="toggleitemhidden"]'
      )
    );
    actions.togglehudedit();
    assert.deepEqual(
      [
        ...root.querySelectorAll(
          ".ws-organized-entry .ws-combat-item-content strong"
        )
      ].map(node => node.textContent),
      ["b", "a", "c"]
    );
    assert.equal(JSON.stringify(items), before);
    assert.equal(f.hudState.itemLayouts["combat:bonus"], undefined);
    const unowned = createViewActions({
      actor: { isOwner: false },
      hudState: f.hudState
    });
    unowned.togglehudedit();
    assert.equal(f.hudState.hudEditing, false);
  });
}

test("queued snapshots isolate player Actors and exact GM tokens; transient editing is not saved", async () => {
  let saved = {};
  const options = {
    actorUuid: "Actor.hero",
    readSetting: key => (key === "panelStates" ? saved : false),
    writeSetting: async (_key, value) => {
      saved = value;
    }
  };
  const player = createPanelPreferences({ ...options, gmActive: false });
  const gm = createPanelPreferences({
    ...options,
    gmActive: true,
    tokenUuid: "Scene.map.Token.one"
  });
  const state = createHudState({
    itemLayouts: { "combat:action": { order: ["b", "a"], hidden: ["c"] } },
    hudEditing: true
  });
  const pending = player.save(state);
  state.itemLayouts["combat:action"].order.reverse();
  await Promise.all([pending, gm.save(state)]);
  assert.deepEqual(saved["Actor.hero"].itemLayouts["combat:action"].order, [
    "b",
    "a"
  ]);
  assert.deepEqual(
    saved["gm:Scene.map.Token.one"].itemLayouts["combat:action"].order,
    ["a", "b"]
  );
  assert.equal(saved["Actor.hero"].hudEditing, undefined);
  assert.deepEqual(
    createPanelPreferences({ ...options, gmActive: false }).initialState
      .itemLayouts["combat:action"].hidden,
    ["c"]
  );
  assert.equal(
    createPanelPreferences({
      ...options,
      gmActive: true,
      tokenUuid: "Scene.map.Token.two"
    }).initialState.itemLayouts,
    undefined
  );
});

test("deleted entries are ignored, new entries append, hidden activity identities remain separate", () => {
  const state = createHudState({
    itemLayouts: {
      "combat:action": { order: ["missing", "c", "a"], hidden: ["b"] }
    }
  });
  const root = fragment(render(state));
  assert.deepEqual(
    [...root.querySelectorAll(".ws-organized-entry")].map(
      node => node.dataset.layoutKey
    ),
    ["c", "a"]
  );
  assert.notEqual(
    itemLayoutKey({ id: "item" }),
    itemLayoutKey({ id: "item" }, "activity")
  );
  const clean = normalizeItemLayouts(
    JSON.parse(
      '{"__proto__":{},"combat:action":{"order":["a","a",42],"hidden":["b",null]}}'
    )
  );
  assert.deepEqual(clean, { "combat:action": { order: ["a"], hidden: ["b"] } });
});

test("dragging stays within the current list, blocks use while editing and releases listeners", () => {
  const { document, window } = installDom();
  const state = createHudState({ hudEditing: true });
  const element = document.createElement("div");
  element.innerHTML = render(state) + render(state, "combat:bonus");
  document.body.append(element);
  const calls = [];
  let active = true;
  const unbind = bindItemLayoutInteractions({
    element,
    isActive: () => active,
    move: (_event, target) => calls.push(target.dataset)
  });
  const event = (node, type) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    node.dispatchEvent(e);
    return e;
  };
  const handle = element.querySelector(".ws-item-drag");
  const targets = element.querySelectorAll(".ws-organized-entry");
  assert.equal(
    event(element.querySelector(".ws-combat-item"), "click").defaultPrevented,
    true
  );
  event(handle, "dragstart");
  event(targets[3], "drop");
  assert.deepEqual(calls, []);
  event(targets[1], "drop");
  assert.deepEqual(calls, [{ layoutKey: "a", layoutTarget: "b" }]);
  event(handle, "dragstart");
  active = false;
  event(targets[1], "drop");
  assert.equal(calls.length, 1);
  active = true;
  unbind();
  assert.equal(
    event(element.querySelector(".ws-combat-item"), "click").defaultPrevented,
    false
  );
  event(handle, "dragstart");
  event(targets[1], "drop");
  assert.equal(calls.length, 1);
});
