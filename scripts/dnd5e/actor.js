import { abilities } from "./constants.js";
import {
  abilityTotal,
  actorDeathData,
  proficiencyMultiplier
} from "./actor-data.js";

/** Resolve native encounter members, including quantity formulas and world imports. */
export async function encounterActors(actor) {
  if (
    !game.user?.isGM ||
    actor.type !== "encounter" ||
    !actor.isOwner ||
    !actor.system?.getPlaceableMembers
  )
    return [];
  const members = await actor.system.getPlaceableMembers();
  if (!actor.isOwner) return [];
  return members.flatMap(member => {
    const quantity = member.quantity?.value ?? 1;
    if (
      member.actor?.type !== "npc" ||
      !member.actor.isOwner ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    )
      return [];
    return Array(quantity).fill(member.actor);
  });
}

export const dnd5eActor = {
  encounterActors,
  armorClassAttribution: actor => actor.getAttributionData?.("attributes.ac"),
  initiativeBonus: actor => {
    const total = actor.system.attributes?.init?.total;
    return Number.isFinite(total) ? total : null;
  },
  armorClassDetails(actor) {
    const ac = actor.system.attributes?.ac ?? {};
    let formula;
    if (Number.isFinite(ac.override)) formula = String(ac.override);
    else {
      const base = ac.formula?.trim();
      if (base) {
        const data =
          actor.getRollData?.({ deterministic: true }) ?? actor.system;
        formula =
          globalThis.Roll?.replaceFormulaData?.(base, data, { missing: "?" }) ??
          base;
      } else if (Number.isFinite(ac.base ?? ac.flat))
        formula = String(ac.base ?? ac.flat);
      else return null;
      for (const key of ["shield", "bonus", "cover"]) {
        const value = ac[key];
        if (Number.isFinite(value) && value !== 0)
          formula += value < 0 ? ` - ${Math.abs(value)}` : ` + ${value}`;
      }
      if (Number.isFinite(ac.min) && ac.min > 0)
        formula = `max(${ac.min}, (${formula}))`;
    }
    return {
      label: ac.label ? game.i18n.localize(ac.label) : "",
      formula,
      value: ac.value ?? "—"
    };
  },
  openInventorySheet: actor =>
    actor.sheet?.render({ force: true, tab: "inventory" }),
  concentrationSummary(actor) {
    const concentration = actor.concentration;
    return {
      count: concentration?.effects?.size ?? 0,
      names: [
        ...new Set(
          [...(concentration?.items ?? [])]
            .map(item => item.name)
            .filter(Boolean)
        )
      ]
    };
  },
  removeStatus(actor, id) {
    const concentration = actor.concentration?.effects;
    if (
      this.statusKind({ id }) === "concentrating" &&
      concentration?.size &&
      typeof actor.endConcentration === "function"
    )
      return actor.endConcentration();
    if (this.statusDefinitions().some(status => status.id === id))
      return actor.toggleStatusEffect(id, { active: false });
    // Only delete effects embedded directly in this actor, never transferred item definitions.
    const effect = [...(actor.effects ?? [])].find(
      effect =>
        id === `effect:${effect.uuid ?? effect.id}` ||
        effect.statuses?.has?.(id)
    );
    if (
      effect &&
      !effect.disabled &&
      !effect.isSuppressed &&
      effect.isOwner !== false
    ) {
      if (
        concentration?.has(effect) &&
        typeof actor.endConcentration === "function"
      )
        return actor.endConcentration(effect);
      return effect.delete();
    }
  },
  abilityDefinitions: () => abilities,
  abilityData: (actor, id) => actor.system.abilities?.[id] ?? {},
  abilityTotal,
  proficiencyMultiplier,
  saveProficiency(actor, id) {
    const data = this.abilityData(actor, id);
    // D&D 5.3 uses saveProf; D&D 6 stores the prepared proficiency in save.prof.
    return proficiencyMultiplier(data.save?.prof ?? data.saveProf);
  },
  skillProficiency: (actor, id) =>
    proficiencyMultiplier(actor.system.skills?.[id]?.prof),
  skillData: (actor, id) => actor.system.skills?.[id] ?? {},
  isActorSupported: (actor, { gm = false } = {}) =>
    actor?.type === "character" || (gm && actor?.type === "npc"),
  deathData: actorDeathData,
  classSummary(actor, { formatLevel, showLevels = true, showClasses = true }) {
    const classItems = actor.items.filter(item => item.type === "class");
    const classes = classItems.map(item => {
      const level = Number(item.system?.levels ?? 0);
      return `${item.name}${showLevels && level > 0 ? ` ${level}` : ""}`;
    });
    if (showClasses && classes.length) return classes.join(" / ");
    if (!showLevels) return "";

    const level =
      Number(actor.system.details?.level ?? 0) ||
      classItems.reduce(
        (total, item) => total + Number(item.system?.levels ?? 0),
        0
      );
    return level > 0 ? formatLevel(level) : "";
  },
  inspiration: actor => Boolean(actor.system.attributes?.inspiration),
  toggleInspiration: actor =>
    actor.update({
      "system.attributes.inspiration": !actor.system.attributes?.inspiration
    }),
  shortRest: actor => actor.shortRest(),
  longRest: actor => actor.longRest(),
  combatStats(actor) {
    const hp = actor.system.attributes.hp ?? {};
    const movement = actor.system.attributes.movement ?? {};
    return {
      ac: actor.system.attributes.ac?.value ?? "—",
      hp: {
        value: Number(hp.value ?? 0),
        max: Number(hp.max ?? 0),
        temp: Number(hp.temp ?? 0),
        tempmax: Number(hp.tempmax ?? 0)
      },
      speed: movement.speed ?? movement.speeds?.walk ?? "—",
      speedUnits: movement.units ?? "",
      proficiencyBonus: actor.system.attributes.prof ?? "—"
    };
  },
  inventorySummary(actor) {
    const encumbrance = actor.system.attributes?.encumbrance ?? {};
    const number = value => {
      if (value == null || value === "") return null;
      const result = Number(value);
      return Number.isFinite(result) && result >= 0 ? result : null;
    };
    const unitSystem = game.settings.get("dnd5e", "metricWeightUnits")
      ? "metric"
      : "imperial";
    const config = CONFIG.DND5E.encumbrance?.baseUnits;
    const units =
      (config?.[actor.type] ?? config?.default)?.[unitSystem] ??
      (unitSystem === "metric" ? "kg" : "lb");
    const weight = number(encumbrance.value);
    const capacity = encumbrance.thresholds?.maximum ?? encumbrance.max;
    const maxWeight = capacity === Infinity ? Infinity : number(capacity);
    const variant = game.settings.get("dnd5e", "encumbrance") === "variant";
    const exceeds = threshold =>
      weight != null && threshold != null && weight > threshold;
    const loadState = exceeds(maxWeight)
      ? "overloaded"
      : variant && exceeds(encumbrance.thresholds?.heavilyEncumbered)
        ? "heavy"
        : (variant && exceeds(encumbrance.thresholds?.encumbered)) ||
            encumbrance.encumbered
          ? "encumbered"
          : weight == null || maxWeight == null
            ? "unknown"
            : "normal";
    return {
      weight,
      maxWeight,
      loadState,
      units: game.i18n.localize(
        CONFIG.DND5E.weightUnits?.[units]?.abbreviation ?? units
      ),
      coins: ["pp", "gp", "ep", "sp", "cp"]
        .map(type => ({
          type,
          value: number(actor.system.currency?.[type]) ?? 0
        }))
        .filter(coin => coin.value > 0)
    };
  },
  async updateHp(actor, { value, temp, damage }) {
    if (damage !== undefined) {
      if (temp !== Number(actor.system.attributes.hp.temp ?? 0))
        await actor.update({ "system.attributes.hp.temp": temp });
      if (damage !== 0) return actor.applyDamage(damage);
      return;
    }
    return actor.update({
      "system.attributes.hp.value": value,
      "system.attributes.hp.temp": temp
    });
  },
  abilityModifier: (actor, id) => Number(actor.system.abilities?.[id]?.mod ?? 0)
};
