import {
  code,
  safeData,
  safeText,
  safeFrames,
  buildDiagnosticReport
} from "./diagnostic-report.js";
import {
  createDiagnosticStore,
  DIAGNOSTIC_LIMITS
} from "./diagnostic-store.js";
import {
  diagnosticContext,
  diagnosticPlatform,
  clearDiagnosticReferences
} from "./diagnostic-context.js";
export { diagnosticRef } from "./diagnostic-context.js";
const store = createDiagnosticStore();
const sessions = new WeakMap();
const sessionRef = () => {
  const session = globalThis.__adventurerHud?.session;
  if (!session || typeof session !== "object") return null;
  if (!sessions.has(session)) sessions.set(session, store.nextId("session"));
  return sessions.get(session);
};
let timer = null;
let availability = new WeakMap();
export function recordAvailability(scope, document, reason, data = {}) {
  try {
    if (!document || typeof document !== "object") return;
    let previous = availability.get(document);
    if (!previous) {
      previous = new Map();
      availability.set(document, previous);
    }
    if (previous.has(scope) && previous.get(scope) === reason) return;
    previous.set(scope, reason);
    recordDiagnostic(scope, data, {
      outcome: reason ? "unavailable" : "available",
      reason
    });
  } catch {
    /* Optional availability evidence. */
  }
}
const listeners = new Set();
const emit = () => {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* Diagnostics must not affect gameplay. */
    }
  }
};
export function recordDiagnostic(
  scope,
  data = {},
  {
    detailed = false,
    outcome = "observed",
    reason = null,
    operation = null
  } = {}
) {
  try {
    if (detailed && !store.active) return;
    store.record(
      {
        scope: code(scope),
        data: safeData(data),
        outcome: code(outcome),
        reason: reason ? code(reason) : null,
        operation: typeof operation === "string" ? code(operation) : null,
        session: data.session == null ? sessionRef() : code(data.session)
      },
      {
        detailed,
        context: ["rejected", "error", "stale", "unavailable"].includes(outcome)
          ? diagnosticContext()
          : null
      }
    );
  } catch {
    /* No recursion into failure reporting. */
  }
}
export function beginDiagnostic(scope, data = {}, { detailed = false } = {}) {
  if (detailed && !store.active) return { step() {}, finish() {} };
  const session = sessionRef();
  let operation = null,
    started = 0;
  try {
    operation = store.nextId();
    started = performance.now();
  } catch {
    /* Optional instrumentation. */
  }
  recordDiagnostic(
    scope,
    { ...data, session, phase: "start" },
    { operation, detailed }
  );
  let done = false;
  return {
    step(phase, extra = {}) {
      recordDiagnostic(
        scope,
        { ...extra, session, phase },
        { operation, detailed: true }
      );
    },
    /** @param {string} [outcome] @param {string | null} [reason] @param {object} [extra] */
    finish(outcome = "completed", reason = null, extra = {}) {
      if (done) return;
      done = true;
      recordDiagnostic(
        scope,
        {
          ...extra,
          session,
          phase: "end",
          duration: Math.max(0, performance.now() - started)
        },
        { operation, detailed, outcome, reason }
      );
    }
  };
}
export function subscribeDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function startDiagnosticRecording() {
  if (store.active) return;
  store.start();
  clearTimeout(timer);
  timer = setTimeout(() => {
    store.stop("timeout");
    timer = null;
    emit();
  }, DIAGNOSTIC_LIMITS.duration);
  timer?.unref?.();
  recordDiagnostic("recording.start");
  emit();
}
export function stopDiagnosticRecording({ mark = false } = {}) {
  if (mark) store.mark(diagnosticContext());
  else store.stop("user-stop");
  clearTimeout(timer);
  timer = null;
  emit();
}
export function clearDiagnostics() {
  clearTimeout(timer);
  timer = null;
  store.clear();
  availability = new WeakMap();
  clearDiagnosticReferences();
  emit();
}
export function diagnosticsRecording() {
  return store.active;
}
/** Only module-owned failures; raw text is opt-in during export. */
/** @param {string} scope @param {unknown} error @param {{level?: 'error' | 'warn', notify?: boolean, t?: import('../types/hud.js').Translate}} options */
export function reportFailure(
  scope,
  error,
  { level = "error", notify = true, t } = {}
) {
  try {
    const message = safeText(error?.message ?? error, 2000);
    const count = store.failure(
      {
        scope: code(scope),
        level,
        message,
        frames: safeFrames(error?.stack),
        errorClass: [
          "Error",
          "TypeError",
          "RangeError",
          "ReferenceError",
          "SyntaxError"
        ].includes(error?.name)
          ? error.name
          : "Error"
      },
      diagnosticContext()
    );
    if (count === 1)
      console[level === "warn" ? "warn" : "error"](
        "Adventurer HUD | " + scope,
        error
      );
    if (notify && count === 1) {
      const key = "ADVENTURER_HUD.Diagnostics.ErrorNotice";
      const label =
        t?.("Diagnostics.ErrorNotice") ?? globalThis.game?.i18n?.localize(key);
      globalThis.ui?.notifications?.[level === "warn" ? "warn" : "error"](
        (label && label !== key ? label : "Adventurer HUD: operation failed") +
          ": " +
          message
      );
    }
  } catch {
    /* Failure of the recorder must not replace the original failure. */
  }
}
export function diagnosticReport(options = {}) {
  return buildDiagnosticReport(
    store.snapshot(),
    {
      game: globalThis.game,
      platform: diagnosticPlatform(),
      context: diagnosticContext(),
      preset: globalThis.__adventurerHud?.preset ?? null
    },
    options
  );
}
export async function exportDiagnosticReport(options) {
  const report = diagnosticReport(options);
  const filename =
    "adventurer-hud-diagnostics-" +
    report.exportedAt.replace(/[:.]/g, "-") +
    ".json";
  const result = await foundry.utils.saveDataToFile(
    JSON.stringify(report, null, 2),
    "application/json",
    filename
  );
  if (result === false)
    throw new Error("The error report download was not started.");
  return { filename, eventCount: report.events.length };
}
