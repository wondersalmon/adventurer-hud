import { itemActivities } from "./items.js";

export const dnd5eRolls = {
  rollAbility: (actor, { type, key, event }) =>
    type === "save"
      ? actor.rollSavingThrow({ ability: key, event })
      : actor.rollAbilityCheck({ ability: key, event }),
  rollSkill: (actor, { key, event }) => actor.rollSkill({ skill: key, event }),
  rollTool: (actor, { key, event }) =>
    actor.rollToolCheck({ tool: key, event }),
  rollDeathSave: (actor, { event }) => actor.rollDeathSave({ event }),
  rollInitiative: (actor, { event }) =>
    actor.rollInitiative(
      { createCombatants: false },
      {
        advantage: Boolean(event?.altKey),
        disadvantage: Boolean(event?.ctrlKey),
        event
      }
    ),
  useItem: (item, { event }) => item.use({ event }),
  showItemDescription: item => item.displayCard(),
  useActivity: (item, activityId, { event }) => {
    const activity =
      item.system.activities?.get?.(activityId) ??
      itemActivities(item).find(candidate => candidate.id === activityId);
    return activity?.canUse !== false ? activity?.use({ event }) : null;
  }
};
