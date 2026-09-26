import assert from "node:assert/strict";
import test from "node:test";
import { dnd5eAdapter as adapter } from "../scripts/dnd5e/index.js";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection } from "./helpers/rendering.mjs";

restoreGlobalsAfterEach();

test("feature category contains activatable limited-use and resource-consuming feats", () => {
  const activity = { id: "use", use() {} };
  const own = {
    id: "own",
    type: "feat",
    system: { uses: { max: 3, value: 0 }, activities: [activity] }
  };
  const linked = {
    id: "linked",
    type: "feat",
    system: {
      activities: [
        {
          ...activity,
          consumption: {
            targets: [{ type: "itemUses", target: "pool", value: "1" }]
          }
        }
      ]
    }
  };
  const attribute = {
    id: "attribute",
    type: "feat",
    system: {
      activities: [
        {
          ...activity,
          consumption: {
            targets: [
              {
                type: "attribute",
                target: "resources.primary.value",
                value: "1"
              }
            ]
          }
        }
      ]
    }
  };
  const activityUses = {
    id: "activity",
    type: "feat",
    system: { activities: [{ ...activity, uses: { max: 1, value: 1 } }] }
  };
  const pool = {
    id: "pool",
    type: "feat",
    system: { uses: { max: 5, value: 5 }, activities: [] }
  };
  const passive = {
    id: "passive",
    type: "feat",
    system: { activities: [activity] }
  };
  const weapon = { ...own, id: "weapon", type: "weapon" };
  const actor = {
    items: itemCollection([
      own,
      linked,
      attribute,
      activityUses,
      pool,
      passive,
      weapon
    ])
  };
  const expected = [own, linked, attribute, activityUses];
  assert.deepEqual(adapter.combatItems(actor, "features"), expected);
  assert.deepEqual(
    adapter.combatItemsByCategory(actor, ["features"]).get("features"),
    expected
  );
});

test("cards read prepared labels and activity charges without reconstructing damage", () => {
  const activity = {
    id: "attack",
    type: "attack",
    labels: {
      toHit: "+9",
      damages: [{ formula: "2d8 + 5" }, { formula: "1d6" }]
    },
    uses: { max: 2, value: 1 },
    save: { dc: { value: 17 } }
  };
  const item = {
    system: {
      activities: new Map([[activity.id, activity]]),
      uses: { max: 7, value: 4, spent: 0 },
      get damage() {
        throw Error("Raw damage must not be read");
      }
    }
  };
  assert.equal(adapter.itemDamageFormula({}, item, "attack"), "2d8 + 5 + 1d6");
  assert.equal(adapter.itemAttackBonus(item, "attack"), "+9");
  assert.equal(adapter.itemSaveDc(item, "attack"), 17);
  assert.deepEqual(adapter.itemUsesData(item, "attack"), { max: 2, value: 1 });
  assert.deepEqual(adapter.itemUsesData(item), { max: 7, value: 4 });
  assert.equal(adapter.itemDamageFormula({}, item, "missing"), "");
});

test("spell preparation uses native eligibility and configured states", async () => {
  globalThis.CONFIG = {
    DND5E: {
      spellPreparationStates: {
        unprepared: { value: 0 },
        prepared: { value: 1 },
        always: { value: 2 }
      }
    }
  };
  const writes = [];
  const item = {
    type: "spell",
    system: { level: 1, canPrepare: true, prepared: 0 },
    update: data => writes.push(data)
  };
  assert.equal(adapter.isPreparedSpell(item), false);
  await adapter.toggleSpellPreparation(item);
  item.system.prepared = 1;
  await adapter.toggleSpellPreparation(item);
  item.system.prepared = 2;
  assert.equal(adapter.isPreparedSpell(item), true);
  await adapter.toggleSpellPreparation(item);
  item.system.level = 0;
  item.system.prepared = 0;
  assert.equal(adapter.isPreparedSpell(item), true);
  await adapter.toggleSpellPreparation(item);
  item.system.level = 1;
  item.system.canPrepare = false;
  assert.equal(adapter.isPreparedSpell(item), true);
  await adapter.toggleSpellPreparation(item);
  assert.deepEqual(writes, [
    { "system.prepared": 1 },
    { "system.prepared": 0 }
  ]);
});

test("calculated movement preserves zero and checks use prepared totals", () => {
  const actor = {
    system: { attributes: { hp: {}, movement: { speed: 0, walk: 30 } } }
  };
  assert.equal(adapter.combatStats(actor).speed, 0);
  assert.equal(
    adapter.abilityTotal(
      { mod: 3, checkBonus: 2, checkProf: { term: "3", flat: 3 } },
      "check"
    ),
    8
  );
  assert.equal(
    adapter.abilityTotal(
      { mod: 3, checkBonus: 2, checkProf: { term: "1d4", flat: 3 } },
      "check"
    ),
    5
  );
  assert.equal(
    adapter.abilityTotal(
      { mod: 3, check: { value: 8 }, save: { value: 11 } },
      "check"
    ),
    8
  );
  assert.equal(
    adapter.abilityTotal({ mod: 3, save: { value: 11 } }, "save"),
    11
  );
  for (const ability of [
    { saveProf: { multiplier: 1 } },
    { save: { prof: { multiplier: 2 } } }
  ]) {
    actor.system.abilities = { str: ability };
    assert.ok(adapter.saveProficiency(actor, "str") > 0);
  }
});

test("tools use owned documents or native base-item resolution for their identity", async () => {
  globalThis.CONFIG = {
    DND5E: {
      tools: {
        thief: { id: "Compendium.tools.thief" },
        lute: { id: "Compendium.tools.lute" }
      }
    }
  };
  const requests = [];
  globalThis.game = {
    i18n: { lang: "en" },
    dnd5e: {
      documents: {
        Trait: {
          async getBaseItem(id, options) {
            requests.push([id, options]);
            return {
              name: "Lute",
              img: "lute.webp",
              system: { type: { value: "music" } }
            };
          }
        }
      }
    }
  };
  const actor = {
    items: [
      {
        type: "tool",
        name: "Custom picks",
        img: "picks.webp",
        system: { type: { baseItem: "thief", value: "art" } }
      }
    ],
    system: {
      tools: {
        thief: { prof: { multiplier: 2 }, ability: "dex" },
        lute: { prof: 1, ability: "cha" },
        untrained: { prof: 0 }
      }
    }
  };
  const tools = await adapter.getTools(actor, { localize: value => value });
  assert.deepEqual(
    tools.map(({ name, img, isMusic }) => ({ name, img, isMusic })),
    [
      { name: "Custom picks", img: "picks.webp", isMusic: false },
      { name: "Lute", img: "lute.webp", isMusic: true }
    ]
  );
  assert.deepEqual(requests, [["Compendium.tools.lute", { fullItem: true }]]);
});

test("condition descriptions enrich native rules and custom effects, excluding suppressed effects", async () => {
  globalThis.CONFIG = {
    statusEffects: [{ id: "poisoned", reference: "Compendium.rules.poisoned" }]
  };
  const calls = [];
  globalThis.foundry = {
    applications: {
      ux: {
        TextEditor: {
          implementation: {
            async enrichHTML(text, options) {
              calls.push([text, options]);
              return `<p>${text}</p>`;
            }
          }
        }
      }
    }
  };
  const effect = {
    statuses: new Set(["custom"]),
    description: "Custom effect"
  };
  const actor = {
    isOwner: true,
    statuses: new Set(["poisoned"]),
    *allApplicableEffects() {
      yield effect;
      yield {
        statuses: new Set(["hidden"]),
        description: "Suppressed",
        isSuppressed: true
      };
    }
  };
  const descriptions = await adapter.statusDescriptions(actor);
  assert.equal(
    descriptions.get("poisoned"),
    "<p>@Embed[Compendium.rules.poisoned inline]</p>"
  );
  assert.equal(descriptions.get("custom"), "<p>Custom effect</p>");
  assert.equal(descriptions.has("hidden"), false);
  assert.equal(calls[1][1].relativeTo, effect);
  assert.equal(calls[1][1].secrets, true);
});
