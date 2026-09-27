// @ts-check
import { selectHudActor } from "./actor-selection.js";
import { createHudActorContext } from "./actor-context.js";
import { createGmCombatController } from "./gm-combat.js";
import { createModuleTranslator } from "../localization.js";
import { getCurrentCombat } from "../runtime-helpers.js";
import {
  flushWindowGeometry,
  getSetting,
  setSetting,
  SETTINGS
} from "../settings.js";

/**
 * @param {{actorOverride: import('../../types/hud.js').ActorContext['actor'] | null, adapter: import('../../types/hud.js').HudAdapter, openHud: import('../../types/hud.js').OpenHud}} options
 * @returns {Promise<import('../../types/hud.js').HudOpenContext | null>}
 */
export async function prepareHudOpenContext({
  actorOverride,
  adapter,
  openHud
}) {
  if (game.system.id !== "dnd5e")
    throw new Error(
      game.i18n.localize("ADVENTURER_HUD.Errors.UnsupportedSystem")
    );
  const { language, t, tf } = await createModuleTranslator({
    language: getSetting(SETTINGS.language),
    i18n: game.i18n
  });

  const { DialogV2 } = foundry.applications.api;

  const state = (globalThis.__adventurerHud ??= {});
  state.app ??= null;
  state.actor ??= null;
  state.position ??= null;
  const gmActive = Boolean(game.user?.isGM && getSetting(SETTINGS.gmEnabled));
  const leavingGm = !gmActive && game.user?.isGM && state.preset === "gm";
  state.gm ??= {};
  const gmController = gmActive
    ? createGmCombatController({ memory: state.gm })
    : null;
  const gmCombatant = gmController?.sync({
    selectedToken:
      canvas.tokens.controlled.length === 1 ? canvas.tokens.controlled[0] : null
  });
  if (!gmActive && state.preset === "gm") {
    if (actorOverride?.type === "npc") actorOverride = null;
  }

  const selection = gmActive
    ? gmCombatant
      ? {
          actor: gmCombatant.token.actor ?? gmCombatant.actor,
          token: gmCombatant.token
        }
      : null
    : await selectHudActor({
        actorOverride,
        ignoreUnsupportedSelection: Boolean(game.user?.isGM),
        adapter,
        DialogV2,
        language,
        onSelect: async selectedActor => {
          if (leavingGm) await setSetting(SETTINGS.gmEnabled, false);
          return openHud(selectedActor);
        },
        t,
        tf
      });
  if (!selection && !gmActive) {
    // Keep the current mode until a player character is actually chosen.
    // Closing the picker must not leave the saved mode ahead of the window.
    if (leavingGm) await setSetting(SETTINGS.gmEnabled, true);
    return null;
  }
  const reusedApp =
    gmActive && state.preset === "gm" && state.app?.rendered ? state.app : null;
  const session = {};
  const actorContext = selection
    ? createHudActorContext({
        ...selection,
        combatantId: gmCombatant?.id,
        getCombat: () =>
          gmController ? gmController.getCombat() : getCurrentCombat(game)
      })
    : null;
  if (state.app?.rendered && !reusedApp) {
    await flushWindowGeometry();
    await state.app.close();
  }

  state.session = session;
  state.actorUuid = actorContext?.actorUuid ?? null;
  state.actor = actorContext?.actor ?? null;
  state.tokenUuid = actorContext?.tokenUuid ?? null;
  state.preset = gmActive ? "gm" : "player";

  return {
    state,
    reusedApp,
    gmActive,
    DialogV2,
    t,
    tf,
    adapter,
    actorContext,
    session,
    gmController,
    gmCombatant
  };
}
