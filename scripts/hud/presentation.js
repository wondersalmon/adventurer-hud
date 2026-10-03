// @ts-check
import { renderHudMode } from "../render/index.js";
import { resolveHudMode } from "./state.js";
import { createHudComponents } from "./components.js";
import { createItemPanelRenderer } from "./items/item-panels.js";
import { createCombatRenderer } from "./combat.js";
import { createRegularRenderer } from "./regular.js";
import { renderInventorySummary } from "./items/inventory-summary.js";
import { hudSceneTokens } from "./token-focus.js";
import {
  gmWindowTitle,
  renderGmInitiativeButtons,
  renderGmCombatHeader,
  renderGmRemovalButton,
  renderGmTurnControls
} from "./gm/gm-combat.js";

/** @param {{actorContext: import('../../types/hud.js').ActorContext, adapter: import('../../types/hud.js').HudAdapter, gmActive: boolean, gmCombatant: any, gmController: import('../../types/hud.js').GmController | null, hudState: import('../../types/hud.js').HudState, visibility: ReturnType<typeof import('./visibility.js').readHudVisibility>, toolState: Awaited<ReturnType<typeof import('./tool-state.js').createHudToolState>>['toolState'], t: import('../../types/hud.js').Translate, tf: import('../../types/hud.js').Format, companions?: any, companion?: boolean}} options */
export function createHudPresentation({
  actorContext,
  companions = null,
  companion = false,
  adapter,
  gmActive,
  gmCombatant,
  gmController,
  hudState,
  visibility,
  toolState,
  t,
  tf
}) {
  const { actor, getCombatState } = actorContext;
  const inventoryNumberFormat = new Intl.NumberFormat(game.i18n.lang, {
    maximumFractionDigits: 2
  });
  const canRollActor = actor.isOwner;
  const abilities = adapter.abilityDefinitions();
  const skills = adapter.skillDefinitions({
    localize: value => game.i18n.localize(value)
  });
  const escapeHTML = value => foundry.utils.escapeHTML(String(value ?? ""));
  const formatMod = value => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) {
      return "—";
    }

    return n >= 0 ? `+${n}` : `${n}`;
  };

  const marker = value =>
    value >= 2
      ? ["★", "ws-expertise", t("Labels.Expertise")]
      : value >= 1
        ? ["●", "ws-proficient", t("Labels.Proficiency")]
        : value > 0
          ? ["◐", "ws-half", t("Labels.HalfProficiency")]
          : ["", "", ""];

  const saveProf = id => {
    return adapter.saveProficiency(actor, id);
  };

  const skillProf = id => adapter.skillProficiency(actor, id);

  const deathData = () => adapter.deathData(actor);

  const canRollDeathSave = () => {
    const { dead, failure, hp, stable, success } = deathData();
    return (
      actor.type === "character" &&
      hp <= 0 &&
      !dead &&
      !stable &&
      failure < 3 &&
      success < 3
    );
  };

  const combatModeAvailable = () =>
    companion || adapter.isActorSupported(actor, { gm: gmActive });

  const currentMode = () =>
    gmActive
      ? "combat"
      : companion
        ? (hudState.forcedMode ?? "combat")
        : resolveHudMode({
            combatAvailable: combatModeAvailable(),
            forcedMode: hudState.forcedMode,
            isActiveCombatant: getCombatState().isActive
          });

  const components = createHudComponents({
    isCompanionTurn: () => companion && getCombatState().isTurn,
    portrait:
      gmCombatant?.token?.texture?.src ??
      (companion ? actorContext.token?.texture?.src : undefined),
    tokenControl: () =>
      `<button type="button" class="ws-header-control ws-button" data-action="actorcenter" title="${t("Actor.SelectToken")}" aria-label="${t("Actor.SelectToken")}" ${actor.isOwner && hudSceneTokens(actorContext).length ? "" : "disabled"}><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></button>`,
    abilities,
    actor,
    adapter,
    canRollActor,
    combatModeAvailable,
    escapeHTML,
    formatMod,
    hudState,
    marker,
    saveProf,
    skillProf,
    skills,
    t,
    tf,
    visibility
  });

  const itemPanels = createItemPanelRenderer({
    skills,
    actor,
    adapter,
    escapeHTML,
    hudState,
    skillsHTML: components.skillsHTML,
    skillFilterHTML: components.skillFilterHTML,
    spellFilterHTML: components.spellFilterHTML,
    t,
    tf,
    visibility
  });
  const combatRenderer = createCombatRenderer({
    companionNavigation: companions?.navigationHTML,
    companionSection: companions?.sectionHTML,
    actor,
    adapter,
    canRollActor,
    canRollDeathSave,
    deathData,
    escapeHTML,
    formatMod,
    getCombatState,
    gmCombatant,
    gmHeader: gmActive
      ? () =>
          renderGmCombatHeader({
            controller: gmController,
            selectedId: gmCombatant.id,
            showRemoval: false,
            adapter,
            escapeHTML,
            t
          })
      : null,
    hudState,
    ...components,
    combatActions: itemPanels.combatActions,
    gmSpecialActions: itemPanels.gmSpecialActions,
    gmTurnControls: () => renderGmTurnControls(gmController?.getCombat(), t),
    gmInitiativeButtons: () =>
      renderGmInitiativeButtons(
        gmController?.getCombat(),
        gmController?.roster() ?? [],
        t
      ),
    gmRemovalButton: () =>
      renderGmRemovalButton(gmController?.roster() ?? [], t),
    favoriteSection: itemPanels.favoriteSection,
    t,
    visibility
  });

  const regularRenderer = createRegularRenderer({
    inventorySummary: () =>
      renderInventorySummary({
        data: adapter.inventorySummary(actor),
        t,
        escapeHTML,
        formatNumber: value => inventoryNumberFormat.format(value)
      }),
    companionNavigation: companions?.navigationHTML,
    companionSection: companions?.sectionHTML,
    hudState,
    toolState,
    ...components,
    ...itemPanels,
    combatInitiative: combatRenderer.combatInitiative,
    healthPanel: combatRenderer.healthPanel,
    t,
    visibility
  });

  const { availableViews } = regularRenderer;
  const combatHTML = () =>
    itemPanels.withUsageTargets(combatRenderer.combatHTML);
  const combatActions = () =>
    itemPanels.withUsageTargets(itemPanels.combatActions);
  const normalHTML = () =>
    itemPanels.withUsageTargets(regularRenderer.normalHTML);

  const dialogTitle = () =>
    gmActive
      ? gmWindowTitle(gmController?.getCombat(), actor.name, t, tf)
      : currentMode() === "combat"
        ? tf("Window.CombatTitle", { actor: actor.name })
        : tf("Window.Title", { actor: actor.name });

  const createContent = async () => {
    const content = document.createElement("div");

    const renderTemplate =
      foundry.applications.handlebars?.renderTemplate ??
      globalThis.renderTemplate;

    content.innerHTML = await renderTemplate(
      "modules/adventurer-hud/templates/rolls-hud.hbs",
      {
        body: renderHudMode(currentMode(), {
          combat: combatHTML,
          regular: normalHTML
        })
      }
    );

    return content;
  };

  return {
    dialogTitle,
    createContent,
    combatModeAvailable,
    canRollDeathSave,
    currentMode,
    combatHTML,
    combatActions,
    availableViews,
    normalHTML
  };
}
