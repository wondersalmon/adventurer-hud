import { panelStateForActor, panelStateSnapshot } from "./panel-state.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";
import { reportFailure, beginDiagnostic } from "../diagnostics.js";

// Sessions sharing one store must merge against its latest completed write.
let writeQueue = Promise.resolve();

export function createPanelPreferences({
  actorUuid,
  tokenUuid,
  gmActive,
  readSetting = getSetting,
  writeSetting = setSetting
}) {
  const key = gmActive ? `gm:${tokenUuid}` : actorUuid;
  return {
    initialState: {
      ...panelStateForActor(readSetting(SETTINGS.panelStates), key),
      proficientSkillsOnly: readSetting(SETTINGS.proficientSkillsOnly)
    },
    save(hudState) {
      const snapshot = panelStateSnapshot(hudState);
      const trace = beginDiagnostic(
        "hud.preferences.save",
        { category: snapshot.combatCategory },
        { detailed: true }
      );
      const pending = writeQueue
        .catch(() => {})
        .then(() =>
          writeSetting(SETTINGS.panelStates, {
            ...(readSetting(SETTINGS.panelStates) ?? {}),
            [key]: snapshot
          })
        );
      writeQueue = pending.then(
        () => trace.finish("completed", "saved"),
        error => {
          trace.finish("error", "save-failed");
          reportFailure("hud.panels.save", error, { level: "warn" });
        }
      );
      return pending;
    }
  };
}
