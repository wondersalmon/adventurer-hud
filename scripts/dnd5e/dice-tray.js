// Native free-form rolls keep Foundry's dice evaluation and chat visibility.
export async function rollDiceTray(actor, formula, isCurrent, onResult) {
  if (!actor?.isOwner || !isCurrent()) return;
  const roll = new foundry.dice.Roll(formula, actor.getRollData());
  await roll.evaluate();
  if (!actor.isOwner || !isCurrent()) return;
  await roll.toMessage(
    { speaker: CONFIG.ChatMessage.documentClass.getSpeaker({ actor }) },
    { messageMode: game.settings.get("core", "messageMode") }
  );
  if (actor.isOwner && isCurrent()) onResult?.(roll);
  return roll.total;
}
