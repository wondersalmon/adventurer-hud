import { createActionCooldown } from "./action-cooldown.js";

const ROLL_ACTIONS = [
  "initiative",
  "endturn",
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
  canStartMutation = createActionCooldown()
}) {
  let rollPending = false;

  const setRollControlsDisabled = disabled => {
    getApp()
      ?.element?.querySelectorAll(
        ROLL_ACTIONS.map(action => `[data-action="${action}"]`).join(",")
      )
      .forEach(button => {
        button.disabled = disabled;
      });
  };

  const perform = async callback => {
    if (rollPending || !canStartMutation()) return;
    rollPending = true;
    setRollControlsDisabled(true);

    try {
      return await callback();
    } finally {
      rollPending = false;
      refreshScheduler.cancel();
      if (getApp()?.rendered) refreshHud();
    }
  };

  return { performRoll: perform, performAndRefresh: perform };
}
