import { getSetting, SETTINGS } from "../../settings-access.js";
import { findCombatant, getCurrentCombat } from "../../runtime-helpers.js";
import {
  reportFailure,
  recordDiagnostic,
  diagnosticRef
} from "../../diagnostics.js";
import { focusHudToken, hudSceneTokens } from "../token-focus.js";
import {
  createSharedVisionSource,
  supportsSharedVision,
  missingSharedVisionCapabilities
} from "./shared-vision-source.js";

/** A temporary native vision source; actor data and token sight are unchanged. */
export function createFamiliarVision({
  actorContext,
  adapter,
  isCurrent,
  refreshHud,
  t
}) {
  /** @type {{uuid: string, name: string, token: any, ownerToken: any, placeable: any, combat: any, round: number, leftOwner: boolean, until: number, source: ReturnType<typeof createSharedVisionSource> | null} | null} */
  let active = null;
  let changing = false;
  let busy = false;
  let revision = 0;
  const hooks = [];
  const report = error => reportFailure("hud.familiar.vision", error, { t });
  const controlled = token =>
    canvas.tokens?.controlled?.some(
      placeable => (placeable.document ?? placeable).uuid === token.uuid
    );
  const placeableFor = token => {
    if (
      token.parent?.id !== canvas.scene?.id ||
      canvas.scene.tokens.get(token.id) !== token
    )
      return null;
    const placeable = canvas.tokens?.get?.(token.id);
    return placeable?.document === token &&
      token.actor?.isOwner &&
      (!token.hidden || game.user?.isGM)
      ? placeable
      : null;
  };
  const ownerCombatant = (combat, token) =>
    findCombatant(combat?.combatants, {
      tokenId: token.id,
      sceneId: token.parent.id
    });
  const ownerTokenFor = () => {
    const candidates = hudSceneTokens(actorContext);
    const selected = candidates.filter(controlled);
    if (selected.length === 1) return selected[0];
    if (candidates.length === 1) return candidates[0];
    const combat = getCurrentCombat(game);
    return combat?.combatant
      ? (candidates.find(
          token => ownerCombatant(combat, token)?.id === combat.combatant.id
        ) ?? null)
      : null;
  };
  const eligibility = entry => {
    if (active?.uuid === entry.uuid) return null;
    if (active) return "Companions.VisionAlreadyActive";
    if (!entry.actor?.isOwner || !actorContext.actor.isOwner)
      return "Companions.NoPermission";
    const tokens = entry.token ? [entry.token] : entry.tokenOptions;
    if (!tokens?.length) return "Companions.OffScene";
    if (!tokens.some(token => placeableFor(token)))
      return "Companions.NoPermission";
    if (!tokens.some(token => placeableFor(token) && token.sight?.enabled))
      return "Companions.VisionDisabled";
    if (!tokens.some(token => supportsSharedVision(placeableFor(token))))
      return "Companions.VisionUnsupported";
    if (entry.token && adapter.combatStats(entry.actor).hp.value <= 0)
      return "Companions.VisionUnavailable";
    const ownerToken = ownerTokenFor();
    if (!ownerToken)
      return hudSceneTokens(actorContext).length
        ? "Warnings.OneToken"
        : "Actor.TokenNotOnScene";
    if (!placeableFor(ownerToken)) return "Actor.TokenNotOnScene";
    const combat = getCurrentCombat(game);
    const owner = ownerCombatant(combat, ownerToken);
    return combat?.started && (!owner || combat.combatant?.id !== owner.id)
      ? "Companions.VisionOwnTurn"
      : null;
  };
  const availability = new Map();
  const warning = entry => {
    const reason = eligibility(entry);
    if (availability.get(entry.uuid) !== reason) {
      if (availability.size >= 512)
        availability.delete(availability.keys().next().value);
      availability.set(entry.uuid, reason);
      recordDiagnostic(
        "hud.vision.availability",
        {
          actor: diagnosticRef(entry.actor, "actor"),
          token: diagnosticRef(entry.token, "token"),
          active: Boolean(active),
          missing:
            reason === "Companions.VisionUnsupported"
              ? [
                  ...new Set(
                    (entry.token
                      ? [entry.token]
                      : (entry.tokenOptions ?? [])
                    ).flatMap(token =>
                      missingSharedVisionCapabilities(placeableFor(token))
                    )
                  )
                ]
              : []
        },
        { outcome: reason ? "unavailable" : "available", reason }
      );
    }
    return reason;
  };
  const stop = async ({
    pan = true,
    restore = true,
    reason = "user-stop"
  } = {}) => {
    revision++;
    const previous = active;
    active = null;
    if (!previous) return;
    recordDiagnostic(
      "hud.vision.stop",
      {
        token: diagnosticRef(previous.token, "token"),
        owner: diagnosticRef(previous.ownerToken, "token")
      },
      { outcome: "completed", reason }
    );
    try {
      previous.source?.dispose();
      // Removing a vision source must not change manual token selection.
      if (
        restore &&
        pan &&
        getSetting(SETTINGS.companionVisionPan) &&
        controlled(previous.ownerToken) &&
        placeableFor(previous.ownerToken)
      )
        await canvas.animatePan(placeableFor(previous.ownerToken).center);
    } finally {
      if (isCurrent()) refreshHud();
    }
  };
  const validate = entries => {
    if (!active) return;
    const state = active;
    const combat = getCurrentCombat(game);
    const invalid =
      !actorContext.actor.isOwner ||
      !placeableFor(state.ownerToken) ||
      placeableFor(state.token) !== state.placeable ||
      adapter.combatStats(state.token.actor).hp.value <= 0 ||
      !state.token.sight?.enabled ||
      (entries &&
        !entries.some(
          entry => entry.uuid === state.uuid && entry.actor?.isOwner
        ));
    let expired = false;
    if (state.combat) {
      const owner = ownerCombatant(combat, state.ownerToken);
      const isOwnerTurn = combat?.combatant?.id === owner?.id;
      const turns = combat?.turns ?? [];
      const ownerIndex = turns.findIndex(turn => turn.id === owner?.id);
      expired =
        combat !== state.combat ||
        !combat?.started ||
        !owner ||
        Number(combat.round) < state.round ||
        (Number(combat.round) > state.round &&
          (isOwnerTurn ||
            (ownerIndex >= 0 && Number(combat.turn) >= ownerIndex))) ||
        (state.leftOwner && isOwnerTurn);
      if (!isOwnerTurn) state.leftOwner = true;
    } else {
      expired =
        Boolean(combat?.started) ||
        Number(game.time?.worldTime ?? 0) >= state.until;
    }
    if (invalid || expired)
      void stop({
        reason: invalid ? "source-invalid" : "duration-ended"
      }).catch(report);
  };
  return {
    get active() {
      return active;
    },
    warning,
    async toggle(entry) {
      if (busy || !isCurrent()) return;
      if (active?.uuid === entry.uuid) return stop();
      if (active)
        return ui.notifications.warn(t("Companions.VisionAlreadyActive"));
      if (!entry.token || !entry.actor?.isOwner || !actorContext.actor.isOwner)
        return ui.notifications.warn(t("Companions.NoPermission"));
      const reason = warning(entry);
      if (reason) return ui.notifications.warn(t(reason));
      const ownerToken = ownerTokenFor();
      const placeable = placeableFor(entry.token);
      if (!placeable || !placeableFor(ownerToken))
        return ui.notifications.warn(t("Companions.OffScene"));
      if (!entry.token.sight?.enabled)
        return ui.notifications.warn(t("Companions.VisionDisabled"));
      if (adapter.combatStats(entry.actor).hp.value <= 0)
        return ui.notifications.warn(t("Companions.VisionUnavailable"));
      const combat = getCurrentCombat(game);
      const owner = ownerCombatant(combat, ownerToken);
      if (combat?.started && (!owner || combat.combatant?.id !== owner.id))
        return ui.notifications.warn(t("Companions.VisionOwnTurn"));
      busy = true;
      const operation = ++revision;
      active = {
        uuid: entry.uuid,
        name: entry.token.name ?? entry.actor.name,
        token: entry.token,
        placeable,
        ownerToken,
        combat: combat?.started ? combat : null,
        round: Number(combat?.round ?? 0),
        leftOwner: false,
        until: Number(game.time?.worldTime ?? 0) + 6,
        source: null
      };
      const state = active;
      try {
        // Only the caster remains controlled; both native sources contribute sight.
        changing = true;
        const ownerFocus = focusHudToken(
          { actor: ownerToken.actor, token: ownerToken },
          { pan: false }
        );
        changing = false;
        const warning = await ownerFocus;
        if (!isCurrent() || revision !== operation) return;
        if (warning) {
          await stop({ pan: false });
          return ui.notifications.warn(t(warning));
        }
        state.source = createSharedVisionSource(
          placeable,
          () =>
            active === state &&
            isCurrent() &&
            placeableFor(state.token) === placeable &&
            placeableFor(state.ownerToken) &&
            controlled(state.ownerToken) &&
            actorContext.actor.isOwner &&
            state.token.sight?.enabled &&
            adapter.combatStats(state.token.actor).hp.value > 0 &&
            canvas.visibility?.tokenVision !== false &&
            !placeable.isPreview &&
            !placeable.isFilteredOut
        );
        state.source.refresh();
        recordDiagnostic(
          "hud.vision.start",
          {
            token: diagnosticRef(state.token, "token"),
            owner: diagnosticRef(state.ownerToken, "token"),
            controlled: controlled(state.ownerToken),
            sight: true,
            alive: true
          },
          { outcome: "completed" }
        );
        refreshHud();
        if (getSetting(SETTINGS.companionVisionPan))
          await canvas.animatePan(placeable.center);
      } catch (error) {
        if (revision === operation) await stop({ pan: false });
        throw error;
      } finally {
        changing = false;
        busy = false;
      }
    },
    stop,
    validate,
    start() {
      for (const hook of [
        "updateCombat",
        "deleteCombat",
        "deleteCombatant",
        "updateWorldTime"
      ])
        hooks.push([hook, Hooks.on(hook, () => validate())]);
      hooks.push([
        "controlToken",
        Hooks.on("controlToken", () => {
          if (
            !changing &&
            active &&
            (!controlled(active.ownerToken) ||
              (canvas.tokens?.controlled ?? []).some(
                placeable =>
                  (placeable.document ?? placeable).uuid !==
                  active.ownerToken.uuid
              ))
          )
            void stop({
              restore: false,
              pan: false,
              reason: "selection-or-scene-changed"
            }).catch(report);
        })
      ]);
      hooks.push([
        "canvasTearDown",
        Hooks.on("canvasTearDown", () => {
          void stop({
            restore: false,
            pan: false,
            reason: "selection-or-scene-changed"
          }).catch(report);
        })
      ]);
    },
    dispose() {
      hooks.forEach(([hook, id]) => Hooks.off(hook, id));
      void stop({ pan: false, reason: "session-disposed" }).catch(report);
    }
  };
}
