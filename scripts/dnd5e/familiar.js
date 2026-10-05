import { itemActivities } from "./items.js";

const SENSES_ACTIVITY_ID = "hudFamiliarSight";

/** Native summon provenance, resolved against the displayed caster's items. */
export function familiarSourceItem(actor, familiar) {
  const origin = familiar?.flags?.dnd5e?.summon?.origin;
  if (typeof origin !== "string") return null;
  const source = [...(actor.items?.values?.() ?? actor.items ?? [])].find(
    item =>
      item.uuid === origin ||
      (actor.isToken &&
        actor.token?.baseActor &&
        `${actor.token.baseActor.uuid}.Item.${item.id}` === origin)
  );
  return source?.system?.identifier === "find-familiar" ? source : null;
}

export function familiarCasterIncapacitated(actor) {
  return [
    "incapacitated",
    "unconscious",
    "stunned",
    "paralyzed",
    "petrified",
    "dead"
  ].some(status => actor.statuses?.has?.(status));
}

/** Add a normal editable Utility activity once, then delegate native usage. */
export async function useFamiliarSenses(
  actor,
  familiar,
  { event, label, isCurrent }
) {
  const item = familiarSourceItem(actor, familiar);
  if (
    !item?.isOwner ||
    !actor.isOwner ||
    !isCurrent() ||
    familiarCasterIncapacitated(actor)
  )
    return null;
  let activity = itemActivities(item).find(
    entry => entry.id === SENSES_ACTIVITY_ID
  );
  if (!activity) {
    await item.update({
      [`system.activities.${SENSES_ACTIVITY_ID}`]: {
        _id: SENSES_ACTIVITY_ID,
        name: label,
        type: "utility",
        activation: { type: "bonus", value: 1, override: true },
        consumption: { spellSlot: false, targets: [] },
        duration: { units: "turn", value: "1", override: true },
        range: { units: "spec", override: true },
        target: { override: true, prompt: false, affects: { type: "self" } }
      }
    });
    activity = itemActivities(item).find(
      entry => entry.id === SENSES_ACTIVITY_ID
    );
  }
  if (
    !isCurrent() ||
    familiarSourceItem(actor, familiar) !== item ||
    !item.isOwner ||
    !actor.isOwner ||
    familiarCasterIncapacitated(actor) ||
    activity?.canUse === false ||
    typeof activity?.use !== "function"
  )
    return null;
  return activity.use({ event }, {}, { create: false });
}
