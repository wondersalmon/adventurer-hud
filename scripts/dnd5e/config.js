import { skillIcons } from "./constants.js";
import { proficiencyMultiplier } from "./actor-data.js";
export const dnd5eConfig = {
  abilityLabel(id) {
    const config = CONFIG.DND5E.abilities?.[id];
    return game.i18n.localize(config?.label ?? config ?? id);
  },
  activationTypeLabel(type) {
    const config =
      CONFIG.DND5E.activityActivationTypes?.[type] ??
      CONFIG.DND5E.abilityActivationTypes?.[type];
    const label = config?.header ?? config?.label ?? config;
    return typeof label === "string" ? game.i18n.localize(label) : "";
  },
  skillDefinitions({ localize }) {
    return Object.entries(CONFIG.DND5E.skills ?? {})
      .map(([id, config]) => [
        id,
        localize(config.label ?? id),
        skillIcons[id] ?? "fa-dice-d20"
      ])
      .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));
  },

  async getTools(actor, { localize }) {
    const tools = await Promise.all(
      Object.entries(actor.system.tools ?? {}).map(async ([id, data]) => {
        const proficiency = proficiencyMultiplier(data.prof);
        if (proficiency <= 0) return null;
        const config = CONFIG.DND5E.tools[id] ?? {};
        const owned = actor.items.find(
          item => item.type === "tool" && item.system.type?.baseItem === id
        );
        const document =
          owned ??
          (config.id
            ? await game.dnd5e.documents.Trait.getBaseItem(config.id, {
                fullItem: true
              })
            : null);
        return {
          id,
          name: document?.name ?? localize(config.label ?? id),
          img: document?.img ?? "icons/svg/item-bag.svg",
          proficiency,
          ability: data.ability,
          isMusic: document?.system?.type?.value === "music"
        };
      })
    );
    return tools
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(a.isMusic) - Number(b.isMusic) ||
          a.name.localeCompare(b.name, game.i18n.lang)
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
    const ruleKeys = {
      dodging: "dodge",
      hiding: "hide",
      coverHalf: "halfcover",
      coverThreeQuarters: "threequarterscover",
      coverTotal: "totalcover",
      stable: "stabilizing"
    };
    return definitions
      .filter(status => status?.id)
      .map(status => {
        const reference =
          status.reference ??
          CONFIG.DND5E?.rules?.[ruleKeys[status.id] ?? status.id];
        return reference ? { ...status, reference } : status;
      });
  },
  statusKind(status) {
    if (["concentrating", "concentration"].includes(status.id))
      return "concentrating";
    if (status.id === "bloodied") return "bloodied";
    return null;
  }
};
