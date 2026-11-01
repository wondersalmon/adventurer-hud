// @ts-check
import { getSetting, SETTINGS } from "../settings-access.js";
import { SC_MODULE_ID as MODULE, scModule } from "./sc-module.js";

const completing = new WeakSet();
const builtins = ["fast", "enemies", "slow"];
const types = new Set([...builtins, "creatures", "event"]);

/** @typedef {{id: string, type: string, name?: string | null, nameKey?: string | null}} Phase */
/** @typedef {{valid: boolean, phaseId: string | null, currentPhaseId: string | null, currentName: string | null, phaseName: string | null, phaseRank: number, currentRank: number, half: "move" | "act" | null, split: boolean, done: boolean, moved: boolean, marked: boolean, canToggle: boolean, extraTurn: boolean, progress: {completed: number, total: number} | null, isTurn: boolean, isActing: boolean, usesInitiative: boolean, canRoll: boolean, turnKey: string | null}} ScInitiativeState */

/** @param {any} document */
const flagsOf = document => document?.flags?.[MODULE] ?? {};

/** Resolve SC's extra turn for the same exact token; explicit GM selections stay exact.
 * @param {any} combat @param {any} combatant
 */
export function scActingCombatant(combat, combatant) {
  if (!combatant || !readScInitiative(combat)) return combatant;
  const original = flagsOf(combatant).extraTurnOf ?? combatant.id;
  const family = [...(combat?.turns ?? [])].filter(
    entry =>
      entry.token === combatant.token &&
      (entry.id === original || flagsOf(entry).extraTurnOf === original)
  );
  return (
    family.find(entry => readScInitiative(combat, entry)?.isActing) ??
    family.find(entry => readScInitiative(combat, entry)?.isTurn) ??
    combatant
  );
}

/** Read SC's phase state; SC owns classification and progression.
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
  const owned = current
    ? members.filter(
        entry =>
          visible(entry) &&
          entry.isOwner &&
          (entry.token?.actor ?? entry.actor)?.isOwner &&
          !entry.isDefeated &&
          flagsOf(entry).phase === current.id
      )
    : [];
  const marked = half === "move" ? moved : done;
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
    marked,
    canToggle: Boolean(
      isTurn &&
      combatant?.isOwner &&
      (combatant.token?.actor ?? combatant.actor)?.isOwner &&
      !combatant.isDefeated
    ),
    extraTurn:
      typeof marks.extraTurnOf === "string" && Boolean(marks.extraTurnOf),
    progress:
      current && owned.length
        ? {
            total: owned.length,
            completed: owned.filter(
              entry =>
                flagsOf(entry).done === combat.round ||
                (half === "move" && flagsOf(entry).moved === combat.round)
            ).length
          }
        : null,
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
 * @param {boolean} [completed]
 * @returns {Promise<"done" | "moved" | null>}
 */
export async function completeScTurn(
  combat,
  combatant,
  isCurrent,
  displayedActor,
  completed = true
) {
  const before = readScInitiative(combat, combatant);
  if (
    !before?.canToggle ||
    before.marked === completed ||
    completing.has(combatant)
  )
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
      !current?.canToggle ||
      current.marked !== before.marked ||
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
    const api = scModule()?.api;
    const method = kind === "moved" ? "setMoved" : "setDone";
    // SC owns permission rules, split marks and auto-advance. Never bypass its API.
    if (typeof api?.[method] !== "function") {
      ui.notifications.warn(
        "Adventurer HUD: " +
          game.i18n.localize("ADVENTURER_HUD.SC.UpdateRequired")
      );
      return null;
    }
    const applied = await api[method](combat, combatant.id, completed);
    return applied !== false &&
      (flagsOf(combatant)[kind] === round) === completed
      ? kind
      : null;
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

/** @param {ScInitiativeState} state @param {(key: string) => string} t */
export function scTurnActionLabel(state, t) {
  return state.marked
    ? t(state.half === "move" ? "SC.UndoMoved" : "SC.UndoDone")
    : scTurnLabel(state, t);
}

/** Bounded public integration metadata. No document values, phase names or DCs.
 * @param {any} [combat]
 */
export function scIntegrationStatus(combat) {
  const version = value =>
    typeof value === "string" && /^[a-zA-Z0-9.+-]{1,64}$/.test(value)
      ? value
      : null;
  try {
    const module = scModule();
    const api = Object.fromEntries(
      ["open", "setDone", "setMoved"].map(key => [
        key,
        typeof module?.api?.[key] === "function"
      ])
    );
    const enabled = getSetting(SETTINGS.scInitiative) === true;
    const state = !module
      ? "missing"
      : !module.active
        ? "inactive"
        : !enabled
          ? "disabled"
          : Object.values(api).some(value => !value)
            ? "api-unavailable"
            : !combat
              ? "no-combat"
              : flagsOf(combat).enabled !== true
                ? "native-combat"
                : !readScInitiative(combat)?.valid
                  ? "invalid-combat"
                  : "ready";
    return {
      state,
      enabled,
      installed: Boolean(module),
      active: Boolean(module?.active),
      hudVersion: version(game?.modules?.get?.("adventurer-hud")?.version),
      scVersion: version(module?.version),
      api
    };
  } catch {
    return {
      state: "unavailable",
      enabled: false,
      installed: false,
      active: false,
      hudVersion: null,
      scVersion: null,
      api: { open: false, setDone: false, setMoved: false }
    };
  }
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
