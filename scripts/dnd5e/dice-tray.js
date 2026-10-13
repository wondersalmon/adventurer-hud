// @ts-check
// Native free-form rolls keep Foundry's dice evaluation and chat visibility.
/** @param {string} formula */
export const diceTrayExpression = formula =>
  formula
    .trim()
    .replace(/^\/(?:roll|r)(?:\s+|$)/i, "")
    .trim();

/**
 * @param {any} actor Native Foundry Actor.
 * @param {string} formula
 * @param {() => boolean} isCurrent
 * @param {((roll: any) => void) | undefined} [onResult] Native Foundry Roll.
 * @param {string | undefined} [messageMode]
 */
export async function rollDiceTray(
  actor,
  formula,
  isCurrent,
  onResult,
  messageMode
) {
  const canRoll = () =>
    Boolean((typeof game !== "undefined" && game.user?.isGM) || actor?.isOwner);
  if (!canRoll() || !isCurrent()) return;
  const expression = diceTrayExpression(formula);
  if (!expression) return;
  const roll = new foundry.dice.Roll(expression, actor?.getRollData?.() ?? {});
  await roll.evaluate();
  if (!canRoll() || !isCurrent()) return;
  await roll.toMessage(
    { speaker: CONFIG.ChatMessage.documentClass.getSpeaker({ actor }) },
    { messageMode: messageMode ?? game.settings.get("core", "messageMode") }
  );
  if (canRoll() && isCurrent()) onResult?.(roll);
  return roll.total;
}
