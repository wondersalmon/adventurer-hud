import { beginDiagnostic, recordDiagnostic } from "../diagnostics.js";
import { createActionCooldown } from "./action-cooldown.js";
import {
  lockActionButton,
  unlockActionButton,
  updateActionFeedback
} from "./action-feedback.js";

const ROLL_ACTIONS = [
  "initiative",
  "endturn",
  "scdone",
  "scundo",
  "companionscturn",
  "gmprevious",
  "gmnext",
  "gmremove",
  "gmremovedead",
  "gmcenter",
  "gmhidden",
  "gmdefeated",
  "ability",
  "skill",
  "tool",
  "death",
  "useitem",
  "useactivity",
  "edithp",
  "togglespellprepared",
  "shortrest",
  "longrest",
  "inspiration"
];

export function createHudRollRunner({
  getApp,
  refreshHud,
  refreshScheduler,
  disabledActions = ROLL_ACTIONS,
  canStartMutation = createActionCooldown(),
  t = key => key
}) {
  let rollPending = false;
  let disposed = false;
  let feedbackRoot = null;
  let cooldownTimer = null;
  const owner = Symbol("hud-action");
  const locked = new Set();
  const selector = disabledActions
    .map(action => `[data-action="${action}"]`)
    .join(",");
  const syncControls = () => {
    if (disposed) return;
    const root = getApp()?.element;
    const buttons = new Set(
      rollPending ? (root?.querySelectorAll(selector) ?? []) : []
    );
    for (const button of locked) {
      if (buttons.has(button)) continue;
      unlockActionButton(button, owner);
      locked.delete(button);
    }
    for (const button of buttons) {
      lockActionButton(button, owner);
      locked.add(button);
    }
    if (feedbackRoot && feedbackRoot !== root)
      updateActionFeedback(feedbackRoot, owner, null, t);
    feedbackRoot = root ?? null;
    const remaining = canStartMutation.remaining?.() ?? 0;
    updateActionFeedback(
      root,
      owner,
      rollPending ? "pending" : remaining > 0 ? "cooldown" : null,
      t
    );
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
    if (!rollPending && remaining > 0 && root?.ownerDocument) {
      cooldownTimer = setTimeout(syncControls, Math.ceil(remaining));
      cooldownTimer.unref?.();
    }
  };

  const perform = async callback => {
    if (disposed) return;
    if (rollPending || !canStartMutation()) {
      syncControls();
      recordDiagnostic(
        "hud.mutation",
        {},
        {
          outcome: "rejected",
          reason: rollPending ? "operation-pending" : "session-or-cooldown"
        }
      );
      return;
    }
    const trace = beginDiagnostic("hud.mutation", {}, { detailed: true });
    rollPending = true;
    syncControls();

    try {
      const result = await callback();
      trace.finish("completed");
      return result;
    } catch (error) {
      trace.finish("error", "native-error");
      throw error;
    } finally {
      rollPending = false;
      syncControls();
      refreshScheduler.cancel();
      if (getApp()?.rendered) refreshHud();
    }
  };

  return {
    performRoll: perform,
    performAndRefresh: perform,
    syncControls,
    dispose() {
      disposed = true;
      clearTimeout(cooldownTimer);
      for (const button of locked) unlockActionButton(button, owner);
      locked.clear();
      updateActionFeedback(feedbackRoot, owner, null, t);
      feedbackRoot = null;
    }
  };
}
