import { itemCollection } from "./rendering.mjs";

export const SC = "sc-venaerys-initiative";
export const plan = () =>
  ["fast", "enemies", "slow"].map(id => ({
    id,
    type: id,
    name: id,
    nameKey: null,
    icon: "fa-solid fa-bolt",
    color: "#112233"
  }));

export function installSc({ formula = false } = {}) {
  let opened = 0;
  const get = game.settings.get;
  game.settings.get = (module, key) =>
    module === SC && key === "rollSource"
      ? formula
        ? "formula"
        : "system"
      : get(module, key);
  game.modules ??= new Map();
  game.modules.set(SC, {
    active: true,
    version: "1.0.3",
    api: { open: () => ++opened }
  });
  return () => opened;
}

export function configureCombat(
  combat,
  entries,
  { split = "off", round = 2 } = {}
) {
  Object.assign(combat, {
    id: "phased",
    documentName: "Combat",
    round,
    turn: 1,
    started: true,
    turns: entries,
    combatant: entries[1],
    flags: { [SC]: { enabled: true, plan: plan(), split, actionsHalf: null } }
  });
  combat.combatants = itemCollection(entries);
  const writes = [];
  for (const [index, entry] of entries.entries()) {
    Object.assign(entry, {
      documentName: "Combatant",
      visible: true,
      parent: combat,
      isOwner: true,
      flags: {
        [SC]: {
          side: index < 2 ? "players" : "enemies",
          phase: index < 2 ? "fast" : "enemies",
          done: null,
          moved: null
        }
      }
    });
    entry.update = async (data, options) => {
      writes.push([entry.id, data, options]);
      const changes = {};
      for (const [key, value] of Object.entries(data)) {
        const field = key.split(".").at(-1);
        entry.flags[SC][field] = value;
        changes[field] = value;
      }
      Hooks.callAll(
        "updateCombatant",
        entry,
        { flags: { [SC]: changes } },
        options
      );
      return entry;
    };
  }
  return writes;
}
