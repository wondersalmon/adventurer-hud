import {
  recordDiagnostic,
  diagnosticRef,
  diagnosticsRecording
} from "../../diagnostics.js";
import { itemAvailability, matchesItemSearch } from "./quick-access.js";

export function createItemCategories({
  actor,
  adapter,
  hudState,
  skills = [],
  t,
  visibility
}) {
  let lastGroups = null;
  const featureItems = items =>
    items.filter(item => {
      const active = adapter
        .itemActivities(item)
        .some(activity => Boolean(activity.activation?.type));
      return hudState.showPassiveFeatures ? !active : active;
    });

  const combatItems = category =>
    adapter.combatItems(actor, category, { groupOtherActions: !visibility.gm });

  const searchItems = items =>
    (visibility.search
      ? items.filter(item =>
          matchesItemSearch(adapter, item, hudState.searchQuery)
        )
      : [...items]
    )
      .map(item => ({
        item,
        unavailable: Number(
          Boolean(itemAvailability(adapter, actor, item).reason)
        )
      }))
      .sort((left, right) => left.unavailable - right.unavailable)
      .map(entry => entry.item);

  const isOnlyGmSpecial = item => {
    const activities = adapter.itemActivities(item);
    return (
      activities.length > 0 &&
      activities.every(activity =>
        ["legendary", "lair"].includes(activity.activation?.type)
      )
    );
  };

  const combatCategories = () => {
    const actionTypesOnly = visibility.gm && visibility.actionTypesOnly;
    const showActionTypes = actionTypesOnly || visibility.showActionTypes;
    const visible = [
      ["weapons", "fa-swords", "Combat.Weapons", !actionTypesOnly],
      ["spells", "fa-wand-magic-sparkles", "Combat.Spells", !actionTypesOnly],
      ["action", "fa-circle-play", "Combat.Action", showActionTypes],
      ["bonus", "fa-bolt", "Combat.BonusAction", showActionTypes],
      ["reaction", "fa-shield", "Combat.Reaction", showActionTypes],
      ["special", "fa-star", "Combat.Special", showActionTypes]
    ].filter(([, , , enabled]) => enabled);
    const known = new Set(["action", "bonus", "reaction", "special"]);
    const extraTypes = [
      ...(visibility.gm ? (adapter.combatActionTypes?.(actor) ?? []) : [])
    ].sort(
      (left, right) =>
        Number(!["epic", "villain"].includes(left)) -
        Number(!["epic", "villain"].includes(right))
    );
    for (const type of extraTypes) {
      if (
        known.has(type) ||
        (visibility.gm && ["legendary", "lair"].includes(type))
      )
        continue;
      known.add(type);
      // Prefix avoids collisions between third-party activation IDs and item tabs.
      visible.push([`activation:${type}`, "fa-star", type, showActionTypes]);
    }
    visible.push(["features", "fa-bolt-lightning", "Combat.Features", true]);
    const enabled = visible.filter(([, , , show]) => show !== false);
    if (!enabled.length) return [];
    const indexed = adapter.combatItemsByCategory?.(
      actor,
      enabled.map(([category]) => category),
      { groupOtherActions: !visibility.gm }
    );
    const categories = enabled
      .map(([category, icon, label]) => [
        category,
        icon,
        label,
        (indexed
          ? (indexed.get(category) ?? [])
          : combatItems(category)
        ).filter(
          item =>
            !visibility.gm ||
            category === "features" ||
            category === "spells" ||
            ((item.type !== "spell" || actionTypesOnly) &&
              !isOnlyGmSpecial(item))
        )
      ])
      .filter(([, , , items]) => items.length > 0);
    if (visibility.combatSkills && skills.length) {
      categories.push(["skills", "fa-list-check", "Labels.Skills", skills]);
    }
    const groups = categories.map(([category, , , items]) => ({
      category,
      count: items.length
    }));
    const signature = JSON.stringify(groups);
    if (signature !== lastGroups || diagnosticsRecording()) {
      recordDiagnostic(
        "hud.cards.groups",
        {
          actor: diagnosticRef(actor, "actor"),
          groups,
          searchActive: Boolean(hudState.searchQuery),
          preparedOnly: hudState.preparedSpellsOnly
        },
        { detailed: signature === lastGroups }
      );
      lastGroups = signature;
    }
    return categories;
  };

  const categoryLabel = (category, label) => {
    if (!category.startsWith("activation:")) return t(label);
    const native = adapter.activationTypeLabel?.(label);
    return (
      native ||
      (new Map([
        ["epic", t("Combat.EpicActions")],
        ["villain", t("Combat.VillainActions")],
        ["turnStart", t("Combat.TurnStart")],
        ["turnEnd", t("Combat.TurnEnd")]
      ]).get(label) ??
        label)
    );
  };

  return {
    featureItems,
    combatItems,
    searchItems,
    combatCategories,
    categoryLabel
  };
}
