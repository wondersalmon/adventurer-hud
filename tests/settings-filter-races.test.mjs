import assert from "node:assert/strict";
import test from "node:test";
import { EffectSettingsController } from "../scripts/settings-effects.js";
import { dnd5eAdapter as adapter } from "../scripts/dnd5e/index.js";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

function effectForm({ mode = "custom", savedFilter = "conditions" } = {}) {
  installSettings();
  const { document } = installDom();
  globalThis.CONFIG = {
    statusEffects: [
      { id: "poisoned", name: "Poisoned" },
      { id: "thinking", name: "Thinking" },
      { id: "hovering", name: "Hovering" }
    ],
    DND5E: { conditionTypes: { poisoned: {} } }
  };
  const root = document.createElement("form");
  root.innerHTML =
    '<select name="statusFilter"></select><input data-effect-search><span data-effect-count></span><div data-hidden-effects-list><label><input name="hiddenEffects" value="status:thinking" data-standard-status="false">Thinking</label><label><input name="hiddenEffects" value="status:poisoned" data-standard-status="true">Poisoned</label></div>';
  const filter = root.querySelector("select");
  Object.defineProperty(filter, "value", {
    get: () => mode,
    set: value => {
      mode = value;
    }
  });
  const controller = new EffectSettingsController(root, {
    selected: ["status:thinking"],
    savedFilter,
    t: key => key,
    onError: error => {
      throw error;
    }
  });
  return { root, filter, controller };
}

test("first legacy catalogue load retains manual exceptions and materializes untouched conditions", async () => {
  const { root, controller, filter } = effectForm();
  const pending = controller.load();
  const thinking = root.querySelector('[value="status:thinking"]');
  thinking.checked = false;
  controller.change(thinking);
  const poisoned = root.querySelector('[value="status:poisoned"]');
  poisoned.checked = true;
  controller.change(poisoned);
  await pending;
  assert.equal(filter.value, "custom");
  assert.deepEqual([...controller.selected].sort(), [
    "status:hovering",
    "status:poisoned"
  ]);
  assert.equal(root.querySelector('[value="status:thinking"]').checked, false);
  assert.equal(root.querySelector('[value="status:poisoned"]').checked, true);
  controller.dispose();
});

test("editing initial D&D-only checks before load applies untouched preset exclusions", async () => {
  const { root, controller, filter } = effectForm({ mode: "conditions" });
  const pending = controller.load();
  const thinking = root.querySelector('[value="status:thinking"]');
  thinking.checked = false;
  controller.change(thinking);
  await pending;
  assert.equal(filter.value, "custom");
  assert.deepEqual([...controller.selected], ["status:hovering"]);
  controller.dispose();
});

test("explicit preset or Clear replaces pending legacy choices and search never changes selection", async () => {
  for (const preset of ["all", "conditions", "clear"]) {
    const { root, controller, filter } = effectForm();
    const pending = controller.load();
    if (preset === "clear") controller.clear();
    else {
      filter.value = preset;
      controller.change(filter);
    }
    await pending;
    const expected =
      preset === "conditions" ? ["status:hovering", "status:thinking"] : [];
    assert.deepEqual([...controller.selected].sort(), expected);
    root.querySelector("[data-effect-search]").value = "nothing matches";
    controller.update();
    assert.deepEqual([...controller.selected].sort(), expected);
    assert.ok(
      [...root.querySelectorAll("[data-hidden-effects-list] label")].every(
        label => label.hidden
      )
    );
    controller.dispose();
  }
});

test("disposed first catalogue load leaves its old form untouched", async () => {
  const { root, controller } = effectForm();
  const list = root.querySelector("[data-hidden-effects-list]");
  const previous = list.firstElementChild;
  const pending = controller.load();
  controller.dispose();
  await pending;
  assert.equal(list.firstElementChild, previous);
  assert.equal(controller.loaded, false);
});

test("damage formula and types come from the same native Activity, never other activity or item labels", () => {
  installSettings();
  globalThis.CONFIG = {
    DND5E: {
      damageTypes: {
        fire: { label: "Fire" },
        cold: { label: "Cold" },
        poison: { label: "Poison" }
      },
      healingTypes: {}
    }
  };
  const item = {
    labels: { damages: [{ formula: "9d10", damageType: "poison" }] },
    system: {
      activities: new Map([
        ["utility", { id: "utility", labels: {} }],
        [
          "fire",
          {
            id: "fire",
            labels: { damages: [{ formula: "3d6", damageType: "fire" }] },
            damage: { parts: [{ types: new Set(["fire"]) }] }
          }
        ],
        [
          "cold",
          {
            id: "cold",
            labels: { damages: [{ formula: "1d8", damageType: "cold" }] },
            damage: { parts: [{ types: new Set(["cold"]) }] }
          }
        ]
      ])
    }
  };
  assert.equal(adapter.itemDamageFormula({}, item), "3d6");
  assert.deepEqual(adapter.itemDamageTypes(item), ["Fire"]);
  assert.equal(adapter.itemDamageFormula({}, item, "cold"), "1d8");
  assert.deepEqual(adapter.itemDamageTypes(item, "cold"), ["Cold"]);
  assert.equal(adapter.itemDamageFormula({}, item, "missing"), "");
  assert.deepEqual(adapter.itemDamageTypes(item, "missing"), []);
  item.system.activities.clear();
  assert.equal(adapter.itemDamageFormula({}, item), "9d10");
  assert.deepEqual(adapter.itemDamageTypes(item), ["Poison"]);
});
