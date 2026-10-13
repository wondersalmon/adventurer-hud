import assert from "node:assert/strict";
import test from "node:test";
import { customNpcFixture } from "./helpers/custom-npcs.mjs";
import {
  fragment,
  itemCollection,
  itemRendererFixture
} from "./helpers/rendering.mjs";
import {
  restoreGlobalsAfterEach,
  installSettings
} from "./helpers/foundry.mjs";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { createHudActions } from "../scripts/hud/actions.js";
import { SETTINGS, settingRefreshStrategy } from "../scripts/settings.js";

restoreGlobalsAfterEach();

test("GM action categories retain spells alongside weapons when spell tabs are visible", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const spell = {
    id: "fire",
    type: "spell",
    name: "Fire Bolt",
    system: {
      activities: new Map([
        ["cast", { id: "cast", activation: { type: "action" }, use() {} }]
      ])
    }
  };
  const weapon = {
    id: "dagger",
    type: "weapon",
    name: "Dagger",
    system: {
      activities: new Map([
        ["stab", { id: "stab", activation: { type: "action" }, use() {} }]
      ])
    }
  };
  const f = itemRendererFixture({
    items: [spell, weapon],
    adapter: dnd5eAdapter,
    visibility: { gm: true, showActionTypes: true, actionTypesOnly: false },
    hudState: { combatCategory: "action" }
  });
  const root = fragment(f.renderer.combatActions());
  assert.equal(
    root.querySelector('[data-category="action"] small').textContent,
    "2"
  );
  const cards = root.querySelectorAll(
    ".ws-combat-item-list [data-description-item-id]"
  );
  assert.deepEqual(
    [...cards].map(card => card.dataset.descriptionItemId),
    ["fire", "dagger"]
  );
  assert.ok(root.querySelector('[data-category="spells"]'));
});

test("Features use native advancement origins and retain hidden cards and personal order", () => {
  installSettings();
  game.i18n.localize = key =>
    ({
      "ADVENTURER_HUD.Features.Class": "Class",
      "ADVENTURER_HUD.Features.Species": "Species feature"
    })[key] ?? key;
  globalThis.CONFIG = {
    DND5E: {
      featureTypes: {
        race: { label: "Species" },
        class: { label: "Class" },
        background: { label: "Background" },
        feat: { label: "Feats" }
      }
    }
  };
  const origins = itemCollection([
    { id: "monk", type: "class", name: "Monk <class>" },
    { id: "race", type: "race", name: "Elf" }
  ]);
  const items = [
    ["a", "Armor", "monk"],
    ["b", "Burst", "race"],
    ["c", "Counter", "monk"],
    ["d", "Darkvision", "race"]
  ].map(([id, name, source]) => ({
    id,
    name,
    type: "feat",
    parent: { items: origins },
    flags: { dnd5e: { advancementRoot: `${source}.advancement` } },
    system: {
      type: { value: "feat" },
      activities: [{ activation: { type: "action" } }]
    }
  }));
  const f = itemRendererFixture({
    items,
    t: key => game.i18n.localize(`ADVENTURER_HUD.${key}`),
    adapter: dnd5eAdapter,
    hudState: {
      combatCategory: "features",
      itemLayouts: {
        "combat:features:active": {
          order: ['["c",null]', '["a",null]'],
          hidden: ['["d",null]']
        }
      }
    }
  });
  const root = fragment(f.renderer.combatActions());
  assert.deepEqual(
    [...root.querySelectorAll(".ws-feature-source")].map(
      node => node.textContent
    ),
    ["Class: Monk <class> 2", "Species feature: Elf 1"]
  );
  assert.equal(root.querySelector(".ws-feature-source class"), null);
  assert.deepEqual(
    [...root.querySelectorAll(".ws-organized-entry")].map(
      node => JSON.parse(node.dataset.layoutKey)[0]
    ),
    ["c", "a", "b"]
  );
  f.hudState.hudEditing = true;
  const edited = fragment(f.renderer.combatActions());
  assert.equal(edited.querySelector(".ws-feature-source"), null);
  assert.equal(
    edited.querySelectorAll('[data-action="moveitemdown"]').length,
    3
  );
  assert.equal(
    dnd5eAdapter.featureSource({
      flags: { dnd5e: { advancementOrigin: "race.a" } },
      parent: { items: origins },
      system: {}
    }).label,
    "Species feature: Elf"
  );
  assert.equal(
    dnd5eAdapter.featureSource({ system: { type: { value: "background" } } })
      .label,
    "Background"
  );
  assert.equal(
    dnd5eAdapter.featureSource({
      parent: { items: origins },
      system: { type: { value: "race" } }
    }).label,
    "Species feature: Elf"
  );
  assert.equal(
    dnd5eAdapter.featureSource({ system: { type: { value: "race" } } }).label,
    "Species"
  );
  game.i18n.localize = key =>
    ({
      "ADVENTURER_HUD.Features.Class": "Класс",
      "ADVENTURER_HUD.Features.Species": "Особенности вида"
    })[key] ?? key;
  assert.equal(
    dnd5eAdapter.featureSource(items[0]).label,
    "Класс: Monk <class>"
  );
  assert.equal(
    dnd5eAdapter.featureSource(items[1]).label,
    "Особенности вида: Elf"
  );
  assert.equal(dnd5eAdapter.featureSource({ system: {} }).id, "other");
});

for (const [name, type, count, passiveNames] of [
  ["Humongous Fungus Troll", "epic", 5, ["False Appearance", "Epic Boss"]],
  [
    "Llyvessa",
    "villain",
    1,
    ["Deadly Sharpshooter", "Mind Link", "Villain Party Actions"]
  ]
]) {
  test(`${name}: custom actions appear in GM type mode and invoke the exact native activity`, async () => {
    const f = customNpcFixture(name, {
      hudState: { combatCategory: `activation:${type}` }
    });
    const root = fragment(f.renderer.combatActions());
    assert.ok(root.querySelector(`[data-category="activation:${type}"]`));
    assert.ok(root.querySelector('[data-category="features"]'));
    const controls = [...root.querySelectorAll('[data-action="useactivity"]')];
    assert.equal(controls.length, count);
    const event = { altKey: true, shiftKey: true };
    const actions = createHudActions({
      actor: f.actor,
      adapter: dnd5eAdapter,
      canRollActor: true,
      performRoll: callback => callback(),
      t: key => key
    });
    for (const control of controls) {
      const item = f.actor.items.get(control.dataset.itemId);
      const activity = item.system.activities.find(
        activity => activity.id === control.dataset.activityId
      );
      assert.equal(activity.activation.type, type);
      await actions.useactivity(event, control);
    }
    assert.equal(f.calls.length, count);
    assert.ok(
      f.calls.every(call => call[0] === "use" && call[3].event === event)
    );
  });
  test(`${name}: Features hides passives by default and switches to passive-only and back without rolling passive traits`, async () => {
    const f = customNpcFixture(name, {
      hudState: { combatCategory: "features" }
    });
    const active = fragment(f.renderer.combatActions());
    assert.equal(
      active.querySelectorAll("[data-description-item-id]").length,
      f.actor.items.filter(
        item =>
          item.type === "feat" &&
          item.system.activities.some(activity => activity.activation?.type)
      ).length
    );
    const filterActions = createHudActions({
      actor: f.actor,
      hudState: f.hudState,
      refreshHud() {},
      t: key => key
    });
    await filterActions.featurefilter();
    const root = fragment(f.renderer.combatActions());
    const cards = [...root.querySelectorAll("[data-description-item-id]")];
    assert.equal(
      cards.length,
      f.actor.items.filter(
        item =>
          item.type === "feat" &&
          !item.system.activities.some(activity => activity.activation?.type)
      ).length
    );
    await filterActions.featurefilter();
    assert.equal(
      fragment(f.renderer.combatActions()).querySelectorAll(
        "[data-description-item-id]"
      ).length,
      active.querySelectorAll("[data-description-item-id]").length
    );
    const actions = createHudActions({
      actor: f.actor,
      adapter: dnd5eAdapter,
      canRollActor: true,
      t: key => key
    });
    for (const name of passiveNames) {
      const item = f.actor.items.find(item => item.name === name);
      const control = root.querySelector(`[data-item-id="${item.id}"]`);
      assert.equal(control.dataset.action, "openitem");
      assert.equal(control.hasAttribute("disabled"), false);
      await actions.openitem({}, control);
    }
    assert.deepEqual(
      f.calls.map(call => call[0]),
      passiveNames.map(() => "sheet")
    );
  });
}

test("Epic action selection omits Mycelia's recharge utility and refresh removes deleted categories", () => {
  const f = customNpcFixture("Humongous Fungus Troll", {
    hudState: { combatCategory: "activation:epic" }
  });
  const item = f.actor.items.find(item => item.name === "Entangling Mycelia");
  const root = fragment(f.renderer.combatActions());
  assert.equal(
    root.querySelector('[data-activity-id="6hdHHTtW5dvGUBCO"]'),
    null
  );
  assert.ok(root.querySelector('[data-activity-id="W1kgk0R4znzJFJf0"]'));
  assert.equal(item.system.activities.length, 2);
  for (const item of f.actor.items.values()) item.system.activities = [];
  const refreshed = fragment(f.renderer.combatActions());
  assert.equal(
    refreshed.querySelector('[data-category="activation:epic"]'),
    null
  );
  assert.equal(f.hudState.combatCategory, "features");
});

test("an Epic boss opens its Epic Actions first instead of an empty or passive category", () => {
  const f = customNpcFixture("Humongous Fungus Troll");
  const root = fragment(f.renderer.combatActions());
  assert.equal(f.hudState.combatCategory, "activation:epic");
  assert.equal(root.querySelectorAll('[data-action="useactivity"]').length, 5);
});

test("unknown category IDs and registered labels are escaped and cannot collide with item tabs", () => {
  const type = "weapons";
  const item = {
    id: "feature",
    type: "feat",
    name: "Custom",
    system: { activities: [{ id: "custom", activation: { type }, use() {} }] }
  };
  const actor = { isOwner: true, items: itemCollection([item]) };
  const label = '<img src=x onerror="alert(1)">';
  globalThis.CONFIG = {
    DND5E: { activityActivationTypes: { weapons: { header: label } } }
  };
  globalThis.game = { i18n: { localize: value => value } };
  const f = itemRendererFixture({
    items: [item],
    actor,
    adapter: dnd5eAdapter,
    visibility: { gm: true, showActionTypes: true }
  });
  const root = fragment(f.renderer.combatActions());
  const tab = root.querySelector('[data-category="activation:weapons"]');
  assert.ok(tab);
  assert.equal(root.querySelector('[data-category="weapons"]'), null);
  assert.equal(tab.querySelector("img"), null);
  assert.ok(tab.textContent.includes(label));
  assert.equal(dnd5eAdapter.activationTypeLabel("not-registered"), "");
  item.system.activities[0].activation.type = 'odd"<type>';
  assert.equal(dnd5eAdapter.combatActionTypes(actor)[0], 'odd"<type>');
  const unknown = fragment(f.renderer.combatActions()).querySelector(
    '[data-action="combatfilter"]'
  );
  assert.equal(unknown.dataset.category, 'activation:odd"<type>');
  item.system.activities[0].activation.type = "__proto__";
  const prototypeName = fragment(f.renderer.combatActions()).querySelector(
    '[data-category="activation:__proto__"]'
  );
  assert.ok(prototypeName.textContent.includes("__proto__"));
});

test("player action categories group custom types into Special and the existing setting still hides them", () => {
  const f = customNpcFixture("Humongous Fungus Troll", {
    visibility: { gm: false },
    hudState: { actionMenuOpen: true, combatCategory: "activation:epic" }
  });
  assert.ok(
    fragment(f.renderer.combatActions()).querySelector(
      '.ws-combat-filters [data-category="special"]'
    )
  );
  assert.equal(f.hudState.combatCategory, "special");
  assert.equal(
    fragment(f.renderer.combatActions()).querySelectorAll(
      '[data-category^="activation:"]'
    ).length,
    0
  );
  f.visibility.showActionTypes = false;
  const root = fragment(f.renderer.combatActions());
  assert.equal(root.querySelector('[data-category="activation:epic"]'), null);
  assert.ok(root.querySelector('[data-category="features"]'));
});

test("description enrichment keeps relative links and respects document secrets permission", async () => {
  const calls = [];
  globalThis.foundry = {
    applications: {
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (...args) => {
              calls.push(args);
              return "<p>Enriched</p>";
            }
          }
        }
      }
    }
  };
  const item = {
    system: { description: { value: "@UUID[Actor.test]" } },
    isOwner: false,
    actor: { isOwner: true }
  };
  assert.equal(await dnd5eAdapter.itemDescription(item), "<p>Enriched</p>");
  assert.deepEqual(calls[0], [
    "@UUID[Actor.test]",
    { relativeTo: item, secrets: false }
  ]);
  item.isOwner = true;
  await dnd5eAdapter.itemDescription(item);
  assert.equal(calls[1][1].secrets, true);
});

test("hover descriptions are a configurable default and do not reopen the session", async () => {
  const f = installSettings();
  assert.equal(f.current.get(SETTINGS.showItemDescriptions), true);
  assert.equal(
    settingRefreshStrategy(SETTINGS.showItemDescriptions),
    "runtime"
  );
  const app = new (f.menus.get("configure").type)();
  const context = await app._prepareContext();
  assert.ok(
    context.groups
      .flatMap(group => group.settings)
      .some(setting => setting.key === SETTINGS.showItemDescriptions)
  );
});

test("player Special combines time, custom and no-cost activities without pulling normal activities from a mixed item", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const types = [
    "action",
    "bonus",
    "reaction",
    "minute",
    "hour",
    "minutes",
    "hours",
    "epic",
    "special",
    "",
    "custom"
  ];
  const items = types.map((type, index) => ({
    id: "item" + index,
    name: type || "No cost",
    type: "feat",
    system: {
      activities: [
        {
          id: "activity" + index,
          name: type || "No cost",
          activation: { type },
          canUse: true,
          use() {}
        }
      ]
    }
  }));
  items[0].system.activities.push({
    id: "mixed-hour",
    name: "Slow mode",
    activation: { type: "hour" },
    canUse: true,
    use() {}
  });
  const f = itemRendererFixture({
    items,
    actor: { isOwner: true, items: itemCollection(items) },
    adapter: dnd5eAdapter,
    visibility: { showActionTypes: true, gm: false },
    hudState: { actionMenuOpen: true, combatCategory: "special" }
  });
  const root = fragment(f.renderer.combatActions());
  assert.deepEqual(
    [...root.querySelectorAll(".ws-combat-filters [data-category]")].map(
      e => e.dataset.category
    ),
    ["action", "bonus", "reaction", "special", "features", "inventory"]
  );
  const controls = [...root.querySelectorAll('[data-action="useactivity"]')];
  assert.equal(controls.length, types.length - 3 + 1);
  assert.ok(controls.some(e => e.dataset.activityId === "mixed-hour"));
  assert.equal(
    controls.some(e =>
      ["activity0", "activity1", "activity2"].includes(e.dataset.activityId)
    ),
    false
  );
  f.visibility.gm = true;
  const gm = fragment(f.renderer.combatActions());
  assert.ok(gm.querySelector('[data-category="activation:hour"]'));
  assert.ok(gm.querySelector('[data-category="activation:epic"]'));
});

test("a passive-only Features tab remains reachable and its filter is restored after reopening", async () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const { createPanelPreferences } =
    await import("../scripts/hud/panel-preferences.js");
  const { createHudState } = await import("../scripts/hud/state.js");
  const feat = {
    id: "darkvision",
    name: "Darkvision",
    type: "feat",
    system: { activities: [] }
  };
  const make = state =>
    itemRendererFixture({
      items: [feat],
      actor: { isOwner: true, items: itemCollection([feat]) },
      adapter: dnd5eAdapter,
      visibility: { gm: true },
      hudState: state
    });
  const f = make({ combatCategory: "features" });
  const root = fragment(f.renderer.combatActions());
  assert.ok(root.querySelector('[data-category="features"]'));
  assert.ok(root.querySelector('[data-action="featurefilter"]'));
  assert.equal(root.querySelectorAll("[data-description-item-id]").length, 0);
  assert.match(root.textContent, /Combat.EmptyActiveFeatures/);
  let saved = {};
  const options = {
    actorUuid: "Actor.hero",
    readSetting: () => saved,
    writeSetting: async (_, value) => {
      saved = value;
    }
  };
  const preferences = createPanelPreferences(options);
  const actions = createHudActions({
    actor: f.actor,
    hudState: f.hudState,
    refreshHud() {},
    savePanelState: () => preferences.save(createHudState(f.hudState)),
    t: key => key
  });
  await actions.featurefilter();
  const reopened = make(createPanelPreferences(options).initialState);
  const restored = fragment(reopened.renderer.combatActions());
  assert.equal(reopened.hudState.showPassiveFeatures, true);
  assert.ok(
    restored.querySelector(
      '[data-item-id="darkvision"][data-action="openitem"]'
    )
  );
});

test("Features All combines native active and passive features and persists the filter independently", async () => {
  const f = customNpcFixture("Humongous Fungus Troll", {
    hudState: { combatCategory: "features" }
  });
  const { panelStateForActor, panelStateSnapshot } =
    await import("../scripts/hud/panel-state.js");
  const actions = createHudActions({
    actor: f.actor,
    hudState: f.hudState,
    refreshHud() {},
    t: key => key
  });
  await actions.featurefilter(null, { dataset: { filter: "all" } });
  const root = fragment(f.renderer.combatActions());
  assert.equal(
    root.querySelectorAll("[data-description-item-id]").length,
    f.actor.items.filter(item => item.type === "feat").length
  );
  assert.equal(
    root.querySelector('[data-filter="all"]').getAttribute("aria-pressed"),
    "true"
  );
  const saved = panelStateForActor(
    { "Actor.a": panelStateSnapshot(f.hudState) },
    "Actor.a"
  );
  assert.equal(saved.allFeatures, true);
  assert.equal(saved.showPassiveFeatures, false);
  await actions.featurefilter(null, { dataset: { filter: "passive" } });
  assert.equal(f.hudState.allFeatures, false);
  assert.equal(f.hudState.showPassiveFeatures, true);
  await actions.featurefilter(null, { dataset: { filter: "active" } });
  assert.equal(f.hudState.allFeatures, false);
  assert.equal(f.hudState.showPassiveFeatures, false);
});

test("feature source headings follow the HUD locale when Foundry has no module keys", async () => {
  installSettings();
  const { readFile } = await import("node:fs/promises");
  const { createModuleTranslator } = await import("../scripts/localization.js");
  const origins = itemCollection([
    { id: "monk", type: "class", name: "Monk" },
    { id: "race", type: "race", name: "Bugbear" }
  ]);
  const items = ["monk", "race"].map((source, i) => ({
    id: String(i),
    name: "Feature",
    type: "feat",
    parent: { items: origins },
    flags: { dnd5e: { advancementRoot: `${source}.a` } },
    system: { activities: [{ activation: { type: "action" } }] }
  }));
  for (const language of ["en", "ru"]) {
    const { t } = await createModuleTranslator({
      language,
      i18n: game.i18n,
      fetchCatalog: async lang =>
        JSON.parse(
          await readFile(
            new URL(`../lang/${lang}.json`, import.meta.url),
            "utf8"
          )
        )
    });
    const f = itemRendererFixture({
      items,
      adapter: dnd5eAdapter,
      t,
      hudState: { combatCategory: "features" }
    });
    const headings = [
      ...fragment(f.renderer.combatActions()).querySelectorAll(
        ".ws-feature-source"
      )
    ].map(node => node.textContent);
    assert.deepEqual(
      headings,
      language === "en"
        ? ["Class: Monk 1", "Species feature: Bugbear 1"]
        : ["Класс: Monk 1", "Особенности вида: Bugbear 1"]
    );
    assert.ok(headings.every(label => !label.includes("ADVENTURER_HUD")));
  }
});

test("inventory displays native quantities and attunement states without adding controls or combat metadata", () => {
  installSettings();
  for (const [quantity, attunement, attuned] of [
    [0, "required", false],
    [1, "required", true],
    [12, "", false],
    [2, "optional", false]
  ]) {
    const item = {
      id: "ring",
      name: "Ring",
      type: "equipment",
      system: { quantity, attunement, attuned }
    };
    const f = itemRendererFixture({
      adapter: { inventoryInfo: dnd5eAdapter.inventoryInfo },
      visibility: { cardDetailFields: [] }
    });
    const root = fragment(
      f.renderer.combatItemButton(item, { inventory: true })
    );
    assert.equal(
      root.querySelector(".ws-inventory-quantity").textContent,
      `× ${quantity}`
    );
    const indicator = root.querySelector(".ws-inventory-attunement");
    assert.equal(Boolean(indicator), Boolean(attunement));
    if (indicator) {
      assert.ok(
        indicator.classList.contains(attuned ? "ws-attuned" : "ws-not-attuned")
      );
      assert.ok(
        indicator.textContent.includes(
          attuned
            ? "Inventory.Attuned"
            : attunement === "required"
              ? "Inventory.AttunementRequired"
              : "Inventory.AttunementOptional"
        )
      );
      assert.equal(indicator.querySelector("button"), null);
    }
    assert.equal(
      fragment(f.renderer.combatItemButton(item)).querySelector(
        ".ws-inventory-quantity"
      ),
      null
    );
  }
  assert.equal(
    dnd5eAdapter.inventoryInfo({ system: { quantity: NaN } }).quantity,
    null
  );
});
