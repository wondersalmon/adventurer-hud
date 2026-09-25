import { gaming, musical, skillIcons } from "./constants.js";
import { proficiencyMultiplier } from "./actor-data.js";
const toolIcon = (id, isMusic) => {
  if (isMusic) return "fa-music";
  if (gaming.has(id)) return "fa-dice";

  return (
    {
      thief: "fa-key",
      herb: "fa-leaf",
      disg: "fa-masks-theater",
      forg: "fa-file-signature",
      navg: "fa-compass",
      pois: "fa-flask"
    }[id] ?? "fa-screwdriver-wrench"
  );
};

export const dnd5eConfig = {
  skillDefinitions({ localize }) {
    return Object.entries(CONFIG.DND5E.skills ?? {})
      .map(([id, config]) => [
        id,
        localize(config.label ?? id),
        skillIcons[id] ?? "fa-dice-d20"
      ])
      .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));
  },

  async getTools(actor, { cache, localize, resolveUuid }) {
    const ownedNames = new Map(
      actor.items
        .filter(item => item.type === "tool")
        .map(item => [item.system?.type?.baseItem, item.name])
    );

    const toolName = async (id, config) => {
      if (ownedNames.has(id)) return ownedNames.get(id);
      if (config?.label) return localize(config.label);

      if (config?.id) {
        const cacheKey = `${game.i18n.lang}:${config.id}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        try {
          const document = await resolveUuid(config.id);
          if (document?.name) {
            cache.set(cacheKey, document.name);
            return document.name;
          }
        } catch (error) {
          console.warn(`Adventurer HUD | tool ${id}`, error);
        }
      }

      return id
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, character => character.toUpperCase());
    };

    const tools = await Promise.all(
      Object.entries(actor.system.tools ?? {}).map(async ([id, data]) => {
        const proficiency = proficiencyMultiplier(data);
        if (proficiency <= 0) return null;

        const config = CONFIG.DND5E.tools?.[id] ?? {};
        const isMusic = musical.has(id);
        return {
          id,
          name: await toolName(id, config),
          proficiency,
          ability: data?.ability ?? config.ability ?? "",
          isMusic,
          icon: toolIcon(id, isMusic)
        };
      })
    );

    return tools
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(a.isMusic) - Number(b.isMusic) || a.name.localeCompare(b.name)
      );
  },
  rangeUnitLabel(units, { localizeConfig }) {
    return (
      localizeConfig(
        CONFIG.DND5E.rangeTypes?.[units] ?? CONFIG.DND5E.movementUnits?.[units]
      ) || units
    );
  },
  statusDefinitions() {
    const statuses = CONFIG.statusEffects;
    const definitions = Array.isArray(statuses)
      ? statuses
      : typeof statuses?.values === "function"
        ? [...statuses.values()]
        : Object.values(statuses ?? {});
    return definitions.filter(status => status?.id);
  },
  statusKind(status) {
    if (["concentrating", "concentration"].includes(status.id))
      return "concentrating";
    if (status.id === "bloodied") return "bloodied";
    return null;
  }
};
