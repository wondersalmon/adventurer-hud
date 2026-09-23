import { abilities, gaming, musical, skillIcons } from "../dnd5e/constants.js";
import {
  abilityTotal,
  actorDeathData,
  proficiencyMultiplier
} from "../dnd5e/actor-data.js";
import {
  damagePartFormula,
  hasItemProperty,
  inventoryCategory,
  isPreparedSpell,
  itemActivation,
  itemActivities,
  itemRangeData,
  itemUsesData
} from "../dnd5e/items.js";

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

const resourceData = (actor, { item = null, resourceId = null } = {}) => {
  const actorResource = resourceId
    ? actor.system.resources?.[resourceId]
    : null;
  const uses = item?.system?.uses ?? actorResource ?? {};
  const max = Number(uses.max ?? 0);
  const current = ![undefined, null, ""].includes(uses.value)
    ? Number(uses.value) || 0
    : Math.max(0, max - Number(uses.spent ?? 0));

  return { actorResource, current, max };
};

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

export const dnd5eAdapter = {
  id: "dnd5e",
  actorTypes: Object.freeze(["character"]),
  capabilities: Object.freeze({
    activityChoice: true,
    abilityChecks: true,
    actions: true,
    bonusActions: true,
    combat: true,
    conditions: true,
    deathSaves: true,
    inspiration: true,
    inventory: true,
    reactions: true,
    resources: true,
    rests: true,
    spells: true,
    specialActions: true,
    savingThrows: true,
    skills: true,
    tools: true,
    weapons: true
  }),

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
      speedUnits: movement.units ?? ""
    };
  },
  updateHp(actor, field, value) {
    return actor.update({ [`system.attributes.hp.${field}`]: value });
  },

  actorResources(actor) {
    return Object.entries(actor.system.resources ?? {})
      .map(([id, resource]) => ({
        id,
        label: resource?.label || id,
        value: Number(resource?.value ?? 0),
        max: Number(resource?.max ?? 0),
        itemId: null
      }))
      .filter(resource => resource.max > 0 || resource.value > 0);
  },
  featureResources(actor) {
    return actor.items
      .filter(item => item.type === "feat")
      .map(item => {
        const uses = itemUsesData(item);
        return uses
          ? {
              id: item.id,
              label: item.name,
              ...uses,
              itemId: item.id
            }
          : null;
      })
      .filter(Boolean);
  },
  resourceData,
  async updateResource(actor, { item, resourceId, value, max }) {
    const sourceUses = item?._source?.system?.uses ?? {};
    if (item && Object.hasOwn(sourceUses, "spent")) {
      return item.update({
        "system.uses.spent": Math.max(0, max - value)
      });
    }
    if (item) return item.update({ "system.uses.value": value });
    if (resourceId) {
      return actor.update({ [`system.resources.${resourceId}.value`]: value });
    }
    return null;
  },

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
    return actor.items.filter(item => {
      if (category === "weapons") return item.type === "weapon";
      if (category === "spells") return item.type === "spell";
      return (
        itemActivation(item) === category ||
        itemActivities(item).some(
          activity => activity?.activation?.type === category
        )
      );
    });
  },
  spellLevel: item => Number(item.system?.level ?? 0),
  itemResourceCost(actor, item, { fallbackLabel }) {
    const activityTarget = itemActivities(item)
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
  itemAttackBonus(item) {
    const activity = itemActivities(item).find(
      candidate => candidate?.type === "attack" || candidate?.attack
    );
    const value =
      activity?.labels?.toHit ??
      activity?.labels?.modifier ??
      item.labels?.toHit ??
      item.labels?.attack;
    if ([undefined, null, ""].includes(value)) return "";

    const label = String(value).trim();
    return /^\d/.test(label) ? `+${label}` : label;
  },
  itemDamageFormula(actor, item) {
    const activities = itemActivities(item);
    const activityParts = activities.flatMap(activity =>
      (activity?.damage?.parts ?? []).map(part => ({ activity, part }))
    );
    const legacyParts = item.system?.damage?.parts ?? [];
    const base = item.system?.damage?.base;
    const records = [
      ...activityParts,
      ...(base?.formula ? [{ activity: activities[0], part: base }] : []),
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

    if (item.type === "weapon" && unique.length && !includesAbilityModifier) {
      const activity = activities.find(candidate => candidate?.attack);
      const abilityId =
        activity?.ability ??
        item.system?.ability ??
        (item.system?.actionType?.startsWith("r") ? "dex" : "str");
      const modifier = Number(actor.system.abilities?.[abilityId]?.mod ?? 0);
      if (modifier) {
        unique[0] = `${unique[0]} ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;
      }
    }

    return unique.join(" + ");
  },
  activationLabel(type, { localizeConfig }) {
    return localizeConfig(
      CONFIG.DND5E.activityActivationTypes?.[type] ??
        CONFIG.DND5E.abilityActivationTypes?.[type] ??
        type
    );
  },
  rangeUnitLabel(units, { localizeConfig }) {
    return (
      localizeConfig(
        CONFIG.DND5E.rangeTypes?.[units] ?? CONFIG.DND5E.movementUnits?.[units]
      ) || units
    );
  },
  abilityModifier: (actor, id) =>
    Number(actor.system.abilities?.[id]?.mod ?? 0),
  spellSlots(actor, level) {
    const standard = actor.system.spells?.[`spell${level}`] ?? {};
    const pact = actor.system.spells?.pact ?? {};
    const pools = [];
    if (Number(standard.max ?? 0) > 0) {
      pools.push([Number(standard.value ?? 0), Number(standard.max)]);
    }
    if (Number(pact.level) === level && Number(pact.max ?? 0) > 0) {
      pools.push([Number(pact.value ?? 0), Number(pact.max)]);
    }
    return pools;
  },

  rollAbility: (actor, { type, key, event }) =>
    type === "save"
      ? actor.rollSavingThrow({ ability: key, event })
      : actor.rollAbilityCheck({ ability: key, event }),
  rollSkill: (actor, { key, event }) => actor.rollSkill({ skill: key, event }),
  rollTool: (actor, { key, event }) =>
    actor.rollToolCheck({ tool: key, event }),
  rollDeathSave: (actor, { event }) => actor.rollDeathSave({ event }),
  rollInitiative: (actor, { event }) =>
    actor.rollInitiative(
      { createCombatants: false },
      {
        advantage: Boolean(event?.altKey),
        disadvantage: Boolean(event?.ctrlKey),
        event
      }
    ),
  useItem: (item, { event }) => item.use({ event }),
  useActivity: (item, activityId, { event }) => {
    const activity =
      item.system.activities?.get?.(activityId) ??
      itemActivities(item).find(candidate => candidate.id === activityId);
    return activity?.canUse !== false ? activity?.use({ event }) : null;
  }
};
