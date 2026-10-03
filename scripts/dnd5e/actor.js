import { abilities } from "./constants.js";
import {
  abilityTotal,
  actorDeathData,
  proficiencyMultiplier
} from "./actor-data.js";

export const dnd5eActor = {
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
  classSummary(actor, { formatLevel }) {
    const classes = actor.items
      .filter(item => item.type === "class")
      .map(item => {
        const level = Number(item.system?.levels ?? 0);
        return `${item.name}${level > 0 ? ` ${level}` : ""}`;
      });
    if (classes.length) return classes.join(" / ");

    const level = Number(actor.system.details?.level ?? 0);
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
    return {
      weight: number(encumbrance.value),
      maxWeight:
        encumbrance.max === Infinity ? Infinity : number(encumbrance.max),
      units: game.i18n.localize(
        CONFIG.DND5E.weightUnits?.[units]?.abbreviation ?? units
      ),
      gold: number(actor.system.currency?.gp) ?? 0
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
