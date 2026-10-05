import { panelStateForActor, panelStateSnapshot } from "./panel-state.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";
import { reportFailure, beginDiagnostic } from "../diagnostics.js";
import { createHudState } from "./state.js";

// Sessions sharing one store must merge against its latest completed write.
let writeQueue = Promise.resolve();
let replacing = false;
let generation = 0;
const readers = new Set();

// Drain in-flight writes, reject snapshots made during replacement, then reload
// every live session from the completed store (including a rolled-back store).
export async function replacePanelPreferences(operation) {
  if (replacing) throw new Error("panel-replacement-busy");
  replacing = true;
  generation++;
  try {
    await writeQueue;
    return await operation();
  } finally {
    replacing = false;
    for (const reload of readers) {
      try {
        reload();
      } catch (error) {
        reportFailure("hud.preferences.reload", error);
      }
    }
  }
}

export const flushPanelPreferences = () => writeQueue;

export function createPanelPreferences({
  actorUuid,
  tokenUuid,
  gmActive,
  readSetting = getSetting,
  writeSetting = setSetting
}) {
  const key = gmActive ? `gm:${tokenUuid}` : actorUuid;
  return {
    subscribe(hudState, refresh) {
      const reload = () => {
        const initial = createHudState(
          panelStateForActor(readSetting(SETTINGS.panelStates), key)
        );
        for (const field of Object.keys(panelStateSnapshot(initial)))
          hudState[field] = initial[field];
        hudState.itemLayouts = initial.itemLayouts;
        hudState.hudLayouts = initial.hudLayouts;
        refresh();
      };
      readers.add(reload);
      return () => readers.delete(reload);
    },
    initialState: {
      ...panelStateForActor(readSetting(SETTINGS.panelStates), key),
      proficientSkillsOnly: readSetting(SETTINGS.proficientSkillsOnly)
    },
    save(hudState) {
      if (replacing) return Promise.resolve();
      const revision = generation;
      const snapshot = panelStateSnapshot(hudState);
      const trace = beginDiagnostic(
        "hud.preferences.save",
        { category: snapshot.combatCategory },
        { detailed: true }
      );
      const pending = writeQueue
        .catch(() => {})
        .then(() =>
          revision !== generation
            ? undefined
            : writeSetting(SETTINGS.panelStates, {
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
