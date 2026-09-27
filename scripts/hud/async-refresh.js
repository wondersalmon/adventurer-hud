// @ts-check

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
      try {
        const value = await load();
        if (requested === version && isCurrent()) apply(value);
      } catch (error) {
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
