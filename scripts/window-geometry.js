import { getSetting, setSetting, SETTINGS } from "./settings-access.js";
import { reportFailure } from "./diagnostics.js";
export const getWindowGeometry = (gmActive = false) =>
  getSetting(gmActive ? SETTINGS.gmWindowGeometry : SETTINGS.windowGeometry) ??
  {};

let geometryTimer = null;
const pendingGeometry = new Map();

export function saveWindowGeometry(
  geometry,
  { immediate = false, gmActive = false } = {}
) {
  const key = gmActive ? SETTINGS.gmWindowGeometry : SETTINGS.windowGeometry;
  pendingGeometry.set(key, geometry);

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  if (immediate) {
    return flushWindowGeometry();
  }

  geometryTimer = setTimeout(() => {
    geometryTimer = null;
    void flushWindowGeometry().catch(error =>
      reportFailure("hud.geometry.save", error, { level: "warn" })
    );
  }, 150);
}

export async function flushWindowGeometry() {
  if (!pendingGeometry.size) {
    return;
  }

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  const entries = Array.from(pendingGeometry);
  pendingGeometry.clear();
  await Promise.all(entries.map(([key, value]) => setSetting(key, value)));
}
