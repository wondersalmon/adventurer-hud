import {
  damagePartFormula,
  hasItemProperty,
  inventoryCategory,
  isPreparedSpell,
  itemActivation,
  itemActivities,
  itemRangeData,
  itemUsesData,
  spellPreparation
} from "./items.js";
const resolveDamageFormula = (formula, actor, item, activity) => {
  if (!formula) return "";

  const source = String(formula);
  const rollData =
    activity?.getRollData?.({ deterministic: true }) ??
    item.getRollData?.() ??
    actor.getRollData?.() ??
    {};

  try {
    return Roll.replaceFormulaData(source, rollData, {
      missing: 0,
      warn: false
    })
      .replaceAll(/\s+/g, " ")
      .trim();
  } catch {
    return source.replaceAll(/\s+/g, " ").trim();
  }
};

const combatItemCategories = item => {
  const categories = new Set();
  if (item.type === "weapon") categories.add("weapons");
  if (item.type === "spell") categories.add("spells");

  const activities = itemActivities(item);
  const activation =
    item.system?.activation?.type ??
    activities.find(activity => activity?.activation?.type)?.activation?.type;
  if (activation) categories.add(activation);
  for (const activity of activities) {
    if (activity?.activation?.type) categories.add(activity.activation.type);
  }
  return categories;
};

export const dnd5eItems = {
  itemActivities,
  itemActivation,
  itemRangeData,
  hasItemProperty,
  isPreparedSpell,
  damagePartFormula,
  inventoryCategory,
  itemUsesData,
  itemRole(item) {
    if (item.type === "weapon") return "weapon";
    if (item.type === "spell") return "spell";
    return "other";
  },
  combatItems(actor, category) {
    if (category === "weapons") {
      return actor.items.filter(item => item.type === "weapon");
    }
    if (category === "spells") {
      return actor.items.filter(item => item.type === "spell");
    }
    return actor.items.filter(item => combatItemCategories(item).has(category));
  },
  combatItemsByCategory(actor, categoryNames) {
    const categories = new Map(categoryNames.map(category => [category, []]));
    const includesActions = categoryNames.some(
      category => category !== "weapons" && category !== "spells"
    );
    for (const item of actor.items) {
      if (!includesActions) {
        if (item.type === "weapon") categories.get("weapons")?.push(item);
        if (item.type === "spell") categories.get("spells")?.push(item);
        continue;
      }
      for (const category of combatItemCategories(item)) {
        categories.get(category)?.push(item);
      }
    }
    return categories;
  },
  spellLevel: item => Number(item.system?.level ?? 0),
  spellPreparation,
  toggleSpellPreparation(item) {
    const prepared = spellPreparation(item);
    if (!prepared.canPrepare) return;
    const modern =
      item.system?.method !== undefined || item.system?.prepared !== undefined;
    return item.update(
      modern
        ? { "system.prepared": prepared.prepared ? 0 : 1 }
        : { "system.preparation.prepared": !prepared.prepared }
    );
  },
  itemResourceCost(actor, item, { fallbackLabel, activityId = null }) {
    const activityTarget = itemActivities(item)
      .filter(activity => !activityId || activity.id === activityId)
      .flatMap(activity => activity?.consumption?.targets ?? [])
      .find(target => Number(target?.value ?? target?.amount) > 0);
    const legacy = item.system?.consume;
    const amount = Number(
      activityTarget?.value ?? activityTarget?.amount ?? legacy?.amount ?? 0
    );
    if (!amount) return "";

    const targetId = activityTarget?.target ?? legacy?.target;
    const targetItem = targetId ? actor.items.get(targetId) : null;
    const label =
      targetItem?.name ||
      String(targetId ?? "")
        .split(".")
        .filter(Boolean)
        .at(-1) ||
      fallbackLabel;
    return `${amount} ${label}`;
  },
  itemAttackBonus(item, activityId = null) {
    const activities = itemActivities(item);
    const activity = activityId
      ? activities.find(candidate => candidate.id === activityId)
      : activities.find(
          candidate => candidate?.type === "attack" || candidate?.attack
        );
    if (activityId && !(activity?.type === "attack" || activity?.attack)) {
      return "";
    }
    const value =
      activity?.labels?.toHit ??
      activity?.labels?.modifier ??
      (activityId ? null : (item.labels?.toHit ?? item.labels?.attack));
    if ([undefined, null, ""].includes(value)) return "";

    const label = String(value).trim();
    return /^\d/.test(label) ? `+${label}` : label;
  },
  itemSaveDc(item, activityId = null) {
    const activities = itemActivities(item);
    const activity = activityId
      ? activities.find(candidate => candidate.id === activityId)
      : activities.find(candidate => candidate?.save);
    if (activityId && !activity?.save) return "";
    const dc =
      activity?.save?.dc?.value ??
      (activityId
        ? null
        : (item.system?.save?.dc?.value ?? item.system?.save?.dc));
    const value = Number(dc);
    return Number.isFinite(value) && value > 0 ? String(value) : "";
  },
  itemDamageFormula(actor, item, activityId = null) {
    const activities = itemActivities(item);
    const selected = activityId
      ? activities.find(activity => activity.id === activityId)
      : null;
    if (activityId && !selected) return "";

    const activityParts = (activityId ? [selected] : activities).flatMap(
      activity =>
        (activity?.damage?.parts ?? []).map(part => ({ activity, part }))
    );
    const legacyParts = activityId ? [] : (item.system?.damage?.parts ?? []);
    const base = item.system?.damage?.base;
    const includeBase = activityId
      ? selected.damage?.includeBase &&
        !activityParts.some(({ part }) => part.base)
      : true;
    const baseRecords =
      includeBase && base?.formula
        ? [{ activity: selected ?? activities[0], part: base }]
        : [];
    const records = [
      ...(activityId ? baseRecords : []),
      ...activityParts,
      ...(activityId ? [] : baseRecords),
      ...legacyParts.map(part => ({ activity: activities[0], part }))
    ];
    const sourceFormulas = records.map(({ part }) => damagePartFormula(part));
    const includesAbilityModifier = sourceFormulas.some(formula =>
      /@(?:mod|abilities\.[^.\s]+\.mod)\b/.test(String(formula))
    );
    const unique = [
      ...new Set(
        records
          .map(({ activity, part }) =>
            resolveDamageFormula(damagePartFormula(part), actor, item, activity)
          )
          .filter(Boolean)
      )
    ];

    if (
      item.type === "weapon" &&
      unique.length &&
      !includesAbilityModifier &&
      (!selected || selected.type === "attack" || selected.attack)
    ) {
      const activity =
        selected ?? activities.find(candidate => candidate?.attack);
      const abilityId =
        activity?.attack?.ability ??
        activity?.ability ??
        item.system?.ability ??
        (item.system?.actionType?.startsWith("r") ? "dex" : "str");
      const modifier = Number(actor.system.abilities?.[abilityId]?.mod ?? 0);
      if (modifier) {
        unique[0] = `${unique[0]} ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;
      }
    }

    return unique.join(" + ");
  }
};
