import { readFile } from "node:fs/promises";
import { dnd5eAdapter } from "../../scripts/dnd5e/index.js";
import { itemCollection, itemRendererFixture } from "./rendering.mjs";

// Reduced from the reported exports: no artwork, module flags or book descriptions.
const examples = JSON.parse(
  await readFile(
    new URL("../fixtures/custom-npc-actions.json", import.meta.url),
    "utf8"
  )
);

export function customNpcFixture(name, options = {}) {
  const source = structuredClone(examples.find(actor => actor.name === name));
  const calls = [];
  for (const item of source.items) {
    item.sheet = {
      render: (...args) => calls.push(["sheet", item.id, ...args])
    };
    for (const activity of item.system.activities) {
      activity.use = options =>
        calls.push(["use", item.id, activity.id, options]);
    }
  }
  const actor = {
    ...source,
    isOwner: true,
    system: {},
    items: itemCollection(source.items)
  };
  return {
    ...itemRendererFixture({
      items: source.items,
      actor,
      adapter: {
        ...dnd5eAdapter,
        activationTypeLabel: () => "",
        rangeUnitLabel: units => units
      },
      ...options,
      visibility: {
        gm: true,
        actionTypesOnly: true,
        showActionTypes: true,
        itemDetails: false,
        attackDetails: false,
        ...options.visibility
      }
    }),
    actor,
    calls
  };
}
