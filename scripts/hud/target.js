// @ts-check
import { hudSceneTokens } from "./token-focus.js";
import { reportFailure } from "../diagnostics.js";

/** Current visible native targets, with exact scene/document/placeable identity. */
export function hudTargets() {
  if (canvas.ready === false || !canvas.scene) return [];
  return [...(game.user?.targets ?? [])].filter(token => {
    const document = token.document;
    return (
      document?.parent === canvas.scene &&
      canvas.scene.tokens?.get(document.id) === document &&
      canvas.tokens?.get(document.id) === token &&
      token.isVisible &&
      token.visible !== false &&
      (!document.hidden || game.user?.isGM)
    );
  });
}

/** @param {import('../../types/hud.js').ActorContext} context @param {any} target Native Token. */
function targetDistance(context, target) {
  const candidates = hudSceneTokens(context);
  const controlled = candidates.filter(document =>
    canvas.tokens?.controlled?.some(token => token.document === document)
  );
  const source =
    controlled.length === 1
      ? controlled[0]
      : candidates.length === 1
        ? candidates[0]
        : null;
  const start = source?.getCenterPoint?.();
  const end = target.document.getCenterPoint?.();
  if (!start || !end || !canvas.grid?.measurePath) return "";
  const { distance } = canvas.grid.measurePath([start, end]);
  if (!Number.isFinite(distance) || distance < 0) return "";
  return [
    new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 1 }).format(
      distance
    ),
    canvas.scene.grid?.units ?? canvas.grid.units
  ]
    .filter(value => value !== "" && value != null)
    .join(" ");
}

/** @param {{actorContext: import('../../types/hud.js').ActorContext, t: import('../../types/hud.js').Translate, escapeHTML: (value: unknown) => string}} options */
export function renderHudTarget({ actorContext, t, escapeHTML }) {
  const targets = hudTargets();
  const target = targets[0];
  const name = target ? String(target.name ?? target.document.name ?? "") : "";
  const label = target ? t("Target.Change") : t("Target.Select");
  const distance =
    targets.length === 1 ? targetDistance(actorContext, target) : "";
  const available = Boolean(canvas.ready !== false && canvas.scene);
  const names = targets
    .map(token => token.name ?? token.document.name)
    .join(", ");
  const hint = target ? `${label}: ${names}` : t("Target.SelectHint");
  const clearButton = (token, listed = false) =>
    `<button type="button" class="ws-button ws-target-clear" data-action="cleartarget" data-target-entry="${listed ? "list" : "summary"}" data-target-uuid="${escapeHTML(token.document.uuid)}" title="${escapeHTML(`${t("Target.Clear")}: ${token.name}`)}" aria-label="${escapeHTML(`${t("Target.Clear")}: ${token.name}`)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
  const list =
    targets.length > 1
      ? `<details class="ws-target-list"><summary class="ws-target-count" aria-label="${escapeHTML(t("Target.List"))}" title="${escapeHTML(names)}">+${targets.length - 1}</summary><div class="ws-target-list-panel"><strong>${escapeHTML(t("Target.List"))}</strong>${targets
          .map(token => {
            const measurement = targetDistance(actorContext, token);
            return `<div class="ws-target-row"><span class="ws-target-row-name">${escapeHTML(token.name ?? token.document.name)}</span>${measurement ? `<span class="ws-target-distance" title="${escapeHTML(t("Target.DistanceHint"))}">${escapeHTML(measurement)}</span>` : ""}${clearButton(token, true)}</div>`;
          })
          .join(
            ""
          )}<button type="button" class="ws-button ws-target-clear-all" data-action="cleartargets">${escapeHTML(t("Target.ClearAll"))}</button></div></details>`
      : "";
  return `<div class="ws-footer-target" role="group" aria-label="${escapeHTML(t("Target.Title"))}"><div class="ws-target-content"><button type="button" class="ws-button ws-target-select" data-action="selecttarget" title="${escapeHTML(hint)}" aria-label="${escapeHTML(hint)}" ${available ? "" : "disabled"}><i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span class="ws-target-text">${target ? `<small>${escapeHTML(t("Target.Title"))}</small>` : ""}<span class="ws-target-name">${escapeHTML(target ? name : t("Target.Select"))}</span></span></button>${list}${distance ? `<span class="ws-target-distance" title="${escapeHTML(t("Target.DistanceHint"))}">${escapeHTML(distance)}</span>` : ""}${target ? clearButton(target) : ""}</div></div>`;
}

/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createTargetActions({
  currentMode,
  visibility,
  refreshHud,
  selectHudTarget
}) {
  const available = () =>
    visibility?.playerFooter &&
    (currentMode?.() === "combat"
      ? visibility.combatFooterMode
      : visibility.explorationFooterMode) === "target";
  return {
    cleartargets: () => {
      if (!available() || canvas.ready === false || !canvas.scene) return;
      canvas.tokens.setTargets([], { mode: "replace" });
      refreshHud?.();
    },
    selecttarget: event => {
      if (!available() || canvas.ready === false || !canvas.scene) return;
      return selectHudTarget?.(event);
    },
    cleartarget: (_event, target) => {
      if (!available()) return;
      const selected = hudTargets().find(
        token => token.document.uuid === target?.dataset.targetUuid
      );
      if (!selected) return;
      canvas.tokens.setTargets([selected.id], { mode: "release" });
      refreshHud?.();
    }
  };
}

/** @typedef {{controls: any, scene: any, user: any, control: string, tool: string, hooks: typeof Hooks, ids: [string, number][], onActivate: () => void, document: Document, onEscape: (event: KeyboardEvent) => void}} TargetSelection */

/** One native targeting gesture begun by the HUD; normal canvas targeting is untouched.
 * @param {{isCurrent: () => boolean}} options */
export function createTargetSelection({ isCurrent }) {
  /** @type {TargetSelection | null} */
  let pending = null;
  const clear = () => {
    const selection = pending;
    if (!selection) return null;
    pending = null;
    for (const [hook, id] of selection.ids) selection.hooks.off(hook, id);
    selection.controls.removeEventListener?.("activate", selection.onActivate);
    selection.document.removeEventListener("keydown", selection.onEscape, true);
    return selection;
  };
  /** @param {TargetSelection} selection */
  const targeting = selection =>
    canvas.scene === selection.scene &&
    game.user === selection.user &&
    ui.controls === selection.controls &&
    selection.controls.control?.name === "tokens" &&
    selection.controls.tool?.name === "target";
  /** @param {TargetSelection} selection */
  const restore = selection => {
    void Promise.resolve()
      .then(async () => {
        if (isCurrent() && targeting(selection))
          await selection.controls.activate({
            control: selection.control,
            tool: selection.tool
          });
      })
      .catch(error =>
        reportFailure("hud.target.tool", error, { notify: false })
      );
  };
  return {
    /** @param {any} event Native pointer/keyboard event. */
    async select(event) {
      if (!isCurrent() || canvas.ready === false || !canvas.scene) return;
      if (pending && targeting(pending)) return;
      clear();
      const controls = ui.controls;
      const control = controls?.control?.name;
      const tool = controls?.tool?.name;
      if (!control || !tool || !controls.activate) return;
      /** @type {TargetSelection} */
      const selection = {
        controls,
        control,
        tool,
        scene: canvas.scene,
        user: game.user,
        hooks: Hooks,
        document,
        ids: /** @type {[string, number][]} */ ([]),
        onActivate: () => {
          if (!targeting(selection)) clear();
        },
        onEscape: event => {
          if (
            event.key !== "Escape" ||
            pending !== selection ||
            !isCurrent() ||
            !targeting(selection)
          )
            return;
          event.preventDefault();
          event.stopImmediatePropagation();
          clear();
          restore(selection);
        }
      };
      pending = selection;
      selection.ids.push(
        [
          "targetToken",
          Hooks.on("targetToken", (user, _token, targeted) => {
            if (user !== selection.user || !targeted || pending !== selection)
              return;
            clear();
            // Finish the native click/multi-target update before returning its tool.
            restore(selection);
          })
        ],
        ["canvasTearDown", Hooks.on("canvasTearDown", clear)]
      );
      try {
        await controls.activate({ control: "tokens", tool: "target", event });
        if (pending !== selection) return;
        if (!isCurrent() || !targeting(selection)) {
          clear();
          return;
        }
        controls.addEventListener?.("activate", selection.onActivate);
        document.addEventListener("keydown", selection.onEscape, true);
      } catch (error) {
        clear();
        throw error;
      }
    },
    dispose() {
      clear();
    }
  };
}

/** @param {{hooks: typeof Hooks, actorContext: import('../../types/hud.js').ActorContext, isActive: () => boolean, read: () => string, scheduleRefresh: () => void}} options */
export function subscribeHudTarget({
  hooks,
  actorContext,
  isActive,
  read,
  scheduleRefresh
}) {
  let previous = "";
  const refresh = () => {
    if (!isActive()) {
      previous = "";
      return;
    }
    try {
      const next = read();
      if (next === previous) return;
      previous = next;
      scheduleRefresh();
    } catch (error) {
      reportFailure("hud.target.refresh", error, { notify: false });
    }
  };
  /** @param {any} token Native Token or TokenDocument. */
  const tokenChanged = token => {
    if (!isActive()) return;
    const document = token?.document ?? token;
    if (
      [...(game.user?.targets ?? [])].some(
        target => target.document === document
      ) ||
      document?.actor === actorContext.actor ||
      document?.baseActor === actorContext.actor ||
      (document?.uuid &&
        [actorContext.tokenUuid, actorContext.ownerTokenUuid].includes(
          document.uuid
        ))
    )
      refresh();
  };
  const ids = [
    ...["refreshToken", "updateToken", "deleteToken", "controlToken"].map(
      hook => [hook, hooks.on(hook, tokenChanged)]
    ),
    ...["canvasReady", "canvasTearDown", "updateScene"].map(hook => [
      hook,
      hooks.on(hook, refresh)
    ]),
    [
      "targetToken",
      hooks.on("targetToken", user => {
        if (user === game.user || (user?.id && user.id === game.user?.id))
          refresh();
      })
    ]
  ];
  return () => {
    for (const [hook, id] of ids) hooks.off(hook, id);
  };
}
