// @ts-check
/** Reject delayed work after navigation, deletion or synthetic Actor replacement.
 * @param {{actorContext: import('../../types/hud.js').ActorContext, isCurrent: () => boolean}} options
 */
export function createActorSessionGuard({ actorContext, isCurrent }) {
  return () =>
    isCurrent() &&
    resolveSessionActor(actorContext)?.actor === actorContext.actor;
}

/** Resolve the exact token, including synthetic Actor instance replacement.
 * @param {import('../../types/hud.js').ActorContext} actorContext
 * @returns {{actor: any, token: any} | null}
 */
export function resolveSessionActor(actorContext) {
  const { actor, token } = actorContext;
  const document = token?.document ?? token ?? actor.token;
  if (document) {
    const scene = game.scenes?.get?.(document.parent?.id) ?? document.parent;
    const current = scene?.tokens?.get?.(document.id);
    return current?.uuid === document.uuid && current.actor
      ? { actor: current.actor, token: current }
      : null;
  }
  const current = game.actors?.get?.(actor.id);
  return current?.uuid === actor.uuid ? { actor: current, token: null } : null;
}
