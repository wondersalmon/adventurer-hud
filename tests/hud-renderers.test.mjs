import assert from "node:assert/strict";
import test from "node:test";

import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createCombatResourceController } from "../scripts/hud/combat-resources.js";
import { createHudComponents } from "../scripts/hud/components.js";
import { createDeathRenderer } from "../scripts/hud/death-saves.js";

const escapeHTML = value =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

test("active-effect names are escaped before entering status attributes", () => {
  const originalConfig = globalThis.CONFIG;
  const originalGame = globalThis.game;
  globalThis.CONFIG = { statusEffects: [] };
  globalThis.game = {
    i18n: { localize: value => value }
  };

  try {
    const renderer = createCombatRenderer({
      actor: {
        effects: [
          {
            disabled: false,
            id: "effect-1",
            name: 'Marked "dangerous" <effect>',
            statuses: new Set(["custom"])
          }
        ],
        statuses: new Set(["custom"])
      },
      adapter: {},
      canRollActor: true,
      escapeHTML,
      hudState: {},
      t: key => key,
      tf: (_key, data) => `Remove ${data.condition}`,
      visibility: { conditions: true }
    });

    const html = renderer.combatStatuses();
    assert.match(
      html,
      /title="Remove Marked &quot;dangerous&quot; &lt;effect&gt;"/
    );
    assert.doesNotMatch(html, /title="Remove Marked "dangerous"/);
  } finally {
    globalThis.CONFIG = originalConfig;
    globalThis.game = originalGame;
  }
});

test("checks and saves share one collapsible block in both modes", () => {
  const hudState = {
    abilitiesExpanded: true,
    combatAbilitiesExpanded: false
  };
  const components = createHudComponents({
    abilities: [["str", "STR", "fa-hand-fist"]],
    actor: {},
    adapter: {
      abilityData: () => ({ mod: 2 }),
      abilityTotal: data => data.mod
    },
    canRollActor: true,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState,
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: key => key,
    visibility: { abilityChecks: true, savingThrows: true }
  });

  const regular = components.abilitiesSection();
  const combat = components.abilitiesSection("combat");
  assert.match(regular, /aria-expanded="true"/);
  assert.match(regular, /data-type="check"/);
  assert.match(regular, /data-type="save"/);
  assert.match(combat, /aria-expanded="false"/);
  assert.doesNotMatch(combat, /data-action="ability"/);
});

test("actor class summary keeps its full value in a tooltip", () => {
  const components = createHudComponents({
    abilities: [],
    actor: { img: "actor.webp", name: "Rook" },
    adapter: {
      classSummary: () => "Monk 7 / Barbarian 1"
    },
    canRollActor: true,
    combatModeAvailable: () => true,
    deathModeAvailable: () => true,
    escapeHTML,
    formatMod: String,
    hudState: {},
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: key => key,
    visibility: {}
  });

  const html = components.actorHeader();
  assert.match(html, /title="Monk 7 \/ Barbarian 1"/);
  assert.match(html, />Monk 7 \/ Barbarian 1<\/span>/);
});

test("adapter-provided ability markup is escaped", () => {
  const components = createHudComponents({
    abilities: [
      ['str" data-injected="yes', "<STR>", 'fa-hand-fist\" onclick=\"bad']
    ],
    actor: {},
    adapter: {
      abilityData: () => ({ mod: 2 }),
      abilityTotal: data => data.mod
    },
    canRollActor: true,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState: { abilitiesExpanded: true },
    marker: () => ["", "", ""],
    saveProf: () => 0,
    skillProf: () => 0,
    skills: [],
    t: key => key,
    tf: (_key, data) => `${data.ability} check`,
    visibility: { abilityChecks: true, savingThrows: true }
  });

  const html = components.abilitiesSection();
  assert.match(html, /data-key="str&quot; data-injected=&quot;yes"/);
  assert.match(html, /&lt;STR&gt;/);
  assert.doesNotMatch(html, /onclick="bad"/);
});

test("combat resources escape adapter identifiers and update through the adapter", async () => {
  const updates = [];
  const controller = createCombatResourceController({
    actor: {},
    adapter: {
      actorResources: () => [],
      featureResources: () => [
        {
          id: "resource",
          itemId: 'item\" injected=\"true',
          label: "Focus <Points>",
          max: 5,
          value: 3
        }
      ],
      resourceData: () => ({ current: 3, max: 5 }),
      updateResource: (_actor, data) => updates.push(data)
    },
    DialogV2: class {},
    escapeHTML,
    hudState: { resourcesExpanded: true },
    t: key => key,
    tf: key => key,
    visibility: { combatResources: true }
  });

  const html = controller.combatResources();
  assert.match(html, /data-item-id="item&quot; injected=&quot;true"/);
  assert.match(html, /Focus &lt;Points&gt;/);
  assert.match(html, /ws-resource-shortcuts ws-shortcuts/);
  assert.match(html, /Combat\.ResourceConsumeKeys/);
  assert.equal(
    await controller.changeResource({
      amount: 1,
      direction: "consume",
      item: { id: "item" }
    }),
    true
  );
  assert.equal(updates[0].value, 2);
});

test("combat resources with the same label remain separately available", () => {
  const controller = createCombatResourceController({
    actor: {},
    adapter: {
      actorResources: () => [
        { id: "primary", itemId: null, label: "Focus", max: 3, value: 2 }
      ],
      featureResources: () => [
        { id: "item-1", itemId: "item-1", label: "Focus", max: 2, value: 1 }
      ]
    },
    escapeHTML,
    hudState: { resourcesExpanded: true },
    t: key => key,
    visibility: { combatResources: true }
  });

  const html = controller.combatResources();
  assert.match(html, /data-resource-id="primary"/);
  assert.match(html, /data-item-id="item-1"/);
});

test("death renderer displays its mode heading", () => {
  const renderer = createDeathRenderer({
    actorHeader: () => "",
    canRollActor: false,
    canRollDeathSave: () => false,
    deathData: () => ({ failure: 0, success: 0 }),
    inspirationControl: () => "",
    modeNavigation: () => "",
    shortcutHint: () => "",
    t: key => key
  });

  assert.match(renderer.deathHTML(), /class="ws-death-heading"/);
});
