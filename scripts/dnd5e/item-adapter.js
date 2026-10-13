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
const damageActivity = (item, activityId) =>
  itemActivities(item).find(activity =>
    activityId ? activity.id === activityId : activity.labels?.damages?.length
  );

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

const spellSourceId = item =>
  item.system?.classIdentifier
    ? `class:${item.system.classIdentifier}`
    : item.system?.sourceItem
      ? `item:${item.system.sourceItem}`
      : "other";

export const dnd5eItems = {
  spellSourceId,
  spellSources(actor) {
    const sources = new Map();
    for (const item of actor.items?.values?.() ?? []) {
      if (item.type !== "spell" || item.flags?.dnd5e?.cachedFor) continue;
      const id = spellSourceId(item);
      if (sources.has(id)) continue;
      const source = item.system.classIdentifier
        ? actor.classes?.[item.system.classIdentifier]
        : actor.identifiedItems?.get?.(item.system.sourceItem)?.first?.();
      sources.set(id, {
        source: id,
        name:
          source?.name ??
          (id === "other"
            ? null
            : (item.system.sourceItem ?? item.system.classIdentifier))
      });
    }
    return [...sources.values()];
  },
  weaponMastery(actor, item) {
    const id = item.system?.mastery;
    if (item.type !== "weapon" || !id) return null;
    const options = item.system.masteryOptions;
    const known = actor.system.traits?.weaponProf?.mastery?.value;
    const available =
      options !== undefined
        ? Boolean(options?.some(option => option.value === id))
        : Boolean(known?.has?.(item.system.type?.baseItem));
    return {
      label: game.i18n.localize(
        globalThis.CONFIG?.DND5E?.weaponMasteries?.[id]?.label ?? id
      ),
      available
    };
  },
  featureSource(
    item,
    { t = key => game.i18n.localize(`ADVENTURER_HUD.${key}`) } = {}
  ) {
    const origin =
      item.flags?.dnd5e?.advancementRoot ??
      item.flags?.dnd5e?.advancementOrigin;
    let source = item.parent?.items?.get(origin?.split(".")[0]);
    if (source?.type === "subclass") source = source.class ?? source;
    if (source?.type === "class" || source?.type === "subclass")
      return {
        id: `class:${source.id}`,
        label: `${t("Features.Class")}: ${source.name}`
      };
    const type =
      source?.type === "race" || source?.type === "background"
        ? source.type
        : item.system?.type?.value;
    if (type === "race") {
      const species =
        source?.type === "race"
          ? source
          : item.parent?.items?.find?.(entry => entry.type === "race");
      if (species?.name)
        return {
          id: "race",
          label: `${t("Features.Species")}: ${species.name}`
        };
    }
    const label = globalThis.CONFIG?.DND5E?.featureTypes?.[type]?.label;
    return {
      id: type || "other",
      label: label ? game.i18n.localize(label) : null
    };
  },
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
  inventoryInfo(item) {
    const quantity = item.system?.quantity;
    const attunement = item.system?.attunement;
    return {
      quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : null,
      attunement: ["required", "optional"].includes(attunement)
        ? attunement
        : null,
      attuned: item.system?.attuned === true
    };
  },
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
  itemDamageTypes(item, activityId = null) {
    const selected = damageActivity(item, activityId);
    const activities = selected ? [selected] : [];
    const types = new Set([
      ...activities.flatMap(activity =>
        (activity.labels?.damages ?? [])
          .map(damage => damage.damageType)
          .filter(Boolean)
      ),
      ...(!activityId && !selected
        ? (item.labels?.damages ?? [])
            .map(damage => damage.damageType)
            .filter(Boolean)
        : []),
      ...activities.flatMap(activity =>
        [...(activity.damage?.parts ?? [])].flatMap(part => [
          ...(part.types ?? [])
        ])
      )
    ]);
    return [...types].map(type =>
      game.i18n.localize(
        CONFIG.DND5E.damageTypes?.[type]?.label ??
          CONFIG.DND5E.healingTypes?.[type]?.label ??
          type
      )
    );
  },
  spellPreparationLimits(actor, { includeSources = false } = {}) {
    const items = [...(actor.items?.values?.() ?? [])];
    const limits = items
      .filter(item => ["class", "subclass"].includes(item.type))
      .flatMap(item => {
        const preparation = item.system.spellcasting?.preparation;
        return preparation?.formula?.trim() &&
          Number.isFinite(preparation.max) &&
          Number.isFinite(preparation.value)
          ? [
              {
                ...(includeSources
                  ? {
                      source: `class:${item.type === "subclass" ? (item.system.classIdentifier ?? item.identifier ?? item.id) : (item.identifier ?? item.system.identifier ?? item.id)}`
                    }
                  : {}),
                name: item.name,
                value: preparation.value,
                max: preparation.max
              }
            ]
          : [];
      });
    return limits;
  },
  spellComponents(item) {
    return ["vocal", "somatic", "material"]
      .filter(key => hasItemProperty(item, key))
      .map(key => ({
        key,
        label: game.i18n.localize(
          CONFIG.DND5E.itemProperties[key]?.label ?? key
        ),
        abbreviation:
          CONFIG.DND5E.itemProperties[key]?.abbreviation ?? key[0].toUpperCase()
      }));
  },
  itemDamageFormula(_actor, item, activityId = null) {
    const activity = damageActivity(item, activityId);
    const damages =
      activity?.labels?.damages ?? (!activityId ? item.labels?.damages : null);
    return (damages ?? [])
      .map(d => d.formula)
      .filter(Boolean)
      .join(" + ");
  }
};
