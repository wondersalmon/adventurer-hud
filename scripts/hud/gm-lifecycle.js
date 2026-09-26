import { getSetting, SETTINGS } from "../settings.js";
import { deadCreatures, removeDeadCreatures } from "./gm-scene.js";

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
  hooks.on("combatStart", combat => {
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
  const autoRemove = async document => {
    const state = getState();
    if (
      !enabled() ||
      (game.users?.activeGM && game.users.activeGM.id !== game.user.id) ||
      !getSetting(SETTINGS.gmAutoRemoveDead) ||
      state?.preset !== "gm"
    )
      return;
    const combat = game.combats?.get(state.gm?.combatId);
    if (!combat?.started || !inScene(combat)) return;
    const actor =
      document?.documentName === "ActiveEffect" ? document.parent : document;
    const ids = deadCreatures(combat)
      .filter(
        entry =>
          (entry.id === document?.id && document?.parent?.id === combat.id) ||
          (entry.token.actor ?? entry.actor)?.uuid === actor?.uuid
      )
      .map(entry => entry.id);
    if (!ids.length) return;
    try {
      await removeDeadCreatures(combat, ids);
    } catch (error) {
      console.error("Adventurer HUD | removing defeated creatures", error);
      ui.notifications.error(error.message);
    }
  };
  for (const hook of [
    "updateActor",
    "updateCombatant",
    "createActiveEffect",
    "updateActiveEffect",
    "deleteActiveEffect"
  ])
    hooks.on(hook, autoRemove);
}
