// Bounded tab-local recorder. No timers, hooks, console interception or storage.
export const DIAGNOSTIC_LIMITS = Object.freeze({
  errors: 100,
  history: 150,
  recording: 1500,
  bytes: 2 * 1024 * 1024,
  duration: 600000
});
const clone = value => JSON.parse(JSON.stringify(value));
const size = value => JSON.stringify(value).length * 2;
export function createDiagnosticStore({
  now = () => Date.now(),
  monotonic = () => performance.now()
} = {}) {
  let errors = [],
    history = [],
    detail = [],
    problem = null,
    recording = null;
  let dropped = { errors: 0, history: 0, recording: 0, memory: 0 };
  let start = now(),
    origin = monotonic(),
    sequence = 0,
    eventBytes = 0;
  const remove = list => {
    const entry = list.shift();
    if (entry) eventBytes -= entry.bytes;
  };
  const push = (list, entry) => {
    entry.bytes = size(entry);
    eventBytes += entry.bytes;
    list.push(entry);
  };
  const resize = entry => {
    eventBytes -= entry.bytes;
    delete entry.bytes;
    entry.bytes = size(entry);
    eventBytes += entry.bytes;
  };
  const stamp = () => ({
    time: new Date(now()).toISOString(),
    elapsed: Math.max(0, monotonic() - origin)
  });
  const stop = reason => {
    if (recording?.active)
      Object.assign(recording, {
        active: false,
        endedAt: new Date(now()).toISOString(),
        reason
      });
  };
  const expire = () => {
    if (recording?.active && now() >= recording.deadline) stop("timeout");
  };
  const bytes = () => eventBytes + size({ problem, recording });
  const trim = (list, key, limit) => {
    while (list.length > limit) {
      remove(list);
      dropped[key]++;
    }
    while (bytes() > DIAGNOSTIC_LIMITS.bytes) {
      const candidates = [errors, history, detail].filter(
        entries => entries.length
      );
      if (!candidates.length) {
        problem = null;
        break;
      }
      candidates.sort((a, b) => a[0].elapsed - b[0].elapsed);
      remove(candidates[0]);
      dropped.memory++;
    }
  };
  const append = (list, entry, key, limit) => {
    const previous = list.at(-1);
    const signature = JSON.stringify([
      entry.scope,
      entry.outcome,
      entry.reason,
      entry.data
    ]);
    if (
      previous &&
      previous.signature === signature &&
      entry.elapsed - previous.elapsed < 15000 &&
      !entry.operation
    ) {
      previous.count++;
      previous.lastSeen = entry.time;
      resize(previous);
    } else push(list, { ...entry, signature, count: 1 });
    trim(list, key, limit);
  };
  return {
    nextId(prefix = "op") {
      return prefix + "-" + ++sequence;
    },
    record(entry, { detailed = false, context = null } = {}) {
      expire();
      if (detailed && !recording?.active) return;
      const value = { ...clone(entry), ...stamp() };
      if (
        ["rejected", "error", "stale", "unavailable"].includes(entry.outcome) &&
        recording?.reason !== "user-mark"
      )
        problem = {
          ...stamp(),
          context: clone(context),
          operation: entry.operation ?? null,
          reason: entry.reason ?? entry.scope
        };
      append(
        detailed ? detail : history,
        value,
        detailed ? "recording" : "history",
        detailed ? DIAGNOSTIC_LIMITS.recording : DIAGNOSTIC_LIMITS.history
      );
    },
    failure(entry, context) {
      expire();
      const value = { ...clone(entry), ...stamp() };
      const previous = errors.findLast(
        e =>
          e.scope === entry.scope &&
          e.message === entry.message &&
          e.level === entry.level &&
          now() - Date.parse(e.lastSeen) < 15000
      );
      if (previous) {
        previous.count++;
        previous.lastSeen = value.time;
        resize(previous);
      } else
        push(errors, {
          ...value,
          firstSeen: value.time,
          lastSeen: value.time,
          count: 1
        });
      if (recording?.reason !== "user-mark")
        problem = { ...stamp(), context: clone(context), reason: entry.scope };
      trim(errors, "errors", DIAGNOSTIC_LIMITS.errors);
      return previous ? previous.count : 1;
    },
    start() {
      expire();
      if (recording?.active) return;
      while (detail.length) remove(detail);
      problem = null;
      recording = {
        active: true,
        startedAt: new Date(now()).toISOString(),
        deadline: now() + DIAGNOSTIC_LIMITS.duration,
        reason: null
      };
    },
    stop,
    mark(context) {
      problem = { ...stamp(), reason: "user-mark", context: clone(context) };
      stop("user-mark");
      trim(history, "history", DIAGNOSTIC_LIMITS.history);
    },
    clear() {
      errors = [];
      history = [];
      detail = [];
      problem = null;
      recording = null;
      eventBytes = 0;
      dropped = { errors: 0, history: 0, recording: 0, memory: 0 };
      start = now();
      origin = monotonic();
    },
    get active() {
      expire();
      return Boolean(recording?.active);
    },
    snapshot() {
      expire();
      const clean = entries =>
        entries.map(value => {
          const entry = { ...value };
          delete entry.signature;
          delete entry.bytes;
          return entry;
        });
      return clone({
        startedAt: new Date(start).toISOString(),
        events: clean(errors),
        history: clean(history),
        recordingEvents: clean(detail),
        problem,
        recording,
        dropped,
        memoryBytes: bytes()
      });
    }
  };
}
