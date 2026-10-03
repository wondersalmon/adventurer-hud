// @ts-check
/** Reject delayed work after navigation, deletion or synthetic Actor replacement.
 * @param {{actorContext: import('../../types/hud.js').ActorContext, isCurrent: () => boolean}} options
 */
export function createActorSessionGuard({ actorContext, isCurrent }) {
  return () => {
    if (!isCurrent()) return false;
    const { actor, token } = actorContext;
    const document = token?.document ?? token ?? actor.token;
    if (document) {
      const scene = game.scenes?.get?.(document.parent?.id) ?? document.parent;
      const current = scene?.tokens?.get?.(document.id);
      return current?.uuid === document.uuid && current.actor === actor;
    }
    return game.actors?.get?.(actor.id) === actor;
  };
}
