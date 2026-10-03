import { reportFailure } from "./diagnostics.js";

/** Cache only module loading; the HUD entry owns the opening queue. */
export function createHudLoader({
  load = () => import("./rolls-hud.js"),
  onError = error => reportFailure("hud.load", error)
} = {}) {
  let loading = null;
  return async (...args) => {
    if (!loading) {
      loading = Promise.resolve()
        .then(load)
        .catch(error => {
          loading = null;
          throw error;
        });
    }
    let module;
    try {
      module = await loading;
    } catch (error) {
      onError(error);
      return;
    }
    return module.openRollsHud(...args);
  };
}

export const openRollsHud = createHudLoader();
