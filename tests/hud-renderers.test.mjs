import assert from "node:assert/strict";
import test from "node:test";

import { createCombatRenderer } from "../scripts/hud/combat.js";

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
