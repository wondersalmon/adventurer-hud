import {
  hasItemProperty,
  inventoryCategory,
  isPreparedSpell,
  itemActivation,
  itemActivities,
  itemRangeData,
  itemUsesData,
  itemUseState,
  spellPreparation
} from "./items.js";
const combatItemCategories = (item, { groupOtherActions = false } = {}) => {
  const categories = new Set();
  if (item.flags?.dnd5e?.cachedFor) return categories;
  if (item.type === "weapon") categories.add("weapons");
  if (item.type === "spell") categories.add("spells");
  if (item.type === "feat") categories.add("features");

  const activities = itemActivities(item);
  for (const activity of activities) {
    if (
      groupOtherActions &&
      !["action", "bonus", "reaction"].includes(activity?.activation?.type)
    )
      categories.add("special");
    if (activity?.activation?.type) {
      if (
        !["weapons", "spells", "features", "skills"].includes(
          activity.activation.type
        )
      )
        categories.add(activity.activation.type);
      categories.add(`activation:${activity.activation.type}`);
    }
  }
  return categories;
};

export const dnd5eItems = {
  combatActionTypes(actor) {
    const types = new Set();
    for (const item of actor.items.values()) {
      if (item.flags?.dnd5e?.cachedFor) continue;
      for (const activity of itemActivities(item)) {
        if (activity.activation?.type) types.add(activity.activation.type);
      }
    }
    return [...types];
  },
  async itemDescription(item) {
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system?.description?.value ?? "",
      {
        relativeTo: item,
        secrets: Boolean(item.isOwner ?? item.actor?.isOwner)
      }
    );
  },
  legendaryResistanceUsage(actor) {
    for (const item of actor.items.values()) {
      const activity = itemActivities(item).find(activity =>
        activity.consumption?.targets?.some(
          target =>
            target.type === "attribute" &&
            target.target === "resources.legres.value"
        )
      );
      if (activity) return { itemId: item.id, activityId: activity.id };
    }
    return null;
  },
  itemUsageTargets(actor) {
    const targets = new Map();
    for (const owner of actor.items.values()) {
      for (const activity of itemActivities(owner)) {
        if (activity.type !== "cast") continue;
        const id = /\.Item\.([^.]+)$/.exec(activity.spell?.uuid ?? "")?.[1];
        const spell = id ? actor.items.get(id) : null;
        if (spell?.type !== "spell" || targets.has(id)) continue;
        targets.set(id, {
          item: owner,
          activityId: activity.id,
          detailsItem: activity.cachedSpell ?? spell
        });
      }
    }
    return targets;
  },
  itemUsageTarget(actor, item, targets = null) {
    if (targets) return targets.get(item.id) ?? { item, activityId: null };
    if (item.type === "spell") {
      for (const owner of actor.items.values()) {
        const activity = itemActivities(owner).find(
          activity =>
            activity.type === "cast" &&
            activity.spell?.uuid?.endsWith(`.Item.${item.id}`)
        );
        if (activity)
          return {
            item: owner,
            activityId: activity.id,
            detailsItem: activity.cachedSpell ?? item
          };
      }
    }
    return { item, activityId: null };
  },
  itemResourceData(actor, item, activityId = null) {
    const own = itemUsesData(item, activityId);
    if (own) return own;
    const activities = activityId
      ? itemActivities(item).filter(activity => activity.id === activityId)
      : itemActivities(item);
    for (const activity of activities) {
      for (const target of activity.consumption?.targets ?? []) {
        if (target.type === "itemUses") {
          const uses = itemUsesData(
            target.target ? actor.items.get(target.target) : item
          );
          if (uses) return uses;
        }
        if (target.type === "attribute" && target.target?.endsWith(".value")) {
          const resource = target.target
            .split(".")
            .slice(0, -1)
            .reduce((value, key) => value?.[key], actor.system);
          if (resource?.max > 0)
            return {
              max: resource.max,
              value:
                resource.value ??
                Math.max(0, resource.max - (resource.spent ?? 0))
            };
        }
      }
    }
    return null;
  },
  itemAttackDetails(item, activityId = null) {
    return itemActivities(item)
      .filter(activity => !activityId || activity.id === activityId)
      .map(activity => ({
        name: activity.name || item.name,
        attack: activity.labels?.toHit ?? "",
        dc: activity.save?.dc?.value ?? ""
      }))
      .filter(detail => detail.attack || detail.dc);
  },
  itemActivities,
  itemActivation,
  itemRangeData,
  hasItemProperty,
  isPreparedSpell,
  inventoryCategory,
  itemUsesData,
  itemUseState,
  itemRole(item) {
    if (item.type === "weapon") return "weapon";
    if (item.type === "spell") return "spell";
    return "other";
  },
  combatItems(actor, category, options = {}) {
    if (category === "features")
      return actor.items.filter(
        item => item.type === "feat" && !item.flags?.dnd5e?.cachedFor
      );
    if (category === "weapons") {
      return actor.items.filter(item => item.type === "weapon");
    }
    if (category === "spells") {
      return actor.items.filter(
        item => item.type === "spell" && !item.flags?.dnd5e?.cachedFor
      );
    }
    return actor.items.filter(item =>
      combatItemCategories(item, options).has(category)
    );
  },
  combatItemsByCategory(actor, categoryNames, options = {}) {
    const categories = new Map(categoryNames.map(category => [category, []]));
    const includesActions = categoryNames.some(
      category => category !== "weapons" && category !== "spells"
    );
    for (const item of actor.items.values()) {
      if (!includesActions) {
        if (item.type === "weapon") categories.get("weapons")?.push(item);
        if (item.type === "spell" && !item.flags?.dnd5e?.cachedFor)
          categories.get("spells")?.push(item);
        continue;
      }
      for (const category of combatItemCategories(item, options)) {
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
    return item.update({
      "system.prepared":
        CONFIG.DND5E.spellPreparationStates[
          prepared.prepared ? "unprepared" : "prepared"
        ].value
    });
  },
  itemAttackBonus(item, activityId = null) {
    const activity = activityId
      ? itemActivities(item).find(a => a.id === activityId)
      : itemActivities(item).find(a => a.type === "attack");
    return (
      activity?.labels?.toHit ??
      (!activityId ? (item.labels?.toHit ?? item.labels?.modifier) : "") ??
      ""
    );
  },
  itemSaveDc(item, activityId = null) {
    const activity = activityId
      ? itemActivities(item).find(a => a.id === activityId)
      : itemActivities(item).find(a => a.type === "save");
    return activity?.save?.dc?.value ?? "";
  },
  itemDamageFormula(_actor, item, activityId = null) {
    const activity = activityId
      ? itemActivities(item).find(a => a.id === activityId)
      : itemActivities(item).find(a => a.labels?.damages?.length);
    const damages =
      activity?.labels?.damages ?? (!activityId ? item.labels?.damages : null);
    return (damages ?? [])
      .map(d => d.formula)
      .filter(Boolean)
      .join(" + ");
  }
};
