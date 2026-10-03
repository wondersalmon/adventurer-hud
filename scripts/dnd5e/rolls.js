import { beginDiagnostic, diagnosticRef } from "../diagnostics.js";
import { itemActivities } from "./items.js";
import { getCurrentCombat } from "../runtime-helpers.js";

const initiativeRolls = new WeakMap();

/** Roll an exact native Combatant without expanding a world Actor to all tokens.
 * @param {any} actor
 * @param {{combatant?: any, combat?: any, event?: import('../../types/hud.js').HudInputEvent | null}} options
 */
function rollInitiative(actor, { combatant, combat, event }) {
  const options = {
    ...(event?.altKey ? { advantage: true } : {}),
    ...(event?.ctrlKey ? { disadvantage: true } : {}),
    event
  };
  if (!combatant)
    return actor.rollInitiative({ createCombatants: false }, options);
  if (initiativeRolls.has(combatant)) return initiativeRolls.get(combatant);
  const task = rollExactInitiative(
    actor,
    combatant,
    combat ?? combatant.parent ?? getCurrentCombat(game),
    options
  );
  initiativeRolls.set(combatant, task);
  void task.finally(() => initiativeRolls.delete(combatant)).catch(() => {});
  return task;
}

async function rollExactInitiative(actor, combatant, combat, options) {
  const trace = beginDiagnostic("dnd5e.initiative", {
    actor: diagnosticRef(actor, "actor"),
    token: diagnosticRef(combatant.token, "token"),
    hasInitiative: combatant.initiative != null,
    alt: Boolean(options.event?.altKey),
    ctrl: Boolean(options.event?.ctrlKey),
    shift: Boolean(options.event?.shiftKey),
    requested: 1
  });
  try {
    const current =
      combat?.combatants?.get?.(combatant.id) ??
      [...(combat?.combatants?.values?.() ?? combat?.combatants ?? [])].find(
        entry => entry.id === combatant.id
      );
    const nativeActor = combatant.token?.actor ?? combatant.actor ?? actor;
    if (
      !actor.isOwner ||
      !nativeActor.isOwner ||
      combatant.isOwner === false ||
      current !== combatant ||
      combatant.initiative != null
    ) {
      trace.finish(
        "rejected",
        combatant.initiative != null
          ? "initiative-already-set"
          : "no-permission-or-combatant"
      );
      return null;
    }
    if (nativeActor !== actor && combatant.token?.baseActor !== actor)
      return null;
    trace.step("native-prepare", { exactToken: true });
    const roll = nativeActor.getInitiativeRoll(options);
    if (
      !roll ||
      Hooks.call?.("dnd5e.preRollInitiative", nativeActor, roll) === false
    ) {
      trace.finish("cancelled", "native-hook-cancelled");
      return null;
    }
    if (
      !actor.isOwner ||
      !nativeActor.isOwner ||
      combatant.isOwner === false ||
      combatant.initiative != null
    )
      return null;
    const descriptor = Object.getOwnPropertyDescriptor(
      combatant,
      "getInitiativeRoll"
    );
    const original = combatant.getInitiativeRoll;
    let enabled = true;
    // Combat owns messages, grouping, recovery and turn updates. Supply its
    // exact combatant with the native D&D roll, including the original event.
    const preparedRoll = function (...args) {
      return enabled ? roll : original.apply(this, args);
    };
    Object.defineProperty(combatant, "getInitiativeRoll", {
      configurable: true,
      writable: true,
      value: preparedRoll
    });
    try {
      const result = await combat.rollInitiative([combatant.id], {
        updateTurn: true
      });
      Hooks.callAll?.("dnd5e.rollInitiative", nativeActor, [combatant]);
      trace.finish("completed", null, { processed: 1 });
      return result;
    } finally {
      enabled = false;
      if (combatant.getInitiativeRoll === preparedRoll) {
        if (descriptor)
          Object.defineProperty(combatant, "getInitiativeRoll", descriptor);
        else delete combatant.getInitiativeRoll;
      }
    }
  } catch (error) {
    trace.finish("error", "native-error");
    throw error;
  } finally {
    trace.finish("rejected", "preconditions-changed");
  }
}

function useNative(item, activity, event, callback) {
  const trace = beginDiagnostic("dnd5e.use", {
    item: diagnosticRef(item, "item"),
    type: item.type,
    activation: activity?.activation?.type,
    alt: Boolean(event?.altKey),
    ctrl: Boolean(event?.ctrlKey),
    shift: Boolean(event?.shiftKey)
  });
  const completed = result => {
    trace.finish(
      result === false || result === null ? "cancelled" : "completed",
      result === false || result === null ? "native-cancelled" : null
    );
    return result;
  };
  const failed = error => {
    trace.finish("error", "native-error");
    throw error;
  };
  try {
    const result = callback();
    return result?.then ? result.then(completed, failed) : completed(result);
  } catch (error) {
    return failed(error);
  }
}

export const dnd5eRolls = {
  rollAbility: (actor, { type, key, event }) =>
    type === "save"
      ? actor.rollSavingThrow({ ability: key, event })
      : actor.rollAbilityCheck({ ability: key, event }),
  rollSkill: (actor, { key, event }) => actor.rollSkill({ skill: key, event }),
  rollTool: (actor, { key, event }) =>
    actor.rollToolCheck({ tool: key, event }),
  rollDeathSave: (actor, { event }) => actor.rollDeathSave({ event }),
  rollInitiative,
  useItem: (item, { event }) =>
    useNative(item, null, event, () => item.use({ event })),
  showItemDescription: item => item.displayCard(),
  useActivity: (item, activityId, { event }) => {
    const activity =
      item.system.activities?.get?.(activityId) ??
      itemActivities(item).find(candidate => candidate.id === activityId);
    if (!activity || activity.canUse === false) {
      const trace = beginDiagnostic("dnd5e.use", {
        item: diagnosticRef(item, "item")
      });
      trace.finish(
        "rejected",
        activity ? "activity-unavailable" : "activity-missing"
      );
      return null;
    }
    return useNative(item, activity, event, () => activity.use({ event }));
  }
};
