import { MODULE_ID } from "./module-id.js";

const MAX_EVENTS = 100;
const REPEAT_WINDOW = 15_000;
const events = [];
const startedAt = new Date().toISOString();

const safeText = (value, limit) =>
  String(value ?? "")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, "$1")
    .slice(0, limit);

/** Record only errors owned by this module; never intercept the global console. */
/** @param {string} scope @param {unknown} error @param {{level?: 'error' | 'warn', notify?: boolean, t?: import('../types/hud.js').Translate}} options */
export function reportFailure(
  scope,
  error,
  { level = "error", notify = true, t } = {}
) {
  const now = Date.now();
  const message = safeText(error?.message ?? error, 2000);
  const previous = events.findLast(
    entry =>
      entry.scope === scope &&
      entry.message === message &&
      entry.level === level &&
      now - Date.parse(entry.lastSeen) < REPEAT_WINDOW
  );
  if (previous) {
    previous.count++;
    previous.lastSeen = new Date(now).toISOString();
  } else {
    events.push({
      scope: safeText(scope, 120),
      level,
      message,
      stack: safeText(error?.stack, 8000),
      firstSeen: new Date(now).toISOString(),
      lastSeen: new Date(now).toISOString(),
      count: 1
    });
    if (events.length > MAX_EVENTS) events.shift();
  }
  if (!previous)
    console[level === "warn" ? "warn" : "error"](
      `Adventurer HUD | ${scope}`,
      error
    );
  if (notify && (!previous || !previous.notified)) {
    const key = "ADVENTURER_HUD.Diagnostics.ErrorNotice";
    const label =
      t?.("Diagnostics.ErrorNotice") ?? globalThis.game?.i18n?.localize(key);
    globalThis.ui?.notifications?.[level === "warn" ? "warn" : "error"](
      `${label && label !== key ? label : "Adventurer HUD: operation failed"}: ${message}`
    );
    (previous ?? events.at(-1)).notified = true;
  }
}

export function diagnosticReport({ integrity = null } = {}) {
  const game = globalThis.game;
  return {
    schemaVersion: 1,
    startedAt,
    exportedAt: new Date().toISOString(),
    environment: {
      foundry: game?.version ?? game?.release?.version ?? null,
      system: {
        id: game?.system?.id ?? null,
        version: game?.system?.version ?? null
      },
      module: game?.modules?.get(MODULE_ID)?.version ?? null,
      language: game?.i18n?.lang ?? null,
      role: game?.user?.isGM ? "gm" : "player",
      preset: globalThis.__adventurerHud?.preset ?? null,
      activeModules: [...(game?.modules?.values() ?? [])]
        .filter(module => module.active)
        .map(module => ({ id: module.id, version: module.version }))
    },
    integrity,
    events: events.map(event => ({
      scope: event.scope,
      level: event.level,
      message: event.message,
      stack: event.stack,
      firstSeen: event.firstSeen,
      lastSeen: event.lastSeen,
      count: event.count
    }))
  };
}

export async function exportDiagnosticReport(options) {
  const report = diagnosticReport(options);
  const filename = `adventurer-hud-diagnostics-${report.exportedAt.replace(/[:.]/g, "-")}.json`;
  const result = await foundry.utils.saveDataToFile(
    JSON.stringify(report, null, 2),
    "application/json",
    filename
  );
  if (result === false)
    throw new Error("The error report download was not started.");
  return { filename, eventCount: report.events.length };
}
