import { beginDiagnostic, diagnosticRef } from "../../diagnostics.js";
import {
  companionOnScene,
  sceneTokensForActor,
  worldDocument
} from "./companions.js";

/** Permission checks for Foundry's native cursor placement workflow. */
export function companionPlacementReason(entry, { sceneTokens = null } = {}) {
  if (!entry?.actor?.isOwner) return "no-permission";
  if (!entry.uuid.startsWith("Actor.")) return "token-only";
  if (
    companionOnScene(entry) ||
    (sceneTokens ?? sceneTokensForActor(entry.actor, { owned: false })).length
  )
    return "already-on-scene";
  if (!canvas.scene) return "no-scene";
  if (!canvas.tokens?.placeTokens) return "native-placement-unavailable";
  if (!CONFIG.Token?.documentClass?.canUserCreate?.(game.user))
    return "no-create-permission";
  if (game.paused && !game.user?.isGM) return "game-paused";
  return null;
}
export function canPlaceCompanion(entry, options = {}) {
  return companionPlacementReason(entry, options) === null;
}

export function createCompanionPlacement({
  resolved,
  isCurrent,
  refreshHud,
  onPlaced,
  t
}) {
  let placing = null;
  return {
    get busy() {
      return Boolean(placing);
    },
    async place(uuid) {
      if (placing || !isCurrent()) return;
      const trace = beginDiagnostic("hud.companion.place");
      const operation = {
        scene: canvas.scene,
        layer: canvas.tokens,
        preview: false
      };
      placing = operation;
      refreshHud();
      try {
        const entry = await resolved(uuid);
        if (!isCurrent()) return;
        if (!canPlaceCompanion(entry)) {
          trace.finish("rejected", companionPlacementReason(entry), {
            actor: diagnosticRef(entry?.actor, "actor"),
            permission: Boolean(entry?.actor?.isOwner),
            paused: Boolean(game.paused),
            exists: companionOnScene(entry)
          });
          return ui.notifications.warn(t("Companions.PlacePermission"));
        }
        // Token-only entries already exist on the scene; place world prototypes.
        const source = await worldDocument(uuid);
        if (!isCurrent() || !source || !(source.actor ?? source).isOwner)
          return;
        const document = await source.getTokenDocument(
          { level: canvas.level?.id },
          { parent: operation.scene }
        );
        const data = document.toObject();
        delete data._id;
        if (!isCurrent() || canvas.scene !== operation.scene) return;
        const stillAllowed = async () => {
          const current = await resolved(uuid);
          const currentSource = await worldDocument(uuid);
          const stale =
            !isCurrent() ||
            canvas.scene !== operation.scene ||
            currentSource !== source;
          const reason = stale
            ? "session-or-source-replaced"
            : !(currentSource.actor ?? currentSource).isOwner
              ? "no-permission"
              : companionPlacementReason(current);
          if (reason) trace.finish(stale ? "stale" : "rejected", reason);
          return !reason;
        };
        if (!(await stillAllowed())) return;
        operation.layer.activate();
        operation.preview = true;
        trace.step("native-preview", { actor: diagnosticRef(source, "actor") });
        const tokens = await operation.layer.placeTokens([data], {
          createOptions: { controlObject: false },
          preConfirm: () => {
            const stale = !isCurrent() || canvas.scene !== operation.scene;
            const reason = stale
              ? "session-or-source-replaced"
              : companionPlacementReason(entry);
            if (reason) trace.finish(stale ? "stale" : "rejected", reason);
            return !reason;
          },
          preCommit: stillAllowed
        });
        operation.preview = false;
        if (isCurrent() && canvas.scene === operation.scene && tokens?.length)
          await onPlaced(tokens[0]);
        trace.finish(
          !isCurrent() ? "stale" : tokens?.length ? "completed" : "cancelled",
          !isCurrent()
            ? "session-replaced"
            : tokens?.length
              ? null
              : "placement-cancelled",
          { processed: tokens?.length ?? 0 }
        );
      } catch (error) {
        trace.finish("error", "placement-failed");
        throw error;
      } finally {
        trace.finish("stale", "placement-preconditions-changed");
        if (placing === operation) placing = null;
        if (isCurrent()) refreshHud();
      }
    },
    dispose() {
      // Deactivating the native layer cancels its pending placement and listeners.
      if (placing?.preview && placing.layer === canvas.tokens)
        placing.layer.deactivate();
    }
  };
}
