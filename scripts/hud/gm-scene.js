import { gmRoster, defeated } from "./gm-combat.js";

export function deadCreatures(combat) {
  return gmRoster(combat, {
    isGM: Boolean(game.user?.isGM),
    sceneId: canvas.scene?.id,
    includePlayerNpcs: false
  }).filter(defeated);
}

// Only tokens of this encounter are removed. Actor directory documents are never deleted.
let removalQueue = Promise.resolve();

export function removeDeadCreatures(combat, ids) {
  const task = removalQueue.then(() => deleteDeadTokens(combat, ids));
  removalQueue = task.catch(() => {});
  return task;
}

async function deleteDeadTokens(combat, ids) {
  if (!game.user?.isGM || !combat) return 0;
  const candidates = deadCreatures(combat).filter(entry =>
    ids.includes(entry.id)
  );
  const tokens = [
    ...new Map(candidates.map(entry => [entry.token.id, entry.token])).values()
  ];
  if (!tokens.length) return 0;
  let deletedCount = 0;
  for (const token of tokens) {
    // Use the actual token document and its parent, including unlinked/global encounters.
    if (token.parent?.id !== canvas.scene?.id) continue;
    const deleted = await token.delete();
    if (deleted) {
      deletedCount++;
    }
  }
  // TokenDocument deletion already removes associated Combatants in Foundry.
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
