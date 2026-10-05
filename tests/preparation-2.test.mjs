import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { fixture, combatFor } from "./helpers/companions.mjs";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import {
  itemCollection,
  itemRendererFixture,
  fragment
} from "./helpers/rendering.mjs";
import {
  settingsBackup,
  restoreSettingsBackup
} from "../scripts/settings-backup.js";
import {
  createPanelPreferences,
  replacePanelPreferences,
  flushPanelPreferences
} from "../scripts/hud/panel-preferences.js";
import { createHudState } from "../scripts/hud/state.js";

restoreGlobalsAfterEach();
const backup = settings =>
  JSON.stringify({ module: "adventurer-hud", format: 1, settings });

test("GM fallback selects only visible native categories, including when all tabs are hidden", () => {
  const item = { id: "sword", name: "Sword", type: "weapon" };
  const f = itemRendererFixture({
    items: [item],
    visibility: { gm: true, showActionTypes: true },
    adapter: {
      combatItems: (_actor, category) =>
        ["weapons", "action"].includes(category) ? [item] : []
    },
    hudState: {
      combatCategory: "weapons",
      hudLayouts: { "combat:tabs": { order: [], hidden: ["tab:weapons"] } }
    }
  });
  let root = fragment(f.renderer.combatActions());
  assert.equal(f.hudState.combatCategory, "action");
  assert.equal(
    root
      .querySelector('[data-category="action"]')
      .getAttribute("aria-expanded"),
    "true"
  );
  f.hudState.hudLayouts["combat:tabs"].hidden.push("tab:action");
  root = fragment(f.renderer.combatActions());
  assert.equal(f.hudState.combatCategory, null);
  assert.equal(root.querySelector(".ws-combat-item-list"), null);
});

for (const gm of [false, true]) {
  test(`${gm ? "GM exact token" : "player"} live and closed panels keep restored layouts after later saves`, async () => {
    const f = await fixture({ isGM: gm });
    f.actor.items = itemCollection([
      { id: "rope", name: "Rope", type: "loot", system: {} }
    ]);
    const token = f.token(gm ? f.npc("monster") : f.actor, "hero", true);
    if (gm) {
      const { combat } = combatFor(f, [token]);
      combat.id = "battle";
      combat.scene = canvas.scene;
      combat.turns = combat.combatants;
      game.combats = itemCollection([combat]);
      token.actor.items = f.actor.items;
    }
    const key = gm ? `gm:${token.uuid}` : f.actor.uuid;
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    const block = gm ? "identity" : "hp";
    const restored = {
      hudLayouts: {
        [`${gm ? "combat" : "regular"}:info`]: { order: [], hidden: [block] }
      },
      itemLayouts: {
        "inventory:other": { order: [], hidden: ['["rope",null]'] }
      }
    };
    await restoreSettingsBackup(backup({ panelStates: { [key]: restored } }));
    assert.ok(
      app.element
        .querySelector(`[data-hud-block="${block}"]`)
        .classList.contains("ws-hud-block-hidden")
    );
    await app.hudActions.togglefavorites();
    assert.deepEqual(
      f.current.get("panelStates")[key].hudLayouts,
      restored.hudLayouts
    );
    assert.deepEqual(
      f.current.get("panelStates")[key].itemLayouts,
      restored.itemLayouts
    );
    await app.close();
    await flushPanelPreferences();
    await restoreSettingsBackup(backup({ panelStates: { [key]: restored } }));
    await f.api.open(f.actor);
    assert.ok(
      __adventurerHud.app.element
        .querySelector(`[data-hud-block="${block}"]`)
        .classList.contains("ws-hud-block-hidden")
    );
    await __adventurerHud.app.close();
  });
}

test("replacement drains an in-flight write, rejects waiting old snapshots and reloads both keys", async () => {
  let store = {};
  let release, started;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const waiting = new Promise(resolve => {
    started = resolve;
  });
  const options = {
    readSetting: key => (key === "panelStates" ? store : true),
    writeSetting: async (_key, value) => {
      started();
      await gate;
      store = value;
    }
  };
  const player = createPanelPreferences({
    ...options,
    actorUuid: "Actor.hero"
  });
  const gm = createPanelPreferences({
    ...options,
    gmActive: true,
    tokenUuid: "Scene.s.Token.t"
  });
  const state = createHudState();
  const gmState = createHudState();
  const unsubscribe = player.subscribe(state, () => {});
  const unsubscribeGm = gm.subscribe(gmState, () => {});
  const first = player.save(state);
  await waiting;
  const second = gm.save(gmState);
  const restored = {
    hudLayouts: { "regular:info": { order: [], hidden: ["hp"] } }
  };
  const replacement = replacePanelPreferences(async () => {
    store = { "Actor.hero": restored, "gm:Scene.s.Token.t": restored };
  });
  await player.save(state);
  release();
  await Promise.all([first, second, replacement]);
  assert.deepEqual(state.hudLayouts, restored.hudLayouts);
  assert.deepEqual(gmState.hudLayouts, restored.hudLayouts);
  await gm.save(gmState);
  assert.deepEqual(store["gm:Scene.s.Token.t"].hudLayouts, restored.hudLayouts);
  unsubscribe();
  unsubscribeGm();
});

test("own legacy backup round-trips without mutating export storage; invalid shapes write nothing", async () => {
  const saved = {
    companionTab: "companions",
    combatCategory: "resources",
    resourcesExpanded: true,
    favoriteOrder: ["old"],
    searchQuery: "old",
    forcedMode: "combat",
    openActivityItemId: null,
    customSafeField: { value: "keep" }
  };
  const f = installSettings({ values: { panelStates: { hero: saved } } });
  const exported = await settingsBackup();
  assert.deepEqual(f.current.get("panelStates"), { hero: saved });
  await restoreSettingsBackup(JSON.stringify(exported));
  assert.deepEqual(f.current.get("panelStates").hero, {
    companionsExpanded: true,
    combatCategory: "features",
    customSafeField: { value: "keep" }
  });
  for (const panelStates of [
    [],
    { hero: null },
    { hero: { companionTab: "broken" } },
    { hero: { favoritesExpanded: "yes" } },
    { hero: { hudLayouts: { bad: { hidden: 3 } } } }
  ])
    await assert.rejects(restoreSettingsBackup(backup({ panelStates })));
});

test("failed restore rolls back storage and leaves live editor layout usable", async t => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const before = await settingsBackup();
  const set = game.settings.set;
  t.mock.method(game.settings, "set", async (module, key, value) => {
    if (key === "showSearch" && value === false)
      throw new Error("storage unavailable");
    return set(module, key, value);
  });
  await assert.rejects(
    restoreSettingsBackup(
      backup({
        panelStates: {
          [f.actor.uuid]: {
            hudLayouts: { "regular:info": { order: [], hidden: ["hp"] } }
          }
        },
        showSearch: false
      })
    )
  );
  assert.deepEqual(f.current.get("panelStates"), before.settings.panelStates);
  await app.hudActions.togglefavorites();
  assert.equal(
    app.element
      .querySelector('[data-hud-block="hp"]')
      .classList.contains("ws-hud-block-hidden"),
    false
  );
  await app.close();
  await flushPanelPreferences();
});

test("full reset clears editor data; geometry-only reset preserves it and native favorites", async () => {
  const f = await hudFixture({
    values: {
      panelStates: {
        "Actor.hero": {
          hudLayouts: { "regular:info": { order: [], hidden: ["hp"] } },
          itemLayouts: {
            "inventory:other": { order: [], hidden: ['["rope",null]'] }
          }
        }
      }
    }
  });
  await f.api.open(f.actor);
  const favorites = structuredClone(f.actor.system.favorites);
  const App = f.menus.get("troubleshooting").type;
  const app = new App();
  app.t = key => key;
  foundry.applications.api.DialogV2.confirm = async () => true;
  await App.DEFAULT_OPTIONS.actions.resetplayerwindow.call(app);
  assert.ok(f.current.get("panelStates")[f.actor.uuid].hudLayouts);
  await App.DEFAULT_OPTIONS.actions.resetall.call(app);
  assert.deepEqual(f.current.get("panelStates"), {});
  assert.deepEqual(f.actor.system.favorites, favorites);
  await __adventurerHud.app.hudActions.togglefavorites();
  assert.equal(
    f.current.get("panelStates")[f.actor.uuid].hudLayouts,
    undefined
  );
  assert.equal(
    f.current.get("panelStates")[f.actor.uuid].itemLayouts,
    undefined
  );
  await __adventurerHud.app.close();
});

for (const combat of [false, true]) {
  test(`inventory editor applies shared order/hiding in ${combat ? "combat" : "exploration"}; hiding selected tab closes it`, async () => {
    const f = await hudFixture({ combat });
    f.actor.items = itemCollection(
      ["rope", "torch"].map(id => ({ id, name: id, type: "loot", system: {} }))
    );
    await f.api.open(f.actor);
    const app = __adventurerHud.app;
    if (combat)
      await app.hudActions.combatfilter(null, {
        dataset: { category: "inventory" }
      });
    else await app.hudActions.view(null, { dataset: { view: "inventory" } });
    await app.hudActions.inventoryfilter(null, {
      dataset: { category: "other" }
    });
    await app.hudActions.togglehudedit();
    const first = app.element.querySelector('[data-action="moveitemdown"]');
    assert.ok(first);
    await app.hudActions.moveitemdown(null, first);
    assert.equal(
      app.element.querySelector(".ws-organized-entry strong").textContent,
      "torch"
    );
    await app.hudActions.toggleitemhidden(
      null,
      app.element.querySelector('[data-action="toggleitemhidden"]')
    );
    assert.equal(app.element.querySelectorAll(".ws-organized-entry").length, 1);
    await app.hudActions.hudblockhide.call(app, null, {
      dataset: { hudKey: "tab:inventory" }
    });
    await app.hudActions.togglehudedit();
    assert.equal(
      app.element.querySelector('[data-layout-scope="inventory:other"]'),
      null
    );
    assert.equal(
      app.element
        .querySelector('[data-category="inventory"]')
        ?.getAttribute("aria-expanded") ?? "false",
      "false"
    );
    await app.close();
    await flushPanelPreferences();
  });
}

test("manual exploration during combat hides initiative and uses stable roster order; combat restores native ordering", async () => {
  const f = await fixture({ values: { showModeNavigation: true } });
  const first = f.token(f.npc("a"), "a");
  const second = f.token(f.npc("b"), "b");
  const hero = f.token(f.actor, "hero", true);
  const { combat, entries } = combatFor(f, [hero, first, second]);
  entries[1].initiative = 1;
  entries[2].initiative = 20;
  combat.combatant = entries[2];
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  assert.equal(
    app.element.querySelector(".ws-companion-open").dataset.companionUuid,
    "Actor.b"
  );
  await app.hudActions.normal();
  assert.equal(
    app.element.querySelector(".ws-companion-open").dataset.companionUuid,
    "Actor.a"
  );
  assert.equal(
    app.element.querySelector(
      ".ws-companion-initiative, .ws-companion-roll-all, .ws-companion-turn, .ws-companion-unrolled"
    ),
    null
  );
  await app.hudActions.companionsinitiative();
  assert.equal(f.calls.filter(call => call[0] === "initiative").length, 0);
  await app.hudActions.combatmode();
  assert.ok(app.element.querySelector(".ws-companion-initiative"));
  await waitFor(
    () =>
      app.element.querySelector(".ws-companion-open").dataset.companionUuid ===
      "Actor.b"
  );
  await app.close();
  await flushPanelPreferences();
});
