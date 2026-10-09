import { beginDiagnostic, recordDiagnostic } from "../diagnostics.js";
import { createActionCooldown } from "./action-cooldown.js";

const ROLL_ACTIONS = [
  "initiative",
  "endturn",
  "gmprevious",
  "gmnext",
  "gmremove",
  "gmremovedead",
  "gmping",
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
  canStartMutation = createActionCooldown()
}) {
  let rollPending = false;

  const disableRollControls = () => {
    const previous = new Map();
    getApp()
      ?.element?.querySelectorAll(
        disabledActions.map(action => `[data-action="${action}"]`).join(",")
      )
      .forEach(button => {
        previous.set(button, button.disabled);
        button.disabled = true;
      });
    return () => {
      for (const [button, disabled] of previous) button.disabled = disabled;
    };
  };

  const perform = async callback => {
    if (rollPending || !canStartMutation()) {
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
    const restoreRollControls = disableRollControls();

    try {
      const result = await callback();
      trace.finish("completed");
      return result;
    } catch (error) {
      trace.finish("error", "native-error");
      throw error;
    } finally {
      rollPending = false;
      restoreRollControls();
      refreshScheduler.cancel();
      if (getApp()?.rendered) refreshHud();
    }
  };

  return { performRoll: perform, performAndRefresh: perform };
}
