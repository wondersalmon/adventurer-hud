import assert from "node:assert/strict";
import test from "node:test";

import { createCombatRenderer } from "../scripts/hud/combat.js";
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

test("checks and combat saves start expanded", () => {
  const hudState = {
    abilityChecksExpanded: true,
    combatSavingThrowsExpanded: true,
    savingThrowsExpanded: true
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
    visibility: {}
  });

  assert.match(components.abilityChecksSection(), /aria-expanded="true"/);
  assert.match(components.abilityChecksSection(), /data-action="ability"/);
  assert.match(
    components.savingThrowsSection("combat"),
    /aria-expanded="true"/
  );
  assert.match(
    components.savingThrowsSection("combat"),
    /data-action="ability"/
  );
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

test("death renderer receives mode-heading visibility from its context", () => {
  const renderer = createDeathRenderer({
    actorHeader: () => "",
    canRollActor: false,
    canRollDeathSave: () => false,
    deathData: () => ({ failure: 0, success: 0 }),
    inspirationControl: () => "",
    modeNavigation: () => "",
    shortcutHint: () => "",
    t: key => key,
    visibility: { modeHeadings: false }
  });

  assert.match(renderer.deathHTML(), /ws-death-heading ws-hidden/);
});
