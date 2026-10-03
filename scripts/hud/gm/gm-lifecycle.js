import { getSetting, SETTINGS } from "../../settings-access.js";

export function registerGmLifecycle({
  hooks = Hooks,
  openHud,
  getState = () => (globalThis.__adventurerHud ??= {})
}) {
  const enabled = () => game.user?.isGM && getSetting(SETTINGS.gmEnabled);
  const inScene = combat =>
    Boolean(
      canvas.scene &&
      combat &&
      (!combat.scene || combat.scene.id === canvas.scene.id)
    );
  const closeCombat = combat => {
    const state = getState();
    if (
      enabled() &&
      getSetting(SETTINGS.gmCloseAfterCombat) &&
      state?.preset === "gm" &&
      state.gm?.combatId === combat.id
    ) {
      state.session = null;
      void state.app?.close();
    }
  };
  hooks.on("createCombat", combat => {
    if (!enabled() || !inScene(combat) || !getSetting(SETTINGS.gmOpenOnCombat))
      return;
    const state = getState();
    if (state?.app?.rendered && state.preset === "gm") return;
    if (state) {
      state.gm ??= {};
      state.gm.combatId = combat.id;
      state.gm.combatantId = null;
    }
    void openHud();
  });
  hooks.on("deleteCombat", closeCombat);
  hooks.on("updateCombat", (combat, changes) => {
    if (changes.round === 0) closeCombat(combat);
  });
}
