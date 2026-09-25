const adapters = new Map();
const definedAdapters = new WeakSet();

const CAPABILITY_DEFAULTS = Object.freeze({
  activityChoice: false,
  abilityChecks: false,
  actions: false,
  bonusActions: false,
  combat: false,
  conditions: false,
  deathSaves: false,
  inspiration: false,
  inventory: false,
  reactions: false,
  resources: false,
  rests: false,
  savingThrows: false,
  skills: false,
  specialActions: false,
  spells: false,
  tools: false,
  weapons: false
});

const REQUIRED_BY_CAPABILITY = Object.freeze({
  activityChoice: ["itemActivities", "useActivity"],
  abilityChecks: ["abilityDefinitions", "abilityData", "rollAbility"],
  actions: ["combatItems", "useItem"],
  bonusActions: ["combatItems", "useItem"],
  combat: ["combatStats", "updateHp", "rollInitiative"],
  conditions: ["statusDefinitions", "statusKind"],
  deathSaves: ["deathData", "rollDeathSave"],
  inspiration: ["inspiration", "toggleInspiration"],
  inventory: ["inventoryCategory", "itemUsesData", "useItem"],
  resources: [
    "actorResources",
    "featureResources",
    "resourceData",
    "updateResource"
  ],
  rests: ["shortRest", "longRest"],
  reactions: ["combatItems", "useItem"],
  savingThrows: ["abilityDefinitions", "abilityData", "rollAbility"],
  skills: ["skillDefinitions", "skillData", "rollSkill"],
  spells: ["combatItems", "spellLevel", "spellSlots", "useItem"],
  specialActions: ["combatItems", "useItem"],
  tools: ["getTools", "rollTool"],
  weapons: ["combatItems", "useItem"]
});

const unsupported = action => {
  throw new Error(`The active system adapter does not support ${action}.`);
};

const ADAPTER_DEFAULTS = Object.freeze({
  abilityData: () => ({}),
  abilityDefinitions: () => [],
  abilityTotal: data => Number(data?.mod ?? 0) || 0,
  actorResources: () => [],
  classSummary: () => "",
  combatItems: () => [],
  combatStats: () => ({
    ac: "—",
    hp: { value: 0, max: 0, temp: 0, tempmax: 0 },
    speed: "—",
    speedUnits: ""
  }),
  deathData: () => ({
    dead: false,
    failure: 0,
    hp: 1,
    stable: false,
    success: 0
  }),
  featureResources: () => [],
  getTools: async () => [],
  hasItemProperty: () => false,
  inspiration: () => false,
  inventoryCategory: () => null,
  isActorSupported: actor => Boolean(actor),
  isPreparedSpell: () => true,
  itemActivation: () => "",
  itemActivities: () => [],
  itemAttackBonus: () => "",
  itemDamageFormula: () => "",
  itemRangeData: () => ({
    value: "",
    long: "",
    units: "",
    special: ""
  }),
  itemResourceCost: () => "",
  itemRole: () => "other",
  itemSaveDc: () => "",
  itemUsesData: () => null,
  longRest: () => unsupported("long rests"),
  proficiencyMultiplier: value => Number(value ?? 0) || 0,
  rangeUnitLabel: units => units,
  resourceData: () => ({ actorResource: null, current: 0, max: 0 }),
  rollAbility: () => unsupported("ability rolls"),
  rollDeathSave: () => unsupported("death saving throws"),
  rollInitiative: () => unsupported("initiative rolls"),
  rollSkill: () => unsupported("skill rolls"),
  rollTool: () => unsupported("tool rolls"),
  saveProficiency: () => 0,
  shortRest: () => unsupported("short rests"),
  skillData: () => ({}),
  skillDefinitions: () => [],
  skillProficiency: () => 0,
  spellLevel: () => 0,
  spellPreparation: () => null,
  spellSlotKind: () => "standard",
  spellSlots: () => [],
  statusDefinitions: () => [],
  statusKind: () => null,
  toggleSpellPreparation: () => unsupported("spell preparation"),
  updateSpellSlots: () => unsupported("spell slot updates"),
  toggleInspiration: () => unsupported("inspiration"),
  updateHp: () => unsupported("HP updates"),
  updateResource: () => unsupported("resource updates"),
  useItem: () => unsupported("item use"),
  useActivity: () => unsupported("activity use")
});

export function defineSystemAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("A system adapter object is required.");
  }
  if (definedAdapters.has(adapter)) return adapter;

  const id = String(adapter.id ?? "").trim();
  if (!id) {
    throw new TypeError("A system adapter must define a system id.");
  }

  if (
    adapter.actorTypes != null &&
    (!Array.isArray(adapter.actorTypes) ||
      !adapter.actorTypes.every(type => typeof type === "string" && type))
  ) {
    throw new TypeError("System adapter actorTypes must be an array of ids.");
  }
  if (
    adapter.capabilities != null &&
    (typeof adapter.capabilities !== "object" ||
      Object.values(adapter.capabilities).some(
        value => typeof value !== "boolean"
      ))
  ) {
    throw new TypeError("System adapter capabilities must be booleans.");
  }

  for (const key of Object.keys(ADAPTER_DEFAULTS)) {
    if (Object.hasOwn(adapter, key) && typeof adapter[key] !== "function") {
      throw new TypeError(`System adapter method "${key}" must be a function.`);
    }
  }
  for (const [capability, methods] of Object.entries(REQUIRED_BY_CAPABILITY)) {
    if (!adapter.capabilities?.[capability]) continue;
    const missing = methods.filter(method => !Object.hasOwn(adapter, method));
    if (missing.length) {
      throw new TypeError(
        `System adapter "${id}" enables "${capability}" but does not define: ${missing.join(", ")}.`
      );
    }
  }

  const actorTypes = Object.freeze([...(adapter.actorTypes ?? [])]);
  const normalized = Object.freeze({
    ...ADAPTER_DEFAULTS,
    ...adapter,
    id,
    actorTypes,
    isActorSupported:
      adapter.isActorSupported ??
      (actor =>
        Boolean(actor) &&
        (!actorTypes.length || actorTypes.includes(actor.type))),
    capabilities: Object.freeze({
      ...CAPABILITY_DEFAULTS,
      ...(adapter.capabilities ?? {})
    })
  });
  definedAdapters.add(normalized);
  return normalized;
}

export function registerSystemAdapter(adapter, { replace = false } = {}) {
  const normalized = defineSystemAdapter(adapter);

  if (adapters.has(normalized.id) && !replace) {
    throw new Error(
      `A system adapter for "${normalized.id}" is already registered.`
    );
  }

  adapters.set(normalized.id, normalized);
  return normalized;
}

export const getSystemAdapter = id => adapters.get(id) ?? null;

export const listSystemAdapters = () => [...adapters.keys()];
