// @ts-check
const actorUuid = /^Actor\.[^.]+$/;
const tokenUuid = /^Scene\.[^.]+\.Token\.[^.]+$/;
const supported = actor => ["character", "npc"].includes(actor?.type);

/** @param {string | null | undefined} uuid */
export async function worldDocument(uuid) {
  if (typeof uuid !== "string") return null;
  const document = await fromUuid(uuid);
  if (document) return document;
  if (actorUuid.test(uuid)) return game.actors?.get(uuid.slice(6)) ?? null;
  const parts = tokenUuid.test(uuid) ? uuid.split(".") : null;
  return parts
    ? (game.scenes?.get(parts[1])?.tokens?.get(parts[3]) ?? null)
    : null;
}

/** One fresh index per roster read; actions always build a new one.
 * @param {any} owner Native Actor.
 */
function companionIndex(owner) {
  /** @type {Map<string, import('../../../types/hud.js').CompanionReference>} */
  const references = new Map();
  /** @type {Map<string, any[]>} */
  const tokensByActor = new Map();
  if (!owner?.isOwner) return { references, tokensByActor };
  const mainIds = new Set([owner.id, game.user?.character?.id].filter(Boolean));
  for (const actor of game.actors?.values?.() ?? []) {
    if (supported(actor) && actor.isOwner && !mainIds.has(actor.id))
      references.set(actor.uuid, { uuid: actor.uuid, actor });
  }
  for (const token of canvas.scene?.tokens?.values?.() ?? []) {
    if (!supported(token.actor)) continue;
    const keys = new Set(
      [`id:${token.actorId}`, token.baseActor?.uuid, token.actor?.uuid].filter(
        Boolean
      )
    );
    for (const key of keys) {
      const tokens = tokensByActor.get(key) ?? [];
      tokens.push(token);
      tokensByActor.set(key, tokens);
    }
    if (
      !supported(token.actor) ||
      !token.actor.isOwner ||
      mainIds.has(token.actor.id)
    )
      continue;
    const base = token.baseActor ?? game.actors?.get(token.actorId);
    if (references.has(base?.uuid)) continue;
    references.set(token.uuid, { uuid: token.uuid, actor: token.actor, token });
  }
  return { references, tokensByActor };
}

/** One entry per world actor; token-only ownership retains its exact identity.
 * @param {any} owner
 */
export function ownedCompanionReferences(owner) {
  return [...companionIndex(owner).references.values()];
}

export function sceneTokensForActor(actor, { owned = true } = {}) {
  return [...(canvas.scene?.tokens?.values?.() ?? [])].filter(
    token =>
      (token.actorId === actor.id ||
        token.baseActor?.uuid === actor.uuid ||
        token.actor?.uuid === actor.uuid) &&
      supported(token.actor) &&
      (!owned || token.actor.isOwner)
  );
}

export function companionOnScene(entry) {
  return Boolean(
    canvas.scene &&
    (entry?.token?.parent?.id === canvas.scene.id ||
      entry?.sceneTokens?.length ||
      entry?.tokenOptions?.length)
  );
}

/** @param {any} owner
 * @param {{uuid: string}} reference
 * @param {string | null} [selectedTokenUuid]
 * @returns {Promise<import('../../../types/hud.js').CompanionEntry>}
 */
export async function resolveCompanion(
  owner,
  reference,
  selectedTokenUuid = null
) {
  return resolveIndexedCompanion(
    owner,
    reference,
    selectedTokenUuid,
    companionIndex(owner)
  );
}

/** @param {any} owner
 * @param {{uuid: string}} reference
 * @param {string | null} selectedTokenUuid
 * @param {ReturnType<typeof companionIndex>} index
 * @returns {import('../../../types/hud.js').CompanionEntry}
 */
function resolveIndexedCompanion(owner, reference, selectedTokenUuid, index) {
  const unavailable = {
    uuid: reference?.uuid,
    actor: null,
    token: null,
    tokenOptions: [],
    sceneTokens: [],
    reason: "Companions.Unavailable"
  };
  const current = index.references.get(reference?.uuid);
  if (!current || (selectedTokenUuid && !tokenUuid.test(selectedTokenUuid)))
    return unavailable;
  const sceneTokens = current.token
    ? [current.token]
    : (index.tokensByActor.get(`id:${current.actor.id}`) ??
      index.tokensByActor.get(current.actor.uuid) ??
      []);
  const tokenOptions = sceneTokens.filter(token => token.actor?.isOwner);
  let token =
    current.token ?? (tokenOptions.length === 1 ? tokenOptions[0] : null);
  if (selectedTokenUuid) {
    token =
      tokenOptions.find(token => token.uuid === selectedTokenUuid) ?? null;
    if (!token) return unavailable;
  }
  const actor = token?.actor ?? current.actor;
  return owner.isOwner && actor?.isOwner
    ? {
        uuid: current.uuid,
        actor,
        token,
        tokenOptions,
        sceneTokens,
        reason: null
      }
    : unavailable;
}

/** @param {any} owner */
export async function ownedCompanions(owner) {
  const index = companionIndex(owner);
  return [...index.references.values()]
    .map(reference => resolveIndexedCompanion(owner, reference, null, index))
    .filter(entry => entry.actor);
}

/** @param {import('../../../types/hud.js').CompanionNavigation} navigation */
export async function companionNavigationContext(navigation) {
  const owner = await worldDocument(navigation.ownerUuid);
  if (owner?.type !== "character") return null;
  if (!navigation.companionUuid || !owner.isOwner)
    return { owner, actor: owner, token: null, companion: null };
  const companion = await resolveCompanion(
    owner,
    { uuid: navigation.companionUuid },
    navigation.tokenUuid
  );
  return {
    owner,
    actor: companion.actor ?? owner,
    token: companion.token,
    companion: companion.actor ? companion : null
  };
}
