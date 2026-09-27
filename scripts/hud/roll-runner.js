import { createActionCooldown } from "./action-cooldown.js";

const ROLL_ACTIONS = [
  "initiative",
  "endturn",
  "gmprevious",
  "gmnext",
  "gmremove",
  "gmremovedead",
  "gmping",
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
    if (rollPending || !canStartMutation()) return;
    rollPending = true;
    const restoreRollControls = disableRollControls();

    try {
      return await callback();
    } finally {
      rollPending = false;
      restoreRollControls();
      refreshScheduler.cancel();
      if (getApp()?.rendered) refreshHud();
    }
  };

  return { performRoll: perform, performAndRefresh: perform };
}
