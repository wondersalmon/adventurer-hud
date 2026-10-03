import { beginDiagnostic, diagnosticRef } from "../diagnostics.js";
/** Find the displayed token without substituting another synthetic actor. */
/** @param {{actor: any, token?: any, ownerTokenUuid?: string | null}} options */
export function hudSceneTokens({ actor, token, ownerTokenUuid = null }) {
  const document =
    token?.document ??
    token ??
    actor?.token ??
    (ownerTokenUuid
      ? [...(canvas.scene?.tokens?.values?.() ?? [])].find(
          candidate => candidate.uuid === ownerTokenUuid
        )
      : null);
  if (ownerTokenUuid && !document) return [];
  if (document) {
    if (document.parent?.id !== canvas.scene?.id) return [];
    const current = canvas.scene?.tokens?.get?.(document.id);
    return current?.uuid === document.uuid &&
      (current.actor === actor ||
        (!actor?.isToken && current.baseActor === actor))
      ? [current]
      : [];
  }
  return [...(canvas.scene?.tokens?.values?.() ?? [])].filter(
    candidate =>
      candidate.actor === actor ||
      (!actor?.isToken && candidate.baseActor === actor)
  );
}

export async function focusHudToken(
  context,
  { releaseOthers = true, pan = true } = {}
) {
  const trace = beginDiagnostic("hud.token.focus", {
    actor: diagnosticRef(context.actor, "actor"),
    pan
  });
  const reject = reason => {
    trace.finish("rejected", reason);
    return reason;
  };
  try {
    if (!context.actor?.isOwner) return reject("Warnings.NoPermission");
    const candidates = hudSceneTokens(context);
    if (!candidates.length) return reject("Actor.TokenNotOnScene");
    const selected = candidates.filter(candidate =>
      canvas.tokens?.controlled?.some(
        token => (token.document ?? token).uuid === candidate.uuid
      )
    );
    const token = selected.length === 1 ? selected[0] : candidates[0];
    if (selected.length !== 1 && candidates.length > 1)
      return reject("Warnings.OneToken");
    const placeable = canvas.tokens?.get?.(token.id);
    if (placeable?.document && placeable.document !== token)
      return reject("Actor.TokenNotOnScene");
    if (
      !placeable ||
      !token.actor?.isOwner ||
      (token.hidden && !game.user?.isGM)
    )
      return reject("Warnings.NoPermission");
    // An owned token can be outside the current token's vision. Native control
    // switches vision; force only bypasses canvas interaction visibility here.
    if (
      !placeable.control({
        releaseOthers,
        ...(placeable.visible ? {} : { force: true })
      })
    )
      return reject("Warnings.NoPermission");
    trace.step("controlled", {
      token: diagnosticRef(token, "token"),
      requested: candidates.length,
      controlled: true
    });
    if (pan) await canvas.animatePan(placeable.center);
    trace.finish("completed", null, { pan, controlled: true });
    return null;
  } catch (error) {
    trace.finish("error", "native-error");
    throw error;
  }
}
