import assert from "node:assert/strict";
import test from "node:test";
import { dnd5eAdapter as adapter } from "../scripts/dnd5e/index.js";
import { createCombatItemCardRenderer } from "../scripts/hud/items/combat-item-card.js";
import { createPanelPreferences } from "../scripts/hud/panel-preferences.js";
import { createHudState } from "../scripts/hud/state.js";
import { customNpcFixture } from "./helpers/custom-npcs.mjs";
import { fragment, escapeHTML, itemCollection } from "./helpers/rendering.mjs";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();
test("N1: unpressed modifiers preserve native initiative advantage/disadvantage", async () => {
  installSettings();
  globalThis.Hooks = { call: () => true, callAll() {} };
  for (const innate of ["advantage", "disadvantage"])
    for (const event of [
      {},
      { altKey: true },
      { ctrlKey: true },
      { altKey: true, ctrlKey: true }
    ]) {
      let actual;
      const actor = {
        isOwner: true,
        getInitiativeRoll(options) {
          // Models the final default/options merge in D&D 5e getInitiativeRollConfig.
          actual = {
            advantage: false,
            disadvantage: false,
            [innate]: true,
            ...options
          };
          return { options: actual };
        }
      };
      const combatant = {
        id: "one",
        actor,
        isOwner: true,
        initiative: null,
        getInitiativeRoll: () => actor.getInitiativeRoll({})
      };
      const combat = {
        combatants: new Map([["one", combatant]]),
        rollInitiative: async () => combatant.getInitiativeRoll()
      };
      combatant.parent = combat;
      await adapter.rollInitiative(actor, { combatant, event });
      assert.equal(actual[innate], true);
      assert.equal(
        actual.advantage,
        innate === "advantage" || Boolean(event.altKey)
      );
      assert.equal(
        actual.disadvantage,
        innate === "disadvantage" || Boolean(event.ctrlKey)
      );
    }
});

test("N2: Cast card uses consistent cached DC, range and damage", () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  const spell = (id, dc, damage, range) => ({
    id,
    name: "Test spell",
    type: "spell",
    system: {
      level: 1,
      properties: new Set(),
      range: { value: range, units: "ft" },
      activities: [
        {
          id: "save",
          type: "save",
          canUse: true,
          use() {},
          activation: { type: "action" },
          save: { dc: { value: dc } },
          labels: { damages: [{ formula: damage }] }
        }
      ]
    }
  });
  const original = spell("spell", 13, "1d6", 60);
  const cached = spell("cached", 17, "3d6", 120);
  cached.system.activities[0].activation.type = "bonus";
  cached.system.properties.add("concentration");
  const cast = {
    id: "cast",
    type: "cast",
    spell: { uuid: "Actor.hero.Item.spell" },
    cachedSpell: cached,
    canUse: true,
    use() {}
  };
  const owner = {
    id: "wand",
    type: "feat",
    system: { activities: [cast], uses: { max: 3, value: 2 } }
  };
  const actor = { isOwner: true, items: itemCollection([original, owner]) };
  const render = createCombatItemCardRenderer({
    actor,
    adapter,
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: key => key,
    visibility: { itemDetails: true, attackDetails: true }
  });
  const root = fragment(render(original));
  assert.equal(
    root.querySelector('[data-action="useactivity"]').dataset.itemId,
    "wand"
  );
  assert.match(root.textContent, /17/);
  assert.match(root.textContent, /BA/);
  assert.equal(
    root.querySelector(".ws-concentration-icon").getAttribute("aria-label"),
    "Combat.Concentration"
  );
  assert.match(root.textContent, /2\/3/);
  assert.equal(
    root.querySelector('[data-action="useactivity"]').dataset.activityId,
    "cast"
  );
  assert.match(root.textContent, /3d6/);
  assert.match(root.textContent, /120 ft/);
  assert.doesNotMatch(root.textContent, /1d6|60 ft/);
});

test("N3: selected activity category survives the panel preferences store", async () => {
  installSettings();
  globalThis.CONFIG = { DND5E: {} };
  let saved = {};
  const settings = {
    actorUuid: "Actor.boss",
    tokenUuid: "Scene.scene.Token.boss",
    gmActive: true,
    readSetting: key => (key === "panelStates" ? saved : false),
    writeSetting: async (_key, value) => {
      saved = value;
    }
  };
  const first = customNpcFixture("Llyvessa", {
    hudState: { combatCategory: "activation:villain" }
  });
  first.renderer.combatActions();
  assert.equal(first.hudState.combatCategory, "activation:villain");
  await createPanelPreferences(settings).save(createHudState(first.hudState));
  const next = customNpcFixture("Llyvessa", {
    hudState: createPanelPreferences(settings).initialState
  });
  next.renderer.combatActions();
  assert.equal(next.hudState.combatCategory, "activation:villain");
  const absent = customNpcFixture("Humongous Fungus Troll", {
    hudState: createPanelPreferences(settings).initialState
  });
  absent.renderer.combatActions();
  assert.notEqual(absent.hudState.combatCategory, "activation:villain");
});
