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
    return proficiencyMultiplier(data.save?.prof ?? data.saveProf);
  },
  skillProficiency: (actor, id) =>
    proficiencyMultiplier(actor.system.skills?.[id]?.prof),
  skillData: (actor, id) => actor.system.skills?.[id] ?? {},
  isActorSupported: actor => actor?.type === "character",
  deathData: actorDeathData,
  classSummary(actor, { formatLevel }) {
    const classes = actor.items
      .filter(item => item.type === "class")
      .map(item => {
        const level = Number(item.system?.levels ?? item.system?.level ?? 0);
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
      speed: movement.walk ?? movement.fly ?? "—",
      speedUnits: movement.units ?? "",
      proficiencyBonus: actor.system.attributes.prof ?? "—"
    };
  },
  updateHp(actor, { value, temp }) {
    return actor.update({
      "system.attributes.hp.value": value,
      "system.attributes.hp.temp": temp
    });
  },
  abilityModifier: (actor, id) => Number(actor.system.abilities?.[id]?.mod ?? 0)
};
