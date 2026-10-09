// Native free-form rolls keep Foundry's dice evaluation and chat visibility.
export async function rollDiceTray(
  actor,
  formula,
  isCurrent,
  onResult,
  messageMode
) {
  const canRoll = () => Boolean(globalThis.game?.user?.isGM || actor?.isOwner);
  if (!canRoll() || !isCurrent()) return;
  const roll = new foundry.dice.Roll(formula, actor?.getRollData?.() ?? {});
  await roll.evaluate();
  if (!canRoll() || !isCurrent()) return;
  await roll.toMessage(
    { speaker: CONFIG.ChatMessage.documentClass.getSpeaker({ actor }) },
    { messageMode: messageMode ?? game.settings.get("core", "messageMode") }
  );
  if (canRoll() && isCurrent()) onResult?.(roll);
  return roll.total;
}
