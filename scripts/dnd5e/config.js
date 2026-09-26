import { skillIcons } from "./constants.js";
import { proficiencyMultiplier } from "./actor-data.js";
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
  async statusDescriptions(actor) {
    const effects =
      typeof actor.allApplicableEffects === "function"
        ? [...actor.allApplicableEffects()]
        : [...(actor.effects ?? [])];
    const result = new Map();
    const activeEffects = effects.filter(
      effect => !effect.disabled && !effect.isSuppressed
    );
    const statuses = new Map(
      this.statusDefinitions()
        .filter(status => actor.statuses?.has(status.id))
        .map(status => [status.id, status])
    );
    for (const effect of activeEffects) {
      for (const id of effect.statuses ?? []) {
        if (!statuses.has(id)) statuses.set(id, { id });
      }
    }
    for (const status of statuses.values()) {
      const effect = effects.find(
        effect =>
          !effect.disabled &&
          !effect.isSuppressed &&
          effect.statuses?.has?.(status.id)
      );
      const description =
        effect?.description ||
        (status.reference
          ? `@Embed[${status.reference} inline]`
          : status.description);
      if (!description) continue;
      const editor = foundry.applications.ux.TextEditor.implementation;
      try {
        result.set(
          status.id,
          await editor.enrichHTML(description, {
            relativeTo: effect ?? actor,
            secrets: actor.isOwner
          })
        );
      } catch (error) {
        console.warn("Adventurer HUD | status description", error);
      }
    }
    return result;
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
