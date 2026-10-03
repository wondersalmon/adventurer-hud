// @ts-check
import { recordDiagnostic, diagnosticRef } from "../diagnostics.js";
import { selectHudActor } from "./actor-selection.js";
import { createHudActorContext } from "./actor-context.js";
import { createGmCombatController } from "./gm/gm-combat.js";
import { createModuleTranslator } from "../localization.js";
import { getCurrentCombat } from "../runtime-helpers.js";
import {
  companionNavigationContext,
  worldDocument
} from "./companions/companions.js";
import { flushWindowGeometry } from "../window-geometry.js";
import { getSetting, setSetting, SETTINGS } from "../settings-access.js";

/**
 * @param {{actorOverride: import('../../types/hud.js').ActorContext['actor'] | null, navigation?: import('../../types/hud.js').CompanionNavigation | null, adapter: import('../../types/hud.js').HudAdapter, openHud: import('../../types/hud.js').OpenHud}} options
 * @returns {Promise<import('../../types/hud.js').HudOpenContext | null>}
 */
export async function prepareHudOpenContext({
  actorOverride,
  navigation = null,
  adapter,
  openHud
}) {
  const requestedNavigation = Boolean(navigation);
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
  // Remove temporary shared sight before resolving another HUD session.
  await state.app?.stopFamiliarVision?.({ pan: false });
  const gmActive = Boolean(game.user?.isGM && getSetting(SETTINGS.gmEnabled));
  if (
    !gmActive &&
    !navigation &&
    state.companionNavigation &&
    actorOverride?.uuid === state.actorUuid
  )
    navigation = state.companionNavigation;
  const linkedContext =
    !gmActive && navigation
      ? await companionNavigationContext(navigation)
      : null;
  if (navigation && !gmActive && !linkedContext) {
    ui.notifications.warn(t("Companions.Unavailable"));
    return null;
  }
  if (navigation?.companionUuid && linkedContext && !linkedContext.companion)
    ui.notifications.warn(t("Companions.Unavailable"));
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

  const selection = linkedContext
    ? {
        actor: linkedContext.actor,
        token: linkedContext.companion
          ? linkedContext.token
          : navigation?.ownerTokenUuid
            ? await worldDocument(navigation.ownerTokenUuid)
            : null
      }
    : gmActive
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
  const reuseCompanion =
    linkedContext &&
    state.preset === "player" &&
    (state.actorUuid === linkedContext.owner.uuid ||
      state.companionNavigation?.ownerUuid === linkedContext.owner.uuid);
  const reusedApp =
    state.app?.rendered &&
    ((gmActive && state.preset === "gm") || reuseCompanion)
      ? state.app
      : null;
  const session = {};
  const actorContext = selection
    ? createHudActorContext({
        ...selection,
        ownerTokenUuid:
          linkedContext && !linkedContext.companion
            ? (navigation?.ownerTokenUuid ?? null)
            : null,
        combatantId: gmCombatant?.id,
        requireToken: Boolean(linkedContext?.companion),
        getCombat: () =>
          gmController ? gmController.getCombat() : getCurrentCombat(game)
      })
    : null;
  if (state.app?.rendered && !reusedApp) {
    await flushWindowGeometry();
    await state.app.close();
  }

  recordDiagnostic(
    "hud.session.transition",
    {
      actor: diagnosticRef(actorContext?.actor, "actor"),
      token: diagnosticRef(actorContext?.token, "token"),
      owner: diagnosticRef(linkedContext?.owner, "actor"),
      replaced: Boolean(state.session)
    },
    { detailed: true }
  );
  state.session = session;
  state.actorUuid = actorContext?.actorUuid ?? null;
  state.actor = actorContext?.actor ?? null;
  state.tokenUuid = actorContext?.tokenUuid ?? null;
  state.preset = gmActive ? "gm" : "player";
  state.companionNavigation = linkedContext?.companion
    ? {
        ownerUuid: linkedContext.owner.uuid,
        companionUuid: linkedContext.companion?.uuid ?? null,
        tokenUuid: linkedContext.companion?.token?.uuid ?? null,
        ownerTokenUuid: navigation?.ownerTokenUuid ?? null
      }
    : null;

  recordDiagnostic(
    "hud.session.context",
    {
      actor: diagnosticRef(state.actor, "actor"),
      token: diagnosticRef(actorContext?.token, "token")
    },
    { detailed: true }
  );
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
    gmCombatant,
    companionOwner: linkedContext?.owner ?? null,
    focusToken: Boolean(requestedNavigation && linkedContext),
    companion: linkedContext?.companion ?? null
  };
}
