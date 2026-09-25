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
  "openspellslots",
  "shortrest",
  "longrest"
];

export function createHudRollRunner({ getApp, refreshHud, refreshScheduler }) {
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
    if (rollPending) return;
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
