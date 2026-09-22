const REFRESH_PRIORITY = Object.freeze({
  conditions: 1,
  actions: 2,
  full: 3
});

export function createRefreshScheduler(
  refresh,
  {
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle)
  } = {}
) {
  let frame = null;
  let pending = null;

  const schedule = (region = "full") => {
    const requested = REFRESH_PRIORITY[region] ? region : "full";
    if (!pending || REFRESH_PRIORITY[requested] > REFRESH_PRIORITY[pending]) {
      pending = requested;
    }

    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      const next = pending;
      pending = null;
      refresh(next === "full" ? null : next);
    });
  };

  const flush = () => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }
    if (!pending) return;
    const next = pending;
    pending = null;
    refresh(next === "full" ? null : next);
  };

  const cancel = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    pending = null;
  };

  return { cancel, flush, schedule };
}
