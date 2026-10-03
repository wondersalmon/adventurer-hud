import { MODULE_ID } from "./module-id.js";
import { DIAGNOSTIC_LIMITS } from "./diagnostic-store.js";
export const code = value =>
  typeof value === "string" && /^[a-zA-Z0-9_.: -]{1,120}$/.test(value)
    ? value
    : "unknown";
const fields = new Set([
  "actor",
  "token",
  "owner",
  "base",
  "item",
  "source",
  "details",
  "combatant",
  "session",
  "category",
  "filter",
  "kind",
  "activation",
  "reason",
  "missing",
  "count",
  "requested",
  "processed",
  "coalesced",
  "listeners",
  "timers",
  "phase",
  "duration",
  "alt",
  "ctrl",
  "shift",
  "input",
  "linked",
  "onScene",
  "permission",
  "paused",
  "exists",
  "sight",
  "active",
  "alive",
  "pan",
  "controlled",
  "hasInitiative",
  "exactToken",
  "description",
  "activities",
  "groups",
  "searchActive",
  "preparedOnly",
  "passive",
  "blocked",
  "valid",
  "type",
  "scope",
  "outcome",
  "operation",
  "ref",
  "instance",
  "width",
  "height",
  "replaced"
]);
export function safeData(data, depth = 0) {
  if (depth > 3) return null;
  if (data == null || typeof data === "boolean") return data ?? null;
  if (typeof data === "number") return Number.isFinite(data) ? data : null;
  if (typeof data === "string") return code(data);
  if (Array.isArray(data))
    return data.slice(0, 30).map(value => safeData(value, depth + 1));
  const output = {};
  for (const [key, value] of Object.entries(data).slice(0, 50))
    if (fields.has(key)) output[key] = safeData(value, depth + 1);
  return output;
}

export const safeText = (value, limit) =>
  String(value ?? "")
    .slice(0, 16000)
    .replace(/https?:\/\/[^\s)]+/g, "[url]")
    .replace(/[A-Z]:[\\/][^\n)]+/gi, "[path]")
    .replace(/(?:worlds|data|users)\/[^\s)]+/gi, "[path]")
    .replace(
      /(?:Scene|Actor|Token|Item|User|JournalEntry|Compendium)\.[a-zA-Z0-9_.-]+/g,
      "[document]"
    )
    .slice(0, limit);
export function safeFrames(stack) {
  return String(stack ?? "")
    .slice(0, 32000)
    .split("\n")
    .slice(1, 30)
    .flatMap(line => {
      const match = line.match(
        /(?:modules|systems)\/([a-z0-9_-]+)\/(?:[^\s():]+\/)*([a-z0-9_.-]+\.(?:m?js)):(\d+):(\d+)/i
      );
      return match
        ? [
            {
              package: match[1],
              file: match[2],
              line: Number(match[3]),
              column: Number(match[4])
            }
          ]
        : [];
    });
}

function safeIntegrity(integrity) {
  if (!integrity) return null;
  return {
    checkedAt: integrity.checkedAt ?? null,
    issues: (integrity.issues ?? []).slice(0, 200).map(issue => ({
      code: code(issue.code),
      detail:
        /^(?:(?:scripts|styles|templates|lang)\/[a-zA-Z0-9_./-]{1,120}|module\.json|[a-zA-Z][a-zA-Z0-9 ._-]{0,80})$/.test(
          issue.detail ?? ""
        ) && !/(?:Actor|Token|Scene|User)\./.test(issue.detail)
          ? issue.detail
          : null,
      repairable: Boolean(issue.repairable)
    }))
  };
}
export function buildDiagnosticReport(
  snapshot,
  { game, platform, context, preset },
  { integrity = null, includeErrorText = false, comment = "" } = {}
) {
  const report = {
    schemaVersion: 2,
    ...snapshot,
    exportedAt: new Date().toISOString(),
    environment: {
      foundry: game?.version ?? game?.release?.version ?? null,
      system: {
        id: game?.system?.id ?? null,
        version: game?.system?.version ?? null
      },
      module: game?.modules?.get(MODULE_ID)?.version ?? null,
      build:
        typeof game?.modules?.get(MODULE_ID)?.flags?.build === "string"
          ? code(game.modules.get(MODULE_ID).flags.build)
          : null,
      language: game?.i18n?.lang ?? null,
      role: game?.user?.isGM ? "gm" : "player",
      preset,
      ...platform,
      activeModules: [...(game?.modules?.values() ?? [])]
        .filter(module => module.active)
        .map(module => ({ id: module.id, version: module.version }))
    },
    integrity: safeIntegrity(integrity),
    context,
    comment: String(comment).slice(0, 4000),
    events: snapshot.events.map(({ message, ...event }) =>
      includeErrorText ? { ...event, message } : event
    ),
    limits: DIAGNOSTIC_LIMITS
  };
  report.summary = {
    errors: report.events.reduce((n, e) => n + e.count, 0),
    refusals: report.history
      .filter(e => e.outcome === "rejected")
      .reduce((n, e) => n + e.count, 0),
    history: report.history.length,
    detail: report.recordingEvents.length,
    recording: report.recording?.active ?? false,
    stopped: report.recording?.reason ?? null
  };
  return report;
}
