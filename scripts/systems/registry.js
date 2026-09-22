const adapters = new Map();

const CAPABILITY_DEFAULTS = Object.freeze({
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

const unsupported = action => {
  throw new Error(`The active system adapter does not support ${action}.`);
};

const ADAPTER_DEFAULTS = Object.freeze({
  abilityData: () => ({}),
  abilityDefinitions: () => [],
  abilityTotal: data => Number(data?.mod ?? 0) || 0,
  activationLabel: type => type,
  actorResources: () => [],
  classSummary: () => "",
  combatItems: () => [],
  combatStats: () => ({
    ac: "—",
    hp: { value: 0, max: 0, temp: 0, tempmax: 0 },
    speed: "—",
    speedUnits: ""
  }),
  deathData: () => ({ failure: 0, hp: 1, success: 0 }),
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
  spellSlots: () => [],
  toggleInspiration: () => unsupported("inspiration"),
  updateHp: () => unsupported("HP updates"),
  updateResource: () => unsupported("resource updates"),
  useItem: () => unsupported("item use")
});

export function defineSystemAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("A system adapter object is required.");
  }

  const id = String(adapter.id ?? "").trim();
  if (!id) {
    throw new TypeError("A system adapter must define a system id.");
  }

  return Object.freeze({
    ...ADAPTER_DEFAULTS,
    ...adapter,
    id,
    actorTypes: Object.freeze([...(adapter.actorTypes ?? [])]),
    capabilities: Object.freeze({
      ...CAPABILITY_DEFAULTS,
      ...(adapter.capabilities ?? {})
    })
  });
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

export const hasSystemAdapter = id => adapters.has(id);

export const listSystemAdapters = () => [...adapters.keys()];
