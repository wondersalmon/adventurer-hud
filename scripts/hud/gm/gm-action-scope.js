// @ts-check
/** Capture a scene command independently of the displayed Actor.
 * @param {import('../../../types/hud.js').GmController | null | undefined} controller
 * @param {() => boolean} isCurrent
 * @param {{checkCombat?: boolean}} options
 */
export function createGmActionScope(
  controller,
  isCurrent,
  { checkCombat = true } = {}
) {
  const combat = controller?.getCombat();
  const currentScene = () =>
    typeof canvas === "undefined" ? undefined : canvas.scene;
  const scene = currentScene();
  return () =>
    Boolean(
      isCurrent() &&
      controller?.isGM() &&
      currentScene() === scene &&
      (!checkCombat || controller.getCombat() === combat)
    );
}
