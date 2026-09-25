import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { dnd5eAdapter } from "../scripts/systems/dnd5e.js";
import { createCombatStatusRenderer } from "../scripts/hud/combat-statuses.js";
import {
  defineSystemAdapter,
  getSystemAdapter,
  listSystemAdapters,
  registerSystemAdapter
} from "../scripts/systems/registry.js";

test("adapter definitions provide safe defaults for disabled capabilities", () => {
  const adapter = defineSystemAdapter({ id: "minimal-test" });

  assert.equal(adapter.id, "minimal-test");
  assert.equal(adapter.capabilities.combat, false);
  assert.deepEqual(adapter.abilityDefinitions(), []);
  assert.deepEqual(adapter.combatItems(), []);
  assert.equal(adapter.inventoryCategory({}), null);
  assert.deepEqual(adapter.statusDefinitions(), []);
  assert.equal(adapter.statusKind({ id: "bloodied" }), null);
  assert.equal(defineSystemAdapter(adapter), adapter);
  assert.throws(() => adapter.rollAbility(), /does not support ability rolls/);

  const typed = defineSystemAdapter({ id: "typed-test", actorTypes: ["hero"] });
  assert.equal(typed.isActorSupported({ type: "hero" }), true);
  assert.equal(typed.isActorSupported({ type: "npc" }), false);
});

test("another system can provide statuses without D&D configuration", () => {
  const statuses = [{ id: "marked", name: "Marked" }];
  const adapter = defineSystemAdapter({
    id: "example-system",
    actorTypes: ["hero"],
    capabilities: { conditions: true },
    statusDefinitions: () => statuses,
    statusKind: () => null
  });

  assert.deepEqual(adapter.statusDefinitions(), statuses);
  assert.equal(defineSystemAdapter(adapter), adapter);
  assert.equal(registerSystemAdapter(adapter), adapter);
  assert.equal(adapter.capabilities.conditions, true);
  assert.equal(adapter.capabilities.spells, false);
  const previousGame = globalThis.game;
  globalThis.game = { i18n: { localize: value => value } };
  try {
    const { combatStatuses } = createCombatStatusRenderer({
      actor: { statuses: new Set(["marked"]), effects: [] },
      adapter,
      escapeHTML: String,
      hudState: {},
      t: key => key,
      visibility: { conditions: true }
    });
    assert.match(combatStatuses(), /title="Marked"/);
  } finally {
    globalThis.game = previousGame;
  }
  assert.throws(
    () =>
      defineSystemAdapter({
        id: "incomplete-system",
        capabilities: { conditions: true },
        statusDefinitions: () => statuses
      }),
    /does not define: statusKind/
  );
  assert.throws(
    () => defineSystemAdapter({ id: "bad-types", actorTypes: "hero" }),
    /actorTypes must be an array/
  );
  assert.throws(
    () =>
      defineSystemAdapter({
        id: "bad-capability",
        capabilities: { combat: 1 }
      }),
    /capabilities must be booleans/
  );
});

test("system adapters can be registered, discovered, and protected from duplicates", () => {
  const registered = registerSystemAdapter(dnd5eAdapter);

  assert.equal(getSystemAdapter("dnd5e"), registered);
  assert.ok(listSystemAdapters().includes("dnd5e"));
  assert.equal(registered.capabilities.inventory, true);
  assert.equal(registered.isActorSupported({ type: "character" }), true);
  assert.deepEqual(
    registered.combatStats({
      system: {
        attributes: {
          ac: { value: 16 },
          hp: { value: 12, max: 20, temp: 3 },
          movement: { walk: 30, units: "ft" }
        }
      }
    }),
    {
      ac: 16,
      hp: { value: 12, max: 20, temp: 3, tempmax: 0 },
      speed: 30,
      speedUnits: "ft",
      proficiencyBonus: "—"
    }
  );
  assert.throws(
    () => registerSystemAdapter(dnd5eAdapter),
    /already registered/
  );
});

test("the shared HUD has no direct D&D data-model access", async () => {
  const hudFiles = (await readdir(new URL("../scripts/hud", import.meta.url)))
    .filter(file => file.endsWith(".js"))
    .map(file => new URL(`../scripts/hud/${file}`, import.meta.url));
  const files = [
    new URL("../scripts/rolls-hud.js", import.meta.url),
    ...hudFiles
  ];
  const source = (
    await Promise.all(files.map(file => readFile(file, "utf8")))
  ).join("\n");

  assert.doesNotMatch(source, /CONFIG\.DND5E/);
  assert.doesNotMatch(source, /CONFIG\.statusEffects/);
  assert.doesNotMatch(source, /actor\.system/);
  assert.doesNotMatch(source, /actor\.roll(?:Ability|Saving|Skill|Tool|Death)/);
  assert.doesNotMatch(source, /item\.use\(/);
});
