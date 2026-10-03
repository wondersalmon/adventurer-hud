// @ts-check
import { getSetting, SETTINGS } from "../../settings-access.js";

/** @param {{controller: import('../../../types/hud.js').GmController | null, combatant?: any, actorContext?: import('../../../types/hud.js').ActorContext | null, getApp: () => any, isCurrent: () => boolean, scheduler: import('../../../types/hud.js').RefreshScheduler, openHud: () => Promise<unknown>, controlledTokens?: () => any[], readSetting?: (key: string) => any}} options */
export function createGmSelection({
  controller,
  combatant = null,
  actorContext = null,
  getApp,
  isCurrent,
  scheduler,
  openHud,
  controlledTokens = () => canvas.tokens.controlled,
  readSetting = getSetting
}) {
  /** @type {Promise<unknown> | null} */
  let opening = null;
  let previousFollow = controller ? readSetting(SETTINGS.gmFollowTurn) : false;

  const reopen = () => {
    if (!isCurrent() || !getApp()?.rendered) return Promise.resolve();
    return (opening ??= openHud().finally(() => {
      opening = null;
    }));
  };
  const onCombatChange = ({ follow = true } = {}) => {
    const app = getApp();
    if (!controller || !app?.rendered || !isCurrent()) return;
    if (!controller.isGM()) {
      void app.close();
      return;
    }
    const next = combatant
      ? controller.sync({ follow: follow && controlledTokens().length <= 1 })
      : controller.sync();
    const changed = combatant
      ? !next ||
        next.id !== combatant.id ||
        (next.token.actor ?? next.actor) !== actorContext?.actor ||
        next.token.uuid !== actorContext?.tokenUuid
      : Boolean(next);
    if (changed) void reopen();
    else scheduler.schedule();
  };
  let scheduled = false;
  let followScheduled = false;
  const scheduleCombatChange = ({ follow = true } = {}) => {
    followScheduled ||= follow;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const follow = followScheduled;
      followScheduled = false;
      onCombatChange({ follow });
    });
  };
  return {
    reopen,
    onCombatChange,
    scheduleCombatChange,
    async selectCombat(id) {
      if (isCurrent() && controller?.chooseCombat(id)) await reopen();
    },
    syncPreferences() {
      if (!controller || !isCurrent()) return;
      const following = readSetting(SETTINGS.gmFollowTurn);
      if (following && !previousFollow) {
        controller.resumeFollow();
        onCombatChange();
      }
      previousFollow = following;
    }
  };
}
