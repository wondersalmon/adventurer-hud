import { recordAvailability, diagnosticRef } from "../../diagnostics.js";
import { companionOnScene, companionIsFamiliar } from "./companions.js";
import { getSetting, SETTINGS } from "../../settings-access.js";
import { companionEffects, companionInitiative } from "./companion-details.js";
import { companionPlacementReason } from "./companion-placement.js";

/** @param {{entries: import('../../../types/hud.js').CompanionEntry[], owner: any, adapter: import('../../../types/hud.js').HudAdapter, t: import('../../../types/hud.js').Translate, escapeHTML: (value: unknown) => string, combatMode?: boolean, filter?: string, rolling?: boolean, showEffects?: boolean, visionUuid?: string | null, visionWarning?: (entry: import('../../../types/hud.js').CompanionEntry) => string | null | undefined, placing?: boolean}} options */
export function renderCompanionList({
  entries,
  owner,
  adapter,
  t,
  escapeHTML,
  combatMode = true,
  filter = "scene",
  rolling = false,
  showEffects = true,
  visionUuid = null,
  visionWarning = () => null,
  placing = false
}) {
  const onScene = entries.filter(companionOnScene);
  const familiars = getSetting(SETTINGS.familiarVision2024)
    ? entries.filter(entry => companionIsFamiliar(owner, entry))
    : [];
  const effectiveFilter =
    filter === "familiars" && !familiars.length ? "scene" : filter;
  const visible =
    effectiveFilter === "all"
      ? entries
      : effectiveFilter === "familiars"
        ? familiars
        : onScene;
  const participants = entry =>
    (combatMode ? (entry.token ? [entry.token] : entry.tokenOptions) : [])
      .map(token => companionInitiative({ actor: token.actor, token }))
      .filter(state => state.combatant);
  const groupInitiative = onScene.flatMap(participants);
  const rows = visible
    .map(entry => {
      const tokenInitiatives = participants(entry);
      return {
        entry,
        tokenInitiatives,
        order: Math.min(
          Infinity,
          ...tokenInitiatives
            .filter(state => state.sc)
            .map(state =>
              (
                state.combat.turns ?? [...state.combat.combatants.values()]
              ).indexOf(state.combatant)
            )
        ),
        isTurn: tokenInitiatives.some(state => state.isTurn),
        value: Math.max(
          -Infinity,
          ...tokenInitiatives.map(state => state.value).filter(Number.isFinite)
        )
      };
    })
    .sort(
      (a, b) =>
        Number(b.isTurn) - Number(a.isTurn) ||
        Number(companionOnScene(b.entry) && b.tokenInitiatives.length > 0) -
          Number(companionOnScene(a.entry) && a.tokenInitiatives.length > 0) ||
        (Number.isFinite(a.order) && Number.isFinite(b.order)
          ? a.order - b.order
          : b.value - a.value) ||
        0
    )
    .map(({ entry, tokenInitiatives }) => {
      const actor = entry.actor;
      const ambiguous = entry.tokenOptions.length > 1 && !entry.token;
      const stats = actor && !ambiguous ? adapter.combatStats(actor) : null;
      const hp = stats?.hp;
      const total = hp ? Math.max(0, hp.max) : 0;
      const width = total
        ? Math.max(0, Math.min(100, (hp.value / total) * 100))
        : 0;
      const name =
        entry.token?.name ?? actor?.name ?? t("Companions.Unavailable");
      const scene = companionOnScene(entry);
      const placeReason = owner.isOwner
        ? companionPlacementReason(entry, { sceneTokens: entry.sceneTokens })
        : "no-permission";
      const canPlace = !scene && !placeReason;
      recordAvailability(
        "hud.companion.place.available",
        entry.token ?? actor,
        placeReason,
        {
          actor: diagnosticRef(actor, "actor"),
          onScene: scene,
          paused: Boolean(game.paused)
        }
      );
      const status = t(
        ambiguous
          ? "Companions.ChooseToken"
          : scene
            ? "Companions.OnScene"
            : "Companions.OffScene"
      );
      const address = `data-companion-uuid="${escapeHTML(entry.uuid)}"`;
      const initiative = combatMode ? companionInitiative(entry) : {};
      const rollState =
        tokenInitiatives.length === 1 ? tokenInitiatives[0] : initiative;
      const initiativeLabel = t(
        tokenInitiatives.length > 1
          ? "Companions.ChooseToken"
          : !tokenInitiatives.length
            ? "Initiative.NotCombatant"
            : rollState.sc && !rollState.sc.usesInitiative
              ? "SC.NoRoll"
              : rollState.sc
                ? "SC.RollInTracker"
                : rollState.value != null
                  ? "Initiative.Rolled"
                  : "Initiative.Roll"
      );
      const active = visionUuid === entry.uuid;
      const reason = active ? null : visionWarning(entry);
      const eyeLabel = t(
        active ? "Companions.VisionStop" : "Companions.VisionStart"
      );
      const effects =
        showEffects && !ambiguous ? companionEffects(actor, adapter) : [];
      return `<article class="ws-companion-card"><div class="ws-companion-row">
      <button type="button" class="ws-companion-open ws-button ${initiative.isTurn ? "ws-companion-turn" : ""} ${tokenInitiatives.some(state => (state.sc ? state.sc.canRoll : state.value == null)) ? "ws-companion-unrolled" : ""}" data-action="opencompanion" ${address} ${actor ? "" : "disabled"} title="${escapeHTML(name)} · ${status}${initiative.isTurn ? ` · ${t("Companions.Turn")}` : ""}" aria-label="${escapeHTML(name)}${initiative.isTurn ? ` · ${t("Companions.Turn")}` : ""}">
        <img src="${escapeHTML(entry.token?.texture?.src ?? actor?.img ?? "icons/svg/mystery-man.svg")}" alt="">
        <span class="ws-companion-copy"><strong>${escapeHTML(name)}</strong>${hp ? `<small>${hp.value}/${hp.max} ${t("Combat.HP")} · ${t("Combat.AC")} ${escapeHTML(stats.ac)}</small><span class="ws-companion-hp" role="meter" aria-label="${t("Combat.HP")}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${Math.max(0, Math.min(total, hp.value))}"><span style="width:${width}%"></span></span>` : ""}${!scene || ambiguous ? `<small>${status}</small>` : ""}${initiative.sc?.phaseName ? `<small>${escapeHTML(initiative.sc.phaseName)}${initiative.sc.done ? ` · ${t("SC.Done")}` : initiative.sc.isTurn && initiative.sc.moved && initiative.sc.half === "move" ? ` · ${t("SC.Moved")}` : ""}</small>` : ""}</span>
      </button>
      <div class="ws-companion-controls">
        ${combatMode ? `<button type="button" class="ws-button ws-companion-initiative" data-action="companioninitiative" ${address} title="${t("Labels.Initiative")}: ${initiativeLabel}" aria-label="${t("Labels.Initiative")}: ${escapeHTML(name)}. ${tokenInitiatives.length && rollState.value != null ? `${escapeHTML(rollState.value)}. ` : ""}${initiativeLabel}" ${!rolling && tokenInitiatives.some(state => state.canRoll) ? "" : "disabled"}>${rollState.sc && !rollState.sc.usesInitiative ? `<strong>—</strong>` : tokenInitiatives.length && rollState.value != null ? `<strong>${escapeHTML(rollState.value)}</strong>` : '<i class="fa-solid fa-dice-d20" aria-hidden="true"></i>'}</button>` : ""}
        ${
          scene
            ? `<button type="button" class="ws-button ws-companion-vision" data-action="companionvision" ${address} aria-pressed="${active}" title="${reason ? t(reason) : eyeLabel}" aria-label="${eyeLabel}: ${escapeHTML(name)}" ${actor && scene && !reason ? "" : "disabled"}><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
<button type="button" class="ws-button" data-action="companionping" ${address} title="${t("Companions.Ping")}" aria-label="${t("Companions.Ping")}: ${escapeHTML(name)}" ${actor && (entry.token || entry.tokenOptions.length) ? "" : "disabled"}><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i></button>`
            : `<button type="button" class="ws-companion-place ws-button" data-action="companionplace" ${address} title="${t(canPlace ? "Companions.Place" : "Companions.PlacePermission")}" aria-label="${t("Companions.Place")}: ${escapeHTML(name)}" ${!placing && canPlace ? "" : "disabled"}><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`
        }
        <button type="button" class="ws-button" data-action="companionsheet" ${address} title="${t("GM.Sheet")}" aria-label="${t("GM.Sheet")}: ${escapeHTML(name)}" ${actor ? "" : "disabled"}><i class="fa-solid fa-book-open" aria-hidden="true"></i></button>
      </div>
    </div>
    ${
      effects.length
        ? `<div class="ws-companion-effects" role="group" aria-label="${t("Companions.Effects")}: ${escapeHTML(name)}">${effects
            .map(effect => {
              const label = game.i18n.localize(
                effect.name ?? effect.label ?? ""
              );
              return `<span role="img" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"><img src="${escapeHTML(effect.img ?? effect.icon ?? "icons/svg/aura.svg")}" alt=""></span>`;
            })
            .join("")}</div>`
        : ""
    }
    </article>`;
    })
    .join("");
  return `<section class="ws-companions-list" aria-label="${t("Companions.Title")}"><div class="ws-companion-toolbar"><div class="ws-companion-filters" role="group" aria-label="${t("Companions.Filter")}">${["scene", "all", ...(familiars.length ? ["familiars"] : [])].map(value => `<button type="button" class="ws-button" data-action="companionfilter" data-companion-filter="${value}" aria-pressed="${effectiveFilter === value}">${t(value === "scene" ? "Companions.Scene" : value === "familiars" ? "Companions.Familiars" : "Companions.All")} · ${value === "scene" ? onScene.length : value === "familiars" ? familiars.length : entries.length}</button>`).join("")}</div>${groupInitiative.length > 0 && groupInitiative.some(state => state.canRoll) ? `<button type="button" class="ws-button ws-companion-roll-all" data-action="companionsinitiative" title="${t("Companions.RollAllHint")}" ${!rolling && groupInitiative.some(state => state.canRoll) ? "" : "disabled"}><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${t("Companions.RollAll")}</button>` : ""}</div>${rows || `<div class="ws-empty">${t(filter === "scene" ? "Companions.EmptyScene" : "Companions.Empty")}</div>`}</section>`;
}
