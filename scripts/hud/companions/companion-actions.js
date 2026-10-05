// @ts-check
import { companionInitiative } from "./companion-details.js";
import { worldDocument, companionIsFamiliar } from "./companions.js";
import { hudSceneTokens } from "../token-focus.js";
import { getSetting, SETTINGS } from "../../settings-access.js";
import { reportFailure } from "../../diagnostics.js";
/** @param {import('../../../types/hud.js').CompanionPanelOptions} options @param {import('../../../types/hud.js').CompanionActionDependencies} dependencies */
export function createCompanionActions(
  {
    owner,
    companion,
    actorContext,
    hudState,
    adapter,
    t,
    isCurrent,
    refreshHud,
    ownerTokenUuid,
    savePanelState,
    currentMode = () => "combat"
  },
  { vision, placement, resolved, navigateTo, refresh, getEntries, picker }
) {
  let rolling = false;
  const focus = selector =>
    document
      .querySelector(".ws-rolls-dialog")
      ?.querySelector(selector)
      ?.focus?.({ preventScroll: true });
  /** @type {import('../../../types/hud.js').CompanionActions} */
  const actions = {
    companionplace: (_event, target) =>
      placement.place(target.dataset.companionUuid),
    companionvisionstop: () => isCurrent() && vision?.stop(),
    companionvision: async (event, target) => {
      if (!isCurrent() || !vision) return;
      const uuid = target.dataset.companionUuid;
      if (vision.active?.uuid === uuid) return vision.stop();
      const entry = await resolved(uuid);
      if (!isCurrent() || !entry?.actor) return;
      return picker.withToken(entry, async tokenUuid => {
        const current = await resolved(uuid, tokenUuid);
        if (isCurrent() && current?.actor) return vision.toggle(current, event);
      });
    },
    companionfilter: (_event, target) => {
      const filter = target.dataset.companionFilter;
      if (
        !isCurrent() ||
        companion ||
        (filter !== "scene" && filter !== "all" && filter !== "familiars")
      )
        return;
      if (
        filter === "familiars" &&
        (!getSetting(SETTINGS.familiarVision2024) ||
          !getEntries().some(entry => companionIsFamiliar(owner, entry)))
      )
        return;
      hudState.companionFilter = filter;
      refreshHud();
      focus(`[data-companion-filter="${filter}"]`);
    },
    companioninitiative: async (event, target) => {
      if (!isCurrent() || rolling) return;
      const entry = await resolved(target.dataset.companionUuid);
      if (!isCurrent() || !entry?.actor) return;
      return picker.withToken(
        {
          ...entry,
          tokenOptions: entry.tokenOptions.filter(
            token =>
              companionInitiative({ actor: token.actor, token }).combatant
          )
        },
        tokenUuid => rollEntries([{ uuid: entry.uuid, tokenUuid }], event)
      );
    },
    companionsinitiative: async event => {
      if (!isCurrent() || companion || rolling) return;
      return rollEntries(
        getEntries().flatMap(entry =>
          entry.tokenOptions.map(token => ({
            uuid: entry.uuid,
            tokenUuid: token.uuid
          }))
        ),
        event
      );
    },
    togglecompanions: async () => {
      if (!isCurrent() || companion) return;
      hudState.companionsExpanded = !hudState.companionsExpanded;
      if (!hudState.companionsExpanded) {
        await picker.close();
      }
      await savePanelState();
      refreshHud();
      focus('[data-action="togglecompanions"]');
    },
    companionback: async () => {
      if (!isCurrent()) return;
      if (!ownerTokenUuid && getSetting(SETTINGS.companionAutoFocus)) {
        const currentOwner = await worldDocument(owner.uuid);
        if (!isCurrent() || !currentOwner?.isOwner) return;
        const tokens = hudSceneTokens({
          actor: currentOwner,
          token: currentOwner.token
        });
        if (tokens.length > 1)
          return picker.choose({
            title: t("Companions.ChooseToken"),
            choices: tokens
              .filter(token => token.actor?.isOwner)
              .map((token, index) => ({
                uuid: token.uuid,
                name: `${token.name ?? currentOwner.name} · ${t("Companions.Token")} ${index + 1}`
              })),
            onSelect: async choice => {
              const freshOwner = await worldDocument(owner.uuid);
              const exact = hudSceneTokens({
                actor: freshOwner,
                token: null,
                ownerTokenUuid: choice.uuid
              });
              if (
                !isCurrent() ||
                !freshOwner?.isOwner ||
                !exact[0]?.actor?.isOwner
              )
                return ui.notifications.warn(t("Companions.Unavailable"));
              return navigateTo(null, null, choice.uuid);
            }
          });
      }
      await navigateTo(null);
    },
    opencompanion: async (_event, target) => {
      const entry = await resolved(target.dataset.companionUuid);
      if (!isCurrent() || !entry?.actor)
        return ui.notifications.warn(t("Companions.Unavailable"));
      return picker.withToken(entry, tokenUuid =>
        navigateTo(entry.uuid, tokenUuid)
      );
    },
    companionsheet: async (_event, target) => {
      const entry = await resolved(target.dataset.companionUuid);
      if (!isCurrent() || !entry?.actor) return;
      return picker.withToken(entry, async tokenUuid => {
        const current = await resolved(entry.uuid, tokenUuid);
        if (isCurrent() && current?.actor)
          return current.actor.sheet.render({ force: true });
      });
    },
    companionping: async (_event, target) => {
      const entry = await resolved(target.dataset.companionUuid);
      if (!isCurrent() || !entry?.actor) return;
      return picker.withToken(entry, async tokenUuid => {
        const current = await resolved(entry.uuid, tokenUuid);
        const token = current?.token;
        if (!isCurrent() || !token || token.parent?.id !== canvas.scene?.id)
          return ui.notifications.warn(t("Companions.OffScene"));
        const placeable = canvas.tokens?.get?.(token.id);
        if (
          !placeable ||
          !token.actor?.isOwner ||
          (token.hidden && !game.user?.isGM)
        )
          return ui.notifications.warn(t("Companions.NoPermission"));
        if (placeable.document && placeable.document !== token) return;
        return canvas.ping(placeable.center);
      });
    }
  };
  /** @param {{uuid: string, tokenUuid: string | null}[]} choices
   * @param {import('../../../types/hud.js').HudInputEvent | null | undefined} [event]
   */
  const rollEntries = async (choices, event) => {
    if (rolling || !isCurrent() || currentMode() !== "combat") return;
    rolling = true;
    const combat = companionInitiative({}).combat;
    const seen = new Set();
    refreshHud();
    try {
      if (!combat) return ui.notifications.warn(t("Initiative.NoCombat"));
      for (const choice of choices) {
        const current = await resolved(choice.uuid, choice.tokenUuid);
        if (
          !isCurrent() ||
          currentMode() !== "combat" ||
          companionInitiative({}).combat !== combat
        )
          break;
        const state = companionInitiative(current ?? {});
        if (!current?.actor || !state.canRoll || seen.has(state.combatant.id))
          continue;
        seen.add(state.combatant.id);
        try {
          await adapter.rollInitiative(current.actor, {
            combatant: state.combatant,
            combat,
            event
          });
        } catch (error) {
          reportFailure("hud.companions.initiative", error, { t });
        }
      }
      if (!seen.size && isCurrent())
        ui.notifications.warn(t("Companions.NothingToRoll"));
    } finally {
      rolling = false;
      if (isCurrent()) await refresh();
    }
  };
  if (companion)
    actions.initiative = event =>
      rollEntries(
        [{ uuid: companion.uuid, tokenUuid: actorContext.tokenUuid }],
        event
      );

  return {
    actions,
    get rolling() {
      return rolling;
    }
  };
}
