import { gmRoster, defeated, hasPlayerOwner } from "./gm-combat.js";

export function deadCreatures(combat) {
  return gmRoster(combat, {
    isGM: Boolean(game.user?.isGM),
    sceneId: canvas.scene?.id,
    includePlayerNpcs: true
  }).filter(
    entry =>
      (entry.token.actor ?? entry.actor)?.type === "npc" &&
      defeated(entry) &&
      !hasPlayerOwner(entry)
  );
}

// Only tokens of this encounter are removed. Actor directory documents are never deleted.
let removalQueue = Promise.resolve();

export function removeDeadCreatures(
  combat,
  ids,
  canExecute = () => true,
  targets = null
) {
  const captured =
    targets ??
    deadCreatures(combat)
      .filter(entry => ids.includes(entry.id))
      .map(entry => ({ entry, token: entry.token }));
  const task = removalQueue.then(() =>
    deleteDeadTokens(combat, captured, canExecute)
  );
  removalQueue = task.catch(() => {});
  return task;
}

async function deleteDeadTokens(combat, targets, canExecute) {
  if (!canExecute() || !game.user?.isGM || !combat) return 0;
  const scene = canvas.scene;
  const tokens = [
    ...new Map(targets.map(({ token }) => [token.id, token])).values()
  ];
  if (!tokens.length) return 0;
  let deletedCount = 0;
  for (const token of tokens) {
    if (!canExecute() || !game.user?.isGM) break;
    // Use the actual token document and its parent, including unlinked/global encounters.
    if (canvas.scene !== scene || token.parent !== scene) continue;
    if (scene.tokens?.get && scene.tokens.get(token.id) !== token) continue;
    const addressed = targets.filter(target => target.token === token);
    if (
      token.isOwner === false ||
      !token.actor?.isOwner ||
      addressed.some(
        ({ entry }) =>
          combat.combatants?.get?.(entry.id) !== entry ||
          entry.token !== token ||
          hasPlayerOwner(entry) ||
          !defeated(entry)
      )
    )
      continue;
    const deleted = await token.delete();
    if (deleted) {
      deletedCount++;
      // Some integrations leave the encounter entry after deleting its token.
      // Native cascades may already have removed it, so delete only survivors.
      const survivors = addressed
        .map(({ entry }) => entry)
        .filter(
          entry =>
            entry.tokenId === token.id &&
            entry.sceneId === scene.id &&
            combat.combatants?.get(entry.id) === entry
        );
      if (
        survivors.length &&
        canExecute() &&
        canvas.scene === scene &&
        game.user?.isGM
      )
        await combat.deleteEmbeddedDocuments(
          "Combatant",
          survivors.map(entry => entry.id)
        );
    }
  }
  return deletedCount;
}

export async function moveToCreature(combatant, { ping = false } = {}) {
  if (!game.user?.isGM || combatant?.sceneId !== canvas.scene?.id) return;
  const token = canvas.tokens.get(combatant.tokenId);
  if (!token) return;
  if (ping) return canvas.ping(token.center);
  token.control({ releaseOthers: true });
  return canvas.animatePan(token.center);
}

export async function createSceneCombat() {
  if (!game.user?.isGM || !canvas.scene) return null;
  const Combat = foundry.utils.getDocumentClass("Combat");
  return Combat.create({ scene: canvas.scene.id, active: true });
}

export function addGmCreatures(combat) {
  return addSceneCreatures(combat, { gmOnly: true });
}

export async function addSceneCreatures(combat, { gmOnly = false } = {}) {
  if (!game.user?.isGM || !canvas.scene || !combat) return [];
  const occupied = new Set(
    [...combat.combatants.values()]
      .filter(entry => entry.sceneId === canvas.scene.id)
      .map(entry => entry.tokenId)
  );
  const tokens = [...canvas.scene.tokens.values()].filter(
    token =>
      token.actor &&
      !occupied.has(token.id) &&
      (!gmOnly ||
        (token.actor.type === "npc" &&
          token.actor.isOwner &&
          ![...game.users.values()].some(
            user =>
              user.active &&
              !user.isGM &&
              token.actor.testUserPermission(user, "OWNER")
          )))
  );
  if (!tokens.length) return [];
  const Token = foundry.utils.getDocumentClass("Token");
  return Token.createCombatants(tokens, { combat });
}
