// @ts-check
import { beginDiagnostic } from "../diagnostics.js";

/**
 * @template T
 * @param {import('../../types/hud.js').LatestRefreshOptions<T>} options
 * @returns {() => Promise<void>}
 */
export function createLatestRefresh({ load, apply, isCurrent, onError }) {
  let version = 0;
  let loadedVersion = 0;
  /** @type {Promise<void> | null} */
  let running = null;
  const run = async () => {
    let requested;
    do {
      if (!isCurrent()) return;
      requested = version;
      loadedVersion = requested;
      const trace = beginDiagnostic(
        "hud.refresh.load",
        { requested },
        { detailed: true }
      );
      try {
        const value = await load();
        if (requested === version && isCurrent()) {
          apply(value);
          trace.finish("completed", "applied");
        } else trace.finish("stale", "session-or-request-replaced");
      } catch (error) {
        trace.finish("error", "load-failed");
        if (isCurrent()) onError(error);
      }
      // A burst of hooks shares one load and, if needed, one fresh follow-up.
    } while (requested !== version);
  };
  /** @returns {Promise<void>} */
  const request = () => {
    version++;
    return (running ??= run().finally(() => {
      running = null;
      // A request can arrive after run exits but before its promise settles.
      if (loadedVersion !== version && isCurrent()) return request();
    }));
  };
  return request;
}
