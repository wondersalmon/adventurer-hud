// @ts-check
import { ownedCompanions, worldDocument } from "./companions.js";
import { createLatestRefresh } from "../async-refresh.js";
import {
  recordDiagnostic,
  diagnosticRef,
  reportFailure
} from "../../diagnostics.js";
/** @param {import('../../../types/hud.js').CompanionPanelOptions} options @param {import('../../../types/hud.js').CompanionRosterDependencies} dependencies */
export async function createCompanionRosterSession(
  {
    owner,
    companion,
    actorContext,
    hudState,
    isCurrent,
    refreshHud,
    closeHud,
    t
  },
  { resolved, navigateTo, vision }
) {
  let entries = await ownedCompanions(owner);
  const trackedActors = new Set();
  const trackActors = () => {
    trackedActors.clear();
    for (const uuid of [
      owner.uuid,
      actorContext.actorUuid,
      (actorContext.token?.document ?? actorContext.token)?.baseActor?.uuid
    ])
      if (uuid) trackedActors.add(uuid);
    for (const entry of entries) {
      trackedActors.add(entry.uuid);
      if (entry.actor?.uuid) trackedActors.add(entry.actor.uuid);
      for (const token of entry.tokenOptions) {
        if (token.actor?.uuid) trackedActors.add(token.actor.uuid);
        if (token.baseActor?.uuid) trackedActors.add(token.baseActor.uuid);
      }
    }
  };
  trackActors();

  let started = false;
  let transitioning = false;
  /** @type {[string, number][]} */
  const hooks = [];
  const report = error => reportFailure("hud.companions.context", error, { t });
  const refresh = createLatestRefresh({
    load: async () => {
      const currentOwner = await worldDocument(owner.uuid);
      return {
        owner: currentOwner,
        companion: companion
          ? await resolved(companion.uuid, actorContext.tokenUuid)
          : null,
        entries: currentOwner ? await ownedCompanions(currentOwner) : []
      };
    },
    isCurrent: () => started && !transitioning && isCurrent(),
    apply: next => {
      if (!next.owner) {
        transitioning = true;
        void Promise.resolve(closeHud()).catch(report);
        return;
      }
      if (!companion && next.owner !== actorContext.actor) {
        transitioning = true;
        void navigateTo(null).catch(error => {
          transitioning = false;
          report(error);
        });
        return;
      }
      if (companion && next.companion?.actor !== actorContext.actor) {
        transitioning = true;
        void navigateTo(
          next.companion?.actor ? companion.uuid : null,
          next.companion?.token?.uuid
        ).catch(error => {
          transitioning = false;
          report(error);
        });
        return;
      }
      entries = next.entries;
      recordDiagnostic(
        "hud.companions.roster",
        {
          owner: diagnosticRef(owner, "actor"),
          count: entries.length,
          filter: hudState.companionFilter
        },
        { detailed: true }
      );
      trackActors();
      vision?.validate(entries);
      refreshHud();
    },
    onError: error => reportFailure("hud.companions.refresh", error, { t })
  });
  let queued = false;
  const schedule = () => {
    if (queued || !isCurrent()) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      void refresh();
    });
  };
  const documentHooks = [
    "createActor",
    "updateActor",
    "deleteActor",
    "createToken",
    "updateToken",
    "deleteToken",
    "updateActorDelta",
    "deleteScene",
    "canvasReady",
    "updateUser",
    "pauseGame",
    "createCombat",
    "updateCombat",
    "deleteCombat",
    "createCombatant",
    "updateCombatant",
    "deleteCombatant",
    "createActiveEffect",
    "updateActiveEffect",
    "deleteActiveEffect",
    "createItem",
    "updateItem",
    "deleteItem"
  ];
  const relatedActor = actor => actor && trackedActors.has(actor.uuid);
  const relevant = (hook, doc) => {
    if (!doc) return true;
    if (hook.endsWith("Item") || hook.endsWith("ActiveEffect"))
      return relatedActor(doc.parent) || relatedActor(doc.parent?.parent);
    if (hook.endsWith("Token")) return doc.parent?.id === canvas.scene?.id;
    if (hook === "updateActorDelta")
      return doc.parent?.parent?.id === canvas.scene?.id;
    if (hook.endsWith("Actor"))
      return (
        relatedActor(doc) ||
        (["character", "npc"].includes(doc.type) && doc.isOwner)
      );
    if (hook === "updateUser") return doc.id === game.user?.id;
    return true;
  };

  return {
    start() {
      if (started || !isCurrent()) return;
      started = true;

      hooks.push(
        ...documentHooks.map(
          hook =>
            /** @type {[string, number]} */ ([
              hook,
              Hooks.on(hook, doc => {
                if (relevant(hook, doc)) {
                  recordDiagnostic(
                    "hud.companions.refresh-request",
                    { reason: hook },
                    { detailed: true }
                  );
                  schedule();
                }
              })
            ])
        )
      );
    },

    get entries() {
      return entries;
    },
    refresh,
    dispose() {
      started = false;
      hooks.forEach(([hook, id]) => Hooks.off(hook, id));
    }
  };
}
