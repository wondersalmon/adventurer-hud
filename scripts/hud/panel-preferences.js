import { panelStateForActor, panelStateSnapshot } from "./panel-state.js";
import { getSetting, setSetting, SETTINGS } from "../settings.js";
import { reportFailure } from "../diagnostics.js";

export function createPanelPreferences({
  actorUuid,
  tokenUuid,
  gmActive,
  readSetting = getSetting,
  writeSetting = setSetting
}) {
  const key = gmActive ? `gm:${tokenUuid}` : actorUuid;
  let pending = Promise.resolve();
  return {
    initialState: {
      ...panelStateForActor(readSetting(SETTINGS.panelStates), key),
      proficientSkillsOnly: readSetting(SETTINGS.proficientSkillsOnly)
    },
    save(hudState) {
      const snapshot = panelStateSnapshot(hudState);
      pending = pending
        .catch(() => {})
        .then(() =>
          writeSetting(SETTINGS.panelStates, {
            ...(readSetting(SETTINGS.panelStates) ?? {}),
            [key]: snapshot
          })
        );
      void pending.catch(error =>
        reportFailure("hud.panels.save", error, { level: "warn" })
      );
      return pending;
    }
  };
}
