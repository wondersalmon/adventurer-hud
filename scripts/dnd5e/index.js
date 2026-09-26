import { dnd5eActor } from "./actor.js";
import { dnd5eConfig } from "./config.js";
import { dnd5eItems } from "./item-adapter.js";
import { dnd5eResources } from "./resources.js";
import { dnd5eRolls } from "./rolls.js";

export const dnd5eAdapter = {
  id: "dnd5e",
  ...dnd5eConfig,
  ...dnd5eActor,
  ...dnd5eResources,
  ...dnd5eItems,
  ...dnd5eRolls
};
