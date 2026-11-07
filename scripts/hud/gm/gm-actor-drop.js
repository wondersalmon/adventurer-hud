import { getSetting, SETTINGS } from "../../settings-access.js";
import { reportFailure } from "../../diagnostics.js";
import { encounterActors } from "../../dnd5e/actor.js";
import { createGmActionScope } from "./gm-action-scope.js";
import { createSceneCombat } from "./gm-scene.js";

let pendingPlacement = null;

const supported = data => ["Actor", "Folder"].includes(data?.type);

/** Resolve native Actor and Folder payloads, including compendium folder indexes. */
export async function actorsFromDrop(data, canExecute = () => true) {
  if (!supported(data) || !canExecute()) return [];
  const source = await foundry.utils
    .getDocumentClass(data.type)
    .fromDropData(data);
  if (!source || !canExecute()) return [];
  let actors = [source];
  if (data.type === "Folder") {
    if (source.type !== "Actor") return [];
    actors = [];
    for (const folder of [source, ...source.getSubfolders(true)]) {
      for (const entry of folder.contents) {
        const actor =
          entry.documentName === "Actor"
            ? entry
            : await game.packs
                .get(folder.pack)
                ?.getDocument(entry._id ?? entry.id);
        if (actor) actors.push(actor);
        if (!canExecute()) return [];
      }
    }
  }
  const creatures = [];
  const unique = new Map(
    actors.filter(actor => actor.isOwner).map(actor => [actor.uuid, actor])
  );
  for (const actor of unique.values()) {
    if (!canExecute()) return [];
    if (actor.type === "npc") creatures.push({ actor, encounter: null });
    else if (actor.type === "encounter")
      for (const member of await encounterActors(actor, canExecute))
        creatures.push({ actor: member, encounter: actor });
  }
  return creatures;
}

function confirmCreatures(sources, t) {
  const counts = new Map();
  for (const { actor } of sources) {
    const entry = counts.get(actor.uuid) ?? { name: actor.name, count: 0 };
    entry.count++;
    counts.set(actor.uuid, entry);
  }
  const { escapeHTML } = foundry.utils;
  const summary = t("GM.DropPreviewCount").replace(
    "{count}",
    String(sources.length)
  );
  const list = [...counts.values()]
    .map(({ name, count }) => `<li>${escapeHTML(name)} × ${count}</li>`)
    .join("");
  return foundry.applications.api.DialogV2.confirm({
    window: { title: t("GM.DropPreview") },
    content: `<p>${escapeHTML(summary)}</p><ul>${list}</ul>`
  });
}

/** Native cursor placement, followed by native enrollment in the selected encounter. */
export function createGmActorDrop({
  controller,
  isCurrent,
  performSceneAction,
  t
}) {
  let disposed = false;
  let operation = null;
  const enabled = () =>
    !disposed &&
    isCurrent() &&
    controller?.isGM() &&
    getSetting(SETTINGS.gmActorDrop);
  const cancel = () => {
    if (operation?.preview && operation.layer === canvas.tokens) {
      operation.preview = false;
      operation.layer.deactivate();
    }
  };
  return {
    enabled,
    sync() {
      if (!enabled()) cancel();
    },
    dispose() {
      disposed = true;
      cancel();
    },
    async drop(data) {
      if (!enabled() || !supported(data) || pendingPlacement) return;
      const scene = canvas.scene;
      const layer = canvas.tokens;
      if (
        !scene ||
        !layer?.placeTokens ||
        !CONFIG.Token?.documentClass?.canUserCreate?.(game.user)
      ) {
        ui.notifications.warn(t("GM.DropUnavailable"));
        return;
      }
      const scope = createGmActionScope(controller, enabled);
      const captured = { scene, layer, preview: false };
      operation = pendingPlacement = captured;
      try {
        await performSceneAction(async () => {
          const sources = await actorsFromDrop(data, scope);
          if (!scope()) return;
          if (!sources.length) {
            ui.notifications.warn(t("GM.DropNoCreatures"));
            return;
          }
          const Actor = foundry.utils.getDocumentClass("Actor");
          const available = actor =>
            actor?.isOwner && game.actors.get(actor.id) === actor;
          const imported = new Map();
          const actors = new Set(sources.map(entry => entry.actor));
          const encounters = new Set(sources.map(entry => entry.encounter));
          const validActor = actor =>
            actor.compendium
              ? actor.isOwner && Actor.canUserCreate(game.user)
              : available(actor);
          const active = () =>
            scope() &&
            canvas.tokens === layer &&
            CONFIG.Token?.documentClass?.canUserCreate?.(game.user);
          const validSource = ({ actor, encounter }) =>
            active() && (!encounter || encounter.isOwner) && validActor(actor);
          const valid = () =>
            active() &&
            [...actors].every(validActor) &&
            [...encounters].every(
              encounter => !encounter || encounter.isOwner
            ) &&
            [...imported.values()].every(available);
          if (!valid()) return;
          if (
            (data.type === "Folder" ||
              sources.some(entry => entry.encounter)) &&
            !(await confirmCreatures(sources, t))
          )
            return;
          const documents = [];
          for (const source of sources) {
            if (!validSource(source)) return;
            const { actor } = source;
            const token = await actor.getTokenDocument(
              { level: canvas.level?.id },
              { parent: scene }
            );
            const tokenData = token.toObject();
            delete tokenData._id;
            // A compendium ID can match an unrelated world Actor in the preview.
            if (actor.compendium) tokenData.actorId = null;
            documents.push(tokenData);
          }
          if (!valid()) return;
          layer.activate();
          captured.preview = true;
          const confirmed = new Map();
          const tokens = await layer.placeTokens(documents, {
            createOptions: { controlObject: false },
            preConfirm: ({ document, index }) => {
              if (!validSource(sources[index])) return false;
              confirmed.set(document, sources[index]);
              return true;
            },
            preCommit: async placed => {
              captured.preview = false;
              if (!valid() || placed.some(document => !confirmed.get(document)))
                return false;
              for (const document of placed) {
                const entry = confirmed.get(document);
                if (!validSource(entry)) return false;
                const { actor: source, encounter } = entry;
                let actor = imported.get(source.uuid);
                if (!actor) {
                  if (encounter && Actor.fetchExisting)
                    actor = await Actor.fetchExisting(source.uuid, {
                      folderId: encounter.folder?.id ?? null
                    });
                  else if (source.compendium)
                    actor = await game.actors.importDocument(source, {
                      renderSheet: false
                    });
                  else actor = source;
                  if (!available(actor) || !validSource(entry)) return false;
                  imported.set(source.uuid, actor);
                }
                if (actor !== source) {
                  const placement = Object.fromEntries(
                    ["x", "y", "elevation", "rotation", "level"]
                      .filter(key => document[key] !== undefined)
                      .map(key => [key, document[key]])
                  );
                  const token = await actor.getTokenDocument(placement, {
                    parent: scene
                  });
                  if (!available(actor) || !validSource(entry)) return false;
                  const data = token.toObject();
                  delete data._id;
                  document.updateSource(data, { recursive: false });
                }
              }
              return valid();
            }
          });
          captured.preview = false;
          if (!valid() || !tokens?.length) return;
          const exact = tokens.filter(
            token =>
              token.parent === scene &&
              scene.tokens.get(token.id) === token &&
              token.isOwner &&
              token.actor?.isOwner &&
              token.actor.type === "npc"
          );
          if (!exact.length) return;
          let combat = controller.getCombat();
          if (!combat) {
            combat = await createSceneCombat();
            if (!combat || !enabled() || canvas.scene !== scene) return;
            if (controller.getCombat() && controller.getCombat() !== combat)
              return;
            controller.chooseCombat(combat.id);
          }
          if (
            !enabled() ||
            canvas.scene !== scene ||
            controller.getCombat() !== combat
          )
            return;
          const Token = foundry.utils.getDocumentClass("Token");
          const remaining = exact.filter(
            token =>
              scene.tokens.get(token.id) === token &&
              token.isOwner &&
              token.actor?.isOwner
          );
          if (remaining.length)
            await Token.createCombatants(remaining, { combat });
        });
      } catch (error) {
        reportFailure("gm.actor-drop", error, { t });
      } finally {
        if (captured.preview && captured.layer === canvas.tokens)
          captured.layer.deactivate();
        if (pendingPlacement === captured) pendingPlacement = null;
        if (operation === captured) operation = null;
      }
    }
  };
}

export function bindGmActorDrop({
  root,
  controller,
  isCurrent,
  performSceneAction,
  t
}) {
  const drop = createGmActorDrop({
    controller,
    isCurrent,
    performSceneAction,
    t
  });
  const document = root.ownerDocument;
  let dragged = null;
  let hint = null;
  const clear = () => {
    hint?.remove();
    hint = null;
  };
  const payload = event => {
    try {
      return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
    } catch {
      return null;
    }
  };
  const show = roster => {
    if (!roster || (hint && hint.parentElement === roster)) return;
    clear();
    hint = document.createElement("span");
    hint.className = "ws-gm-drop-hint";
    hint.setAttribute("role", "status");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-arrow-down-to-bracket";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("strong");
    label.textContent = t("GM.DropHere");
    const description = document.createElement("small");
    description.textContent = t("GM.DropSources");
    hint.append(icon, label, description);
    roster.append(hint);
  };
  const destination = () =>
    root.querySelector(
      ".ws-gm-preparation-creatures, .ws-gm-combat:not(.ws-gm-preparation)"
    ) ?? root.querySelector(".ws-gm-combat");
  const start = event => {
    dragged = root.contains(event.target) ? false : payload(event);
    // Capture also handles sources that fill the native payload and stop bubbling.
    if (drop.enabled() && dragged !== false && (!dragged || supported(dragged)))
      show(destination());
    else clear();
  };
  const target = event =>
    event.target.closest?.(".ws-gm-combat, .ws-gm-preparation-creatures");
  const accepted = event =>
    drop.enabled() &&
    dragged !== false &&
    (supported(payload(event) ?? dragged) ||
      (!payload(event) &&
        !dragged &&
        Array.from(event.dataTransfer?.types ?? []).includes("text/plain")));
  const over = event => {
    const roster = target(event);
    if (!roster || !accepted(event)) {
      if (!drop.enabled() || !supported(dragged)) clear();
      else hint?.classList.remove("ws-drop-active");
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    show(roster);
    hint.classList.add("ws-drop-active");
  };
  const leave = event => {
    if (!hint?.parentElement?.contains(event.relatedTarget)) {
      if (supported(dragged)) hint?.classList.remove("ws-drop-active");
      else clear();
    }
  };
  const discover = event => {
    if (accepted(event) && !hint) show(destination());
  };
  const finish = () => {
    clear();
    dragged = null;
  };
  const onDrop = event => {
    const data = payload(event) ?? dragged;
    if (target(event) && accepted(event) && supported(data)) {
      event.preventDefault();
      event.stopPropagation();
      void drop.drop(data);
    }
    finish();
  };
  document.addEventListener("dragstart", start);
  document.addEventListener("dragstart", start, true);
  document.addEventListener("dragover", discover);
  document.addEventListener("dragend", finish);
  document.addEventListener("drop", finish);
  root.addEventListener("dragover", over);
  root.addEventListener("dragleave", leave);
  root.addEventListener("drop", onDrop);
  return {
    sync() {
      drop.sync();
      if (!drop.enabled()) clear();
    },
    dispose() {
      finish();
      drop.dispose();
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragstart", start, true);
      document.removeEventListener("dragover", discover);
      document.removeEventListener("dragend", finish);
      document.removeEventListener("drop", finish);
      root.removeEventListener("dragover", over);
      root.removeEventListener("dragleave", leave);
      root.removeEventListener("drop", onDrop);
    }
  };
}
