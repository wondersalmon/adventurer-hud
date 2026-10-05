// @ts-check
import { createCompanionPicker } from "./companion-picker.js";
import { createCompanionActions } from "./companion-actions.js";
import { createCompanionRosterSession } from "./companion-roster-session.js";
import {
  companionOnScene,
  companionIsFamiliar,
  resolveCompanion,
  worldDocument
} from "./companions.js";
import { SETTINGS, getSetting } from "../../settings-access.js";
import { companionInitiative } from "./companion-details.js";
import { createFamiliarVision } from "./familiar-vision.js";
import { createCompanionPlacement } from "./companion-placement.js";

export function renderFamiliarVision({ active, ownerName, t, tf, escapeHTML }) {
  if (!active) return "";
  const label = escapeHTML(
    tf("Companions.VisionActive", { name: active.name })
  );
  const back = escapeHTML(tf("Companions.VisionReturn", { name: ownerName }));
  return `<div class="ws-familiar-vision" role="status"><span><i class="fa-solid fa-eye" aria-hidden="true"></i>${label}<small>${t("Companions.VisionDuration")}</small></span><button type="button" class="ws-button" data-action="companionvisionstop" title="${back}" aria-label="${back}"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i></button></div>`;
}

/** @param {{combatMode?: boolean, companion?: boolean, ownerName: string, tf: import('../../../types/hud.js').Format, escapeHTML: (value: unknown) => string, t: import('../../../types/hud.js').Translate, entries?: import('../../../types/hud.js').CompanionEntry[], currentUuid?: string | null}} options */
export function renderCompanionNavigation({
  combatMode = true,
  companion = false,
  ownerName,
  tf,
  escapeHTML,
  t,
  entries = [],
  currentUuid = null
}) {
  if (companion) {
    const label = escapeHTML(tf("Companions.Back", { name: ownerName }));
    const others = entries.filter(entry => entry.uuid !== currentUuid);
    const switches = others
      .map(entry => {
        const name =
          entry.token?.name ?? entry.actor?.name ?? t("Companions.Unavailable");
        const isTurn = combatMode && companionInitiative(entry).isTurn;
        const hint = `${name}${isTurn ? ` · ${t("Companions.Turn")}` : ""}`;
        return `<button type="button" class="ws-companion-switch ws-button ${isTurn ? "ws-companion-turn" : ""}" data-action="opencompanion" data-companion-uuid="${escapeHTML(entry.uuid)}" title="${escapeHTML(hint)}" aria-label="${escapeHTML(hint)}" ${entry.actor ? "" : "disabled"}><img src="${escapeHTML(entry.token?.texture?.src ?? entry.actor?.img ?? "icons/svg/mystery-man.svg")}" alt=""><span>${escapeHTML(name)}</span></button>`;
      })
      .join("");
    return `<div class="ws-companion-navigation"><button type="button" class="ws-companion-back ws-button" data-action="companionback" title="${label}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>${label}</button>${others.length ? `<nav class="ws-companion-switches" aria-label="${t("Companions.Other")}">${switches}</nav>` : ""}</div>`;
  }
  return "";
}

export function renderCompanionSection({
  expanded = false,
  count = 0,
  visible = true,
  body = "",
  t
}) {
  if (!visible) return "";
  return `<section class="ws-companions-panel">
    <button type="button" class="ws-companions-toggle ws-section-toggle ws-button" data-action="togglecompanions" aria-expanded="${expanded}" aria-controls="ws-companions-body"><span><i class="fa-solid fa-paw" aria-hidden="true"></i>${t("Companions.Title")} · ${count}</span><i class="fa-solid fa-chevron-${expanded ? "up" : "down"}" aria-hidden="true"></i></button>
    <div id="ws-companions-body" ${expanded ? "" : "hidden"}>${expanded ? body : ""}</div>
  </section>`;
}

export { renderCompanionList } from "./companion-list.js";
import { renderCompanionList } from "./companion-list.js";

/** @param {import('../../../types/hud.js').CompanionPanelOptions} options */
export async function createCompanionPanel(options) {
  const {
    owner,
    companion,
    actorContext,
    hudState,
    adapter,
    t,
    tf,
    escapeHTML,
    isCurrent,
    refreshHud,
    navigate,
    ownerTokenUuid
  } = options;
  const vision = !companion
    ? createFamiliarVision({ actorContext, adapter, isCurrent, refreshHud, t })
    : null;
  /** @param {string | null} uuid
   * @param {string | null} [tokenUuid]
   * @param {string | null} [returnTokenUuid]
   */
  const navigateTo = (
    uuid,
    tokenUuid = null,
    returnTokenUuid = ownerTokenUuid
  ) =>
    navigate({
      ownerUuid: owner.uuid,
      companionUuid: uuid,
      tokenUuid,
      ownerTokenUuid: returnTokenUuid
    });
  /** @param {string | undefined} uuid
   * @param {string | null} [tokenUuid]
   */
  const resolved = async (uuid, tokenUuid = null) => {
    if (!uuid) return null;
    const currentOwner = await worldDocument(owner.uuid);
    return currentOwner?.isOwner
      ? resolveCompanion(currentOwner, { uuid }, tokenUuid)
      : null;
  };
  const picker = createCompanionPicker(options);
  const roster = await createCompanionRosterSession(options, {
    resolved,
    navigateTo,
    vision
  });
  const refresh = roster.refresh;
  const placement = createCompanionPlacement({
    resolved,
    isCurrent,
    refreshHud,
    t,
    onPlaced: () => refresh()
  });
  const commands = createCompanionActions(options, {
    vision,
    placement,
    resolved,
    navigateTo,
    refresh,
    getEntries: () => roster.entries,
    picker
  });
  return {
    start() {
      vision?.start();
      roster.start();
    },
    navigationHTML: () =>
      renderFamiliarVision({
        active: vision?.active,
        ownerName: owner.name,
        t,
        tf,
        escapeHTML
      }) +
      renderCompanionNavigation({
        combatMode: options.currentMode?.() === "combat",
        companion: Boolean(companion),
        ownerName: owner.name,
        tf,
        escapeHTML,
        t,
        entries: getSetting(SETTINGS.showCompanions) ? roster.entries : [],
        currentUuid: companion?.uuid
      }),
    sectionHTML: () =>
      renderCompanionSection({
        expanded: hudState.companionsExpanded,
        count:
          hudState.companionFilter === "familiars" &&
          getSetting(SETTINGS.familiarVision2024) &&
          roster.entries.some(entry => companionIsFamiliar(owner, entry))
            ? roster.entries.filter(entry => companionIsFamiliar(owner, entry))
                .length
            : hudState.companionFilter === "all"
              ? roster.entries.length
              : roster.entries.filter(companionOnScene).length,
        visible:
          !companion &&
          getSetting(SETTINGS.showCompanions) &&
          roster.entries.length > 0,
        t,
        body: hudState.companionsExpanded
          ? renderCompanionList({
              combatMode: options.currentMode?.() === "combat",
              entries: roster.entries,
              owner,
              adapter,
              t,
              escapeHTML,
              filter: hudState.companionFilter,
              visionWarning: entry => vision?.warning(entry),
              rolling: commands.rolling,
              visionUuid: vision?.active?.uuid,
              placing: placement.busy,
              showEffects: getSetting(SETTINGS.showCompanionEffects)
            })
          : ""
      }),
    actions: commands.actions,
    get visionOwnerTokenUuid() {
      return vision?.active?.ownerToken.uuid ?? null;
    },
    stopVision: options => vision?.stop(options),
    async validateActorAction() {
      if (!companion) return isCurrent();
      const current = await resolved(companion.uuid, actorContext.tokenUuid);
      return isCurrent() && current?.actor === actorContext.actor;
    },
    dispose() {
      vision?.dispose();
      placement.dispose();
      roster.dispose();
      picker.dispose();
    },
    refresh
  };
}
