// @ts-check
import { getSetting, SETTINGS } from "../settings-access.js";

const MODULE = "sc-venaerys-initiative";
const completing = new WeakSet();
const builtins = ["fast", "enemies", "slow"];
const types = new Set([...builtins, "creatures", "event"]);

/** @typedef {{id: string, type: string, name?: string | null, nameKey?: string | null}} Phase */
/** @typedef {{valid: boolean, phaseId: string | null, currentPhaseId: string | null, currentName: string | null, phaseName: string | null, phaseRank: number, currentRank: number, half: "move" | "act" | null, split: boolean, done: boolean, moved: boolean, isTurn: boolean, isActing: boolean, usesInitiative: boolean, canRoll: boolean, turnKey: string | null}} ScInitiativeState */

/** @param {any} document */
const flagsOf = document => document?.flags?.[MODULE] ?? {};

/** Read only the format used by SC 1.0.3; SC owns classification and progression.
 * @param {any} combat
 * @param {any} [combatant]
 * @returns {ScInitiativeState | null}
 */
export function readScInitiative(combat, combatant) {
  if (
    typeof game === "undefined" ||
    !game?.settings ||
    !getSetting(SETTINGS.scInitiative) ||
    !game.modules?.get?.(MODULE)?.active ||
    flagsOf(combat).enabled !== true
  )
    return null;
  const flags = flagsOf(combat);
  const plan = flags.plan;
  const valid = Boolean(
    Array.isArray(plan) &&
    plan.every(
      phase =>
        phase &&
        typeof phase.id === "string" &&
        phase.id &&
        types.has(phase.type) &&
        typeof phase.icon === "string" &&
        phase.icon &&
        typeof phase.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(phase.color) &&
        (!builtins.includes(phase.type) || phase.id === phase.type) &&
        (phase.name == null || typeof phase.name === "string") &&
        (phase.nameKey == null || typeof phase.nameKey === "string") &&
        ((typeof phase.name === "string" && phase.name.trim()) ||
          (typeof phase.nameKey === "string" && phase.nameKey))
    ) &&
    new Set(plan.map(phase => phase.id)).size === plan.length &&
    (flags.split == null || ["off", "players", "all"].includes(flags.split)) &&
    builtins.every(
      (id, index) =>
        plan.filter(phase => phase.type === id).length === 1 &&
        (!index ||
          plan.findIndex(phase => phase.id === id) >
            plan.findIndex(phase => phase.id === builtins[index - 1]))
    )
  );
  /** @type {Phase[]} */
  const phases = valid ? plan : [];
  const known = id => phases.find(phase => phase.id === id) ?? null;
  const current = combat?.started
    ? known(flagsOf(combat.combatant).phase)
    : null;
  const own = known(flagsOf(combatant).phase);
  const split = Boolean(
    current &&
    current.type !== "event" &&
    (flags.split === "all" ||
      (flags.split === "players" && ["fast", "slow"].includes(current.type)))
  );
  const half = split
    ? flags.actionsHalf === `${combat.round}:${current?.id}`
      ? "act"
      : "move"
    : null;
  const marks = flagsOf(combatant);
  const done = Boolean(combat?.started && marks.done === combat.round);
  const moved =
    done || Boolean(combat?.started && marks.moved === combat.round);
  const isTurn = Boolean(current && own?.id === current.id);
  const isActing = Boolean(
    isTurn && !combatant?.isDefeated && !(half === "move" ? moved : done)
  );
  const usesInitiative = Boolean(
    marks.side === "players" ||
    (marks.side == null && combatant?.hasPlayerOwner)
  );
  const canRoll = Boolean(
    valid &&
    combatant &&
    combatant.actor &&
    combatant.isOwner !== false &&
    usesInitiative &&
    !Number.isFinite(combatant.initiative)
  );
  const visible = entry => game.user?.isGM || entry?.visible === true;
  const name = phase =>
    phase
      ? phase.name?.trim() || game.i18n.localize(phase.nameKey ?? "")
      : null;
  const members = [
    ...(combat?.combatants?.values?.() ?? combat?.combatants ?? [])
  ];
  return {
    valid,
    phaseId: own?.id ?? null,
    currentPhaseId: current?.id ?? null,
    currentName:
      current &&
      members.some(
        entry => flagsOf(entry).phase === current.id && visible(entry)
      )
        ? name(current)
        : null,
    phaseName: visible(combatant) ? name(own) : null,
    phaseRank: own ? phases.indexOf(own) : phases.length,
    currentRank: current ? phases.indexOf(current) : -1,
    half,
    split,
    done,
    moved,
    isTurn,
    isActing,
    usesInitiative,
    canRoll,
    turnKey: isTurn ? `${combat.id}:${combat.round}:${current?.id}` : null
  };
}

/** Mark only the exact displayed participant. Never use player's nextTurn: SC marks all owned members.
 * @param {any} combat
 * @param {any} combatant
 * @param {() => boolean} isCurrent
 * @param {any} [displayedActor]
 * @returns {Promise<"done" | "moved" | null>}
 */
export async function completeScTurn(
  combat,
  combatant,
  isCurrent,
  displayedActor
) {
  const before = readScInitiative(combat, combatant);
  if (!before?.isActing || !combatant?.isOwner || completing.has(combatant))
    return null;
  const round = combat.round;
  const actor = combatant.token?.actor ?? combatant.actor;
  const token = combatant.token;
  const kind = before.half === "move" ? "moved" : "done";
  completing.add(combatant);
  try {
    const current = readScInitiative(combat, combatant);
    if (
      !isCurrent() ||
      !current?.isActing ||
      current.phaseId !== before.phaseId ||
      current.currentPhaseId !== before.currentPhaseId ||
      current.half !== before.half ||
      combat.round !== round ||
      combat.combatants?.get?.(combatant.id) !== combatant ||
      !actor?.isOwner ||
      (displayedActor &&
        actor !== displayedActor &&
        token?.baseActor !== displayedActor) ||
      !combatant.isOwner ||
      (token &&
        (token.parent?.tokens?.get?.(token.id) !== token ||
          token.actor !== actor))
    )
      return null;
    const updates = { [`flags.${MODULE}.${kind}`]: round };
    if (kind === "done" && before.split)
      updates[`flags.${MODULE}.moved`] = round;
    await combatant.update(updates, {
      render: false,
      [MODULE]: { reason: "done" }
    });
    return flagsOf(combatant)[kind] === round ? kind : null;
  } finally {
    completing.delete(combatant);
  }
}

/** SC's public UI API shows the native tracker; it does not select another Combat.
 * @param {any} [combat]
 * @param {(key: string) => string} [t]
 * @returns {unknown}
 */
export function openScTracker(combat, t) {
  if (combat && combat !== game.combat && t)
    ui.notifications.info(t("SC.ChooseCombat"));
  return game.modules?.get?.(MODULE)?.api?.open?.();
}

/** @param {ScInitiativeState} state @param {(key: string) => string} t */
export function scTurnLabel(state, t) {
  return t(
    state.half === "move"
      ? state.moved
        ? "SC.Moved"
        : "SC.MarkMoved"
      : state.done
        ? "SC.Done"
        : "SC.MarkDone"
  );
}

/** @param {any} combat */
export function canScGoBack(combat) {
  const state = readScInitiative(combat);
  if (!state) return null;
  const members = [...(combat?.turns ?? combat?.combatants?.values?.() ?? [])];
  const earlier =
    state &&
    members.some(entry => {
      const other = readScInitiative(combat, entry);
      return (
        !entry.isDefeated &&
        other?.phaseId &&
        (combat.round > 1 || other.phaseRank < state.currentRank)
      );
    });
  return state
    ? Boolean(
        state.valid &&
        combat?.started &&
        state.currentPhaseId &&
        (earlier || state.half === "act")
      )
    : null;
}
