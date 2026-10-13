import assert from "node:assert/strict";
import test from "node:test";
import { createCombatItemCardRenderer } from "../scripts/hud/items/combat-item-card.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { cardDetailFields } from "../scripts/settings-schema.js";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { escapeHTML, fragment } from "./helpers/rendering.mjs";

restoreGlobalsAfterEach();

function strikeRenderer({
  mode = "all",
  fields = [],
  owner = true,
  activityPicker = true
} = {}) {
  installSettings();
  globalThis.CONFIG = {
    DND5E: {
      damageTypes: { bludgeoning: { label: "Bludgeoning" } },
      healingTypes: {}
    }
  };
  const item = {
    id: "strike",
    name: "Unarmed Strike",
    type: "feat",
    system: {
      activities: new Map([
        [
          "attack",
          {
            id: "attack",
            name: "Attack",
            type: "attack",
            activation: { type: "action" },
            labels: {
              toHit: "+3",
              damages: [{ formula: "1", damageType: "bludgeoning" }]
            },
            range: { value: 5, units: "ft" },
            use() {}
          }
        ],
        [
          "grapple",
          {
            id: "grapple",
            name: "Grapple",
            type: "save",
            activation: { type: "action" },
            labels: {},
            save: { dc: { value: 11 } },
            range: { value: 5, units: "ft" },
            use() {}
          }
        ],
        [
          "shove",
          {
            id: "shove",
            name: "Shove",
            type: "save",
            activation: { type: "action" },
            labels: {},
            save: { dc: { value: 12 } },
            range: { value: 5, units: "ft" },
            use() {}
          }
        ]
      ])
    }
  };
  const render = createCombatItemCardRenderer({
    actor: { isOwner: owner, items: new Map([[item.id, item]]) },
    adapter: { ...dnd5eAdapter, rangeUnitLabel: units => units },
    escapeHTML,
    hudState: {
      favoriteEntries: [{ itemId: item.id, activityId: "grapple" }],
      openActivityItemId: item.id
    },
    t: key => key,
    visibility: {
      activityPicker,
      favorites: true,
      cardDetailFields: cardDetailFields(mode, fields)
    }
  });
  return { render, item };
}

test("Unarmed Strike parent is neutral and each expanded native action owns its roll and damage details", () => {
  const { render, item } = strikeRenderer();
  const root = fragment(render(item));
  const parent = root.querySelector(".ws-combat-item");
  assert.equal(parent.querySelector(".ws-spell-meta"), null);
  assert.equal(parent.dataset.action, "useitem");
  const action = id =>
    root.querySelector(
      '.ws-activity-option [data-action="useactivity"][data-activity-id="' +
        id +
        '"]'
    );
  assert.match(action("attack").textContent, /Attack/);
  assert.match(action("attack").textContent, /\+3/);
  assert.match(action("attack").textContent, /1 Bludgeoning/);
  assert.doesNotMatch(action("attack").textContent, /11|12|SaveDCShort/);
  assert.match(action("grapple").textContent, /SaveDCShort 11/);
  assert.doesNotMatch(action("grapple").textContent, /\+3|Bludgeoning|12/);
  assert.match(action("shove").textContent, /SaveDCShort 12/);
  assert.doesNotMatch(action("shove").textContent, /\+3|Bludgeoning|11/);
  assert.equal(action("grapple").dataset.itemId, "strike");
  assert.equal(
    root.querySelector('.ws-activity-option [data-action="removefavorite"]')
      .dataset.activityId,
    "grapple"
  );
});

test("activity details respect Off, Basic and Custom; favorites use only their selected Activity", () => {
  for (const [mode, fields] of [
    ["off", []],
    ["basic", []],
    ["custom", ["attack"]],
    ["custom", ["damage", "damageType"]]
  ]) {
    const { render, item } = strikeRenderer({ mode, fields });
    const root = fragment(render(item));
    const grapple = root.querySelector(
      '.ws-activity-option [data-action="useactivity"][data-activity-id="grapple"]'
    );
    const attack = root.querySelector(
      '.ws-activity-option [data-action="useactivity"][data-activity-id="attack"]'
    );
    if (mode === "off")
      assert.equal(root.querySelector(".ws-spell-meta"), null);
    if (mode === "basic" || fields.includes("attack")) {
      assert.match(grapple.textContent, /SaveDCShort 11/);
      assert.match(attack.textContent, /\+3/);
    } else assert.doesNotMatch(grapple.textContent, /SaveDCShort/);
    assert.equal(
      Boolean(attack.querySelector(".fa-burst")),
      mode === "basic" || fields.includes("damage")
    );
    const favorite = fragment(
      render(item, { activityId: "grapple", inFavorites: true })
    );
    assert.equal(favorite.querySelector(".ws-activity-menu"), null);
    assert.doesNotMatch(
      favorite.querySelector(".ws-combat-item").textContent,
      /\+3|Bludgeoning|12/
    );
    assert.equal(
      favorite.querySelector('[data-action="useactivity"]').dataset.activityId,
      "grapple"
    );
  }
});

test("readonly Activity entries keep owner guards and a removed Activity never borrows another action's details", () => {
  const { render, item } = strikeRenderer({ owner: false });
  const root = fragment(render(item));
  for (const button of root.querySelectorAll(".ws-activity-option button"))
    assert.equal(button.hasAttribute("disabled"), true);
  const removed = fragment(
    render(item, { activityId: "removed", inFavorites: true })
  );
  const control = removed.querySelector(".ws-combat-item");
  assert.equal(control.hasAttribute("disabled"), true);
  assert.equal(control.querySelector(".ws-spell-meta"), null);
  assert.doesNotMatch(control.textContent, /\+3|11|12|Bludgeoning/);
  const owned = strikeRenderer();
  const missing = fragment(
    owned.render(owned.item, { activityId: "removed", inFavorites: true })
  ).querySelector(".ws-combat-item");
  assert.equal(missing.hasAttribute("disabled"), true);
  assert.equal(missing.title, "Quick.ActivityMissing");
  assert.equal(missing.querySelector(".ws-spell-meta"), null);
  const neutral = strikeRenderer({ activityPicker: false });
  const closed = fragment(neutral.render(neutral.item));
  assert.equal(closed.querySelector(".ws-activity-menu"), null);
  assert.equal(closed.querySelector(".ws-combat-item .ws-spell-meta"), null);
});
