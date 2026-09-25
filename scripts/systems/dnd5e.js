import { dnd5eActor } from "../dnd5e/actor.js";
import { dnd5eConfig } from "../dnd5e/config.js";
import { dnd5eItems } from "../dnd5e/item-adapter.js";
import { dnd5eResources } from "../dnd5e/resources.js";
import { dnd5eRolls } from "../dnd5e/rolls.js";

export const dnd5eAdapter = {
  id: "dnd5e",
  actorTypes: Object.freeze(["character"]),
  capabilities: Object.freeze({
    activityChoice: true,
    abilityChecks: true,
    actions: true,
    bonusActions: true,
    combat: true,
    conditions: true,
    deathSaves: true,
    inspiration: true,
    inventory: true,
    reactions: true,
    resources: true,
    rests: true,
    spells: true,
    specialActions: true,
    savingThrows: true,
    skills: true,
    tools: true,
    weapons: true
  }),
  ...dnd5eConfig,
  ...dnd5eActor,
  ...dnd5eResources,
  ...dnd5eItems,
  ...dnd5eRolls
};
