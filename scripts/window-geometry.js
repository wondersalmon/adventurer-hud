import { getSetting, setSetting, SETTINGS } from "./settings-access.js";
import { reportFailure } from "./diagnostics.js";
import { createTaskQueue } from "./task-queue.js";

export function getWindowGeometry(gmActive = false, mode = null) {
  const key = gmActive ? SETTINGS.gmWindowGeometry : SETTINGS.windowGeometry;
  const geometry = pendingGeometry.get(key) ?? getSetting(key) ?? {};
  if (gmActive || !getSetting(SETTINGS.separateModeSizes) || !mode)
    return geometry;
  const sizes =
    stagedModeSizes.get(mode) ?? getSetting(SETTINGS.windowModeSizes)?.[mode];
  return {
    ...geometry,
    ...(Number.isFinite(sizes?.width) && sizes.width > 0
      ? { width: sizes.width }
      : {}),
    ...(Number.isFinite(sizes?.height) && sizes.height > 0
      ? { height: sizes.height }
      : {})
  };
}

let geometryTimer = null;
const pendingGeometry = new Map();
const pendingModeSizes = new Map();
const stagedModeSizes = new Map();
const queueGeometrySave = createTaskQueue();

export function saveWindowGeometry(
  geometry,
  { immediate = false, gmActive = false, mode = null } = {}
) {
  const key = gmActive ? SETTINGS.gmWindowGeometry : SETTINGS.windowGeometry;
  pendingGeometry.set(key, { ...geometry });
  if (
    !gmActive &&
    getSetting(SETTINGS.separateModeSizes) &&
    ["regular", "combat"].includes(mode)
  ) {
    const sizes = Object.fromEntries(
      ["width", "height"]
        .filter(key => Number.isFinite(geometry[key]) && geometry[key] > 0)
        .map(key => [key, geometry[key]])
    );
    pendingModeSizes.set(mode, sizes);
    stagedModeSizes.set(mode, sizes);
  }

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
  if (!pendingGeometry.size && !pendingModeSizes.size) {
    return queueGeometrySave(() => {});
  }

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  const entries = Array.from(pendingGeometry);
  pendingGeometry.clear();
  const modeSizes = Array.from(pendingModeSizes);
  pendingModeSizes.clear();
  await queueGeometrySave(async () => {
    const writes = entries.map(([key, value]) => setSetting(key, value));
    if (modeSizes.length)
      writes.push(
        setSetting(SETTINGS.windowModeSizes, {
          ...(getSetting(SETTINGS.windowModeSizes) ?? {}),
          ...Object.fromEntries(modeSizes)
        })
      );
    await Promise.all(writes);
    for (const [mode, sizes] of modeSizes) {
      if (stagedModeSizes.get(mode) === sizes) stagedModeSizes.delete(mode);
    }
  });
}
