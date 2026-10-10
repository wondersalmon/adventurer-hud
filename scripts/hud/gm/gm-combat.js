import { activeEffectSummaries } from "../effect-summaries.js";
import { getCurrentCombat } from "../../runtime-helpers.js";
import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";
import {
  readScInitiative,
  scTurnLabel,
  canScGoBack
} from "../../compatibility/sc-venaerys-initiative.js";
import { renderScPhaseStatus } from "../combat-initiative.js";

const entries = collection => [...(collection?.values?.() ?? collection ?? [])];

export function gmWindowTitle(combat, actorName, t, tf) {
  return [
    combat?.scene?.name ||
      combat?.name?.trim() ||
      t(combat ? "GM.Combat" : "GM.NoCombat"),
    combat ? tf("GM.Round", { round: combat.round ?? 0 }) : "",
    actorName || combat?.combatant?.name || ""
  ]
    .filter(Boolean)
    .join(" · ");
}
export const defeated = combatant =>
  Boolean(
    combatant?.isDefeated ??
    combatant?.defeated ??
    (combatant?.token?.actor ?? combatant?.actor)?.statuses?.has(
      globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead"
    )
  );

// Destructive actions protect player ownership even when the player is offline.
export function hasPlayerOwner(combatant) {
  const actor = combatant?.token?.actor ?? combatant?.actor;
  return (
    (combatant?.players ?? []).some(user => !user.isGM) ||
    [...(globalThis.game?.users?.values?.() ?? [])].some(
      user => !user.isGM && actor?.testUserPermission?.(user, "OWNER")
    )
  );
}

export function gmRoster(
  combat,
  { isGM, sceneId, includePlayerNpcs = false, includeCharacters = false }
) {
  if (!isGM) return [];
  return (combat?.turns ?? entries(combat?.combatants)).filter(combatant => {
    const actor = combatant.token?.actor ?? combatant.actor;
    return (
      (actor?.type === "npc" ||
        (includeCharacters && actor?.type === "character")) &&
      actor.isOwner &&
      combatant.token &&
      (!globalThis.canvas?.scene?.tokens?.get ||
        globalThis.canvas.scene.tokens.get(
          combatant.tokenId ?? combatant.token.id
        ) === combatant.token) &&
      (!sceneId || combatant.sceneId === sceneId) &&
      (actor.type === "character" ||
        includePlayerNpcs ||
        (includeCharacters && combatant.id === combat.combatant?.id) ||
        !(combatant.players ?? []).some(user => user.active && !user.isGM))
    );
  });
}

export function createGmCombatController({
  memory,
  getGame = () => game,
  getSceneId = () => canvas.scene?.id,
  readSetting = getSetting,
  writeSetting = setSetting
}) {
  const isGM = () => Boolean(getGame().user?.isGM);
  const combats = () =>
    isGM()
      ? entries(getGame().combats).filter(
          combat => !combat.scene || combat.scene.id === getSceneId()
        )
      : [];
  const getCombat = () => {
    if (!isGM()) return null;
    const available = combats();
    const current = getCurrentCombat(getGame());
    return (
      available.find(combat => combat.id === memory.combatId) ??
      (current && (!current.scene || current.scene.id === getSceneId())
        ? current
        : available[0]) ??
      null
    );
  };
  const rosterFor = combat =>
    gmRoster(combat, {
      isGM: isGM(),
      sceneId: getSceneId(),
      includeCharacters: true,
      includePlayerNpcs: readSetting(SETTINGS.gmIncludePlayerNpcs)
    });
  const roster = () => rosterFor(getCombat());
  const remember = (
    combatant,
    combat = getCombat(),
    list = rosterFor(combat)
  ) => {
    memory.combatId = combat?.id ?? null;
    memory.combatantId = combatant?.id ?? null;
    if (combatant) memory.index = list.indexOf(combatant);
    return combatant;
  };
  /** @param {{follow?: boolean, forceFollow?: boolean, selectedToken?: any}} options */
  const sync = ({
    follow = false,
    forceFollow = false,
    selectedToken
  } = {}) => {
    if (!isGM()) return null;
    const combat = getCombat();
    if (memory.combatId && memory.combatId !== combat?.id) {
      memory.combatantId = null;
      memory.index = 0;
      memory.suppressedTurn = null;
    }
    const list = rosterFor(combat);
    const current = list.find(combatant => combatant.id === memory.combatantId);
    const turnKey = `${combat?.id}:${combat?.round}:${combat?.turn}:${combat?.combatant?.id}`;
    if (memory.suppressedTurn && memory.suppressedTurn !== turnKey)
      memory.suppressedTurn = null;
    if (
      (follow || forceFollow) &&
      !memory.endingTurn &&
      (forceFollow || memory.suppressedTurn !== turnKey) &&
      (forceFollow || readSetting(SETTINGS.gmFollowTurn))
    ) {
      const followedId = combat?.started
        ? combat?.combatant?.id
        : list.find(
            entry =>
              (entry.token.actor ?? entry.actor)?.type === "npc" &&
              !defeated(entry)
          )?.id;
      const active = list.find(combatant => combatant.id === followedId);
      if (active) return remember(active, combat, list);
    }
    if (current) return current;
    const token = selectedToken?.document ?? selectedToken;
    const preferred = token?.id
      ? list.find(combatant => combatant.tokenId === token.id)
      : null;
    const active = list.find(
      combatant => combatant.id === combat?.combatant?.id
    );
    const eligible = list.filter(
      combatant =>
        (combatant.token.actor ?? combatant.actor)?.type === "npc" &&
        !defeated(combatant)
    );
    return remember(
      preferred ??
        (memory.combatantId
          ? eligible.find(
              combatant => list.indexOf(combatant) >= (memory.index ?? 0)
            )
          : active) ??
        eligible[0] ??
        list[0],
      combat,
      list
    );
  };
  const select = async id => {
    const combatant = roster().find(entry => entry.id === id);
    if (!combatant) return null;
    remember(combatant);
    await writeSetting(SETTINGS.gmFollowTurn, false);
    return combatant;
  };
  const chooseCombat = id => {
    if (!combats().some(combat => combat.id === id)) return false;
    memory.combatId = id;
    memory.combatantId = null;
    sync();
    return true;
  };
  const endTurn = async (expectedId, execute) => {
    if (!isGM() || memory.combatantId !== expectedId) return;
    sync();
    const beforeCombat = getCombat();
    memory.endingTurn = true;
    try {
      await execute();
      const combat = getCombat();
      if (combat !== beforeCombat || !isGM()) return null;
      memory.endingTurn = false;
      memory.suppressedTurn = null;
      return sync({ forceFollow: true });
    } finally {
      memory.endingTurn = false;
    }
  };
  const resumeFollow = () => {
    if (isGM()) memory.suppressedTurn = null;
  };
  return {
    memory,
    combats,
    getCombat,
    roster,
    sync,
    select,
    chooseCombat,
    endTurn,
    isGM,
    resumeFollow
  };
}

export function renderGmCombatHeader({
  controller,
  selectedId,
  showRemoval = true,
  adapter,
  escapeHTML,
  t
}) {
  if (!controller.isGM()) return "";
  const combat = controller.getCombat();
  const list = controller.roster();
  const preparing = !combat?.started;
  const sc = readScInitiative(combat);
  const initiativeOrder = (combat?.turns ?? entries(combat?.combatants)).filter(
    entry =>
      entry.token &&
      (!globalThis.canvas?.scene?.tokens?.get ||
        globalThis.canvas.scene.tokens.get(entry.tokenId ?? entry.token.id) ===
          entry.token)
  );
  const isPlayer = entry => {
    const actor = entry.token?.actor ?? entry.actor;
    return (
      actor?.type === "character" ||
      (entry.players ?? []).some(user => !user.isGM)
    );
  };
  const players = preparing ? initiativeOrder.filter(isPlayer) : [];
  const monsters = preparing
    ? list.filter(entry => !players.some(player => player.id === entry.id))
    : initiativeOrder;
  const statusDefinitions = adapter.statusDefinitions?.() ?? [];
  const renderCard = (combatant, selectable = true) => {
    const scState = sc ? readScInitiative(combat, combatant) : null;
    const actor = combatant.token?.actor ?? combatant.actor;
    const name =
      actor?.type === "character"
        ? actor.name || combatant.name
        : (combatant.name ?? actor?.name);
    const hp = actor ? adapter.combatStats(actor).hp : { value: "—", max: "—" };
    const tag = selectable ? "button" : "div";
    const statuses = actor
      ? activeEffectSummaries(actor, statusDefinitions)
      : [];
    const hpRatio =
      hp.max > 0 ? Math.min(1, Math.max(0, hp.value / hp.max)) : 0;
    const effectLabels = statuses.map(status =>
      game.i18n.localize(status.name ?? status.label ?? status.id)
    );
    const tooltip = `<strong>${escapeHTML(name)}</strong><div>${t("Combat.HP")} ${escapeHTML(hp.value)}/${escapeHTML(hp.max)}${hp.temp ? ` +${escapeHTML(hp.temp)}` : ""}</div>${statuses.length ? `<div class="ws-gm-hover-effects">${statuses.map((status, index) => `<span><img src="${escapeHTML(status.img ?? status.icon ?? "icons/svg/aura.svg")}" alt=""><span>${escapeHTML(effectLabels[index])}</span></span>`).join("")}</div>` : `<div>${t("GM.NoEffects")}</div>`}`;
    const initiativeButton = scState
      ? `<button type="button" class="ws-button ws-gm-roster-initiative" data-action="sctracker" title="${t("SC.OpenTracker")}" aria-label="${escapeHTML(t("SC.OpenTracker") + ": " + name)}">${escapeHTML(scState.usesInitiative ? (combatant.initiative ?? "—") : "—")}</button>`
      : `<button type="button" class="ws-button ws-gm-roster-initiative" ${combatant.initiative != null ? 'aria-haspopup="dialog"' : ""} data-action="gmeditinitiative" data-combatant-id="${escapeHTML(combatant.id)}" title="${t(combatant.initiative == null ? "GM.RollSelectedInitiative" : "GM.EditInitiative")}" aria-label="${escapeHTML(t("GM.EditInitiative") + ": " + name + " · " + (combatant.initiative ?? "—"))}">${escapeHTML(combatant.initiative ?? "—")}<i class="fa-solid fa-pen" aria-hidden="true"></i></button>`;
    return `<div class="ws-gm-roster-entry"><${tag} data-combatant-id="${escapeHTML(combatant.id)}" ${preparing ? `data-reset-initiative-id="${escapeHTML(combatant.id)}"` : ""} ${selectable ? `type="button" data-action="gmselect" aria-pressed="${combatant.id === selectedId}"` : 'tabindex="0"'} ${tooltip ? `data-tooltip="${escapeHTML(tooltip)}" data-tooltip-class="ws-gm-effects-tooltip"` : ""} class="ws-button ws-gm-creature ${isPlayer(combatant) ? "ws-gm-player-creature" : ""} ${defeated(combatant) ? "ws-gm-defeated" : ""} ${selectable && combatant.id === selectedId ? "ws-selected" : ""} ${(scState ? scState.isActing : combatant.id === combat?.combatant?.id) ? "ws-active" : ""}" title="${escapeHTML(name)}">
      <span class="ws-gm-token-hp ${hpRatio <= 0 ? "ws-hp-empty" : hpRatio <= 0.5 ? "ws-hp-low" : "ws-hp-healthy"}" title="${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}"><span style="width:${hp.max > 0 ? Math.min(100, Math.max(0, (hp.value / hp.max) * 100)) : 0}%"></span><b>${hp.value}/${hp.max}${hp.temp ? `<span class="ws-gm-temp-hp"> +${hp.temp}</span>` : ""}</b></span>
      <span class="ws-gm-portrait-slot" aria-hidden="true"></span>
      <strong>${isPlayer(combatant) ? `<i class="fa-solid fa-user ws-gm-player-marker" title="${t("GM.Players")}" aria-label="${t("GM.Players")}"></i> ` : ""}${escapeHTML(name)}</strong>
      ${statuses.length ? `<span class="ws-gm-roster-effect-marker" role="img" aria-label="${escapeHTML(t("HudLayout.Effects") + ": " + statuses.length)}"></span>` : ""}

      ${defeated(combatant) ? `<i class="fa-solid fa-skull" title="${t("GM.Defeated")}"></i>` : ""}
    </${tag}><button type="button" class="ws-button ws-gm-roster-image" data-action="gmimage" data-combatant-id="${escapeHTML(combatant.id)}" title="${t("GM.OpenImage")}" aria-label="${escapeHTML(t("GM.OpenImage") + ": " + name)}"><img src="${escapeHTML(combatant.token?.texture?.src || actor?.img || "icons/svg/mystery-man.svg")}" alt="" loading="lazy"></button>${initiativeButton}<div class="ws-gm-roster-flags">${scState?.isTurn ? `<button type="button" class="ws-button" data-action="scdone" data-combatant-id="${escapeHTML(combatant.id)}" title="${escapeHTML(scTurnLabel(scState, t) + ": " + name)}" aria-label="${escapeHTML(scTurnLabel(scState, t) + ": " + name)}" ${scState.isActing ? "" : "disabled"}><i class="fa-solid fa-check" aria-hidden="true"></i>${scTurnLabel(scState, t)}</button>` : ""}${renderGmHiddenButton(combatant, t, escapeHTML)}${renderGmDefeatedButton(combatant, t, escapeHTML)}<button type="button" class="ws-button" data-action="gmping" data-combatant-id="${escapeHTML(combatant.id)}" title="${t("GM.Ping")}" aria-label="${escapeHTML(t("GM.Ping") + ": " + name)}"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i></button><button type="button" class="ws-button" data-action="gmcenter" data-combatant-id="${escapeHTML(combatant.id)}" title="${t("GM.ToToken")}" aria-label="${escapeHTML(t("GM.ToToken") + ": " + name)}"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></button>${preparing ? `<button type="button" class="ws-button ws-gm-roster-remove" data-action="gmremovecombatants" data-combatant-id="${escapeHTML(combatant.id)}" title="${t("GM.RemoveCombatants")}" aria-label="${escapeHTML(t("GM.RemoveCombatants") + ": " + name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}</div></div>`;
  };
  return `${preparing ? '<div class="ws-gm-preparation-frame">' : ""}<section class="ws-gm-combat ${preparing ? "ws-gm-preparation" : ""}">
    ${renderScPhaseStatus(sc, t, escapeHTML)}
    <div class="ws-gm-toolbar">
      ${
        controller.combats().length > 1
          ? `<select data-gm-combat-select aria-label="${t("GM.ChooseCombat")}">${controller
              .combats()
              .map(
                entry =>
                  `<option value="${escapeHTML(entry.id)}" ${entry.id === combat?.id ? "selected" : ""}>${escapeHTML(entry.name?.trim() || entry.scene?.name || t("GM.Combat"))}</option>`
              )
              .join("")}</select>`
          : ""
      }
    </div>
    ${preparing ? '<section class="ws-gm-preparation-controls">' : ""}
    ${!combat ? `<button type="button" class="ws-button" data-action="gmcreatecombat"><i class="fa-solid fa-plus" aria-hidden="true"></i>${t("GM.CreateCombat")}</button>` : ""}
    ${
      preparing
        ? `<section class="ws-gm-encounter-tools"><h3>${t("GM.CombatSetup")}</h3><p class="ws-gm-readiness">${t("GM.InitiativeReady")} · ${initiativeOrder.filter(entry => entry.initiative != null).length}/${initiativeOrder.length}</p>
    <div class="ws-gm-setup"><button type="button" class="ws-button" data-action="gmaddcreatures"><i class="fa-solid fa-users" aria-hidden="true"></i>${t("GM.AddCreatures")}</button><button type="button" class="ws-button" data-action="gmaddcreatures" data-scope="all"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>${t("GM.AddSceneCreatures")}</button></div>
    <div class="ws-gm-initiative-controls">${renderGmInitiativeButtons(combat, list, t, { resets: true })}</div>
    ${combat ? `<div class="ws-gm-initiative-controls"><button type="button" class="ws-button" data-action="gmremovecombatants" data-scope="all" ${initiativeOrder.length ? "" : "disabled"}><i class="fa-solid fa-user-minus" aria-hidden="true"></i>${t("GM.RemoveAllCombatants")}</button><button type="button" class="ws-button" data-action="gmremovecombatants" data-scope="npc" ${initiativeOrder.some(entry => entry.isNPC ?? !hasPlayerOwner(entry)) ? "" : "disabled"}><i class="fa-solid fa-user-minus" aria-hidden="true"></i>${t("GM.RemoveNpcCombatants")}</button></div>` : ""}
</section>`
        : ""
    }
    ${preparing ? '</section><div class="ws-gm-preparation-rosters">' : ""}
    ${preparing ? `<section class="ws-gm-preparation-creatures"><details class="ws-gm-list" ${controller.memory?.collapsed ? "" : "open"}><summary>${t("GM.Creatures")} · ${monsters.length}</summary>` : '<section class="ws-gm-list">'}<div class="ws-gm-roster">${monsters
      .map(entry =>
        renderCard(
          entry,
          list.some(npc => npc.id === entry.id)
        )
      )
      .join("")}</div>${preparing ? "</details></section>" : "</section>"}
    ${
      preparing
        ? `<section class="ws-gm-preparation-players"><details class="ws-gm-list ws-gm-player-roster" open><summary>${t("GM.Players")} · ${players.length}</summary><div class="ws-gm-roster">${players
            .map(entry =>
              renderCard(
                entry,
                list.some(candidate => candidate.id === entry.id)
              )
            )
            .join(
              ""
            )}</div>${players.length ? "" : `<div class="ws-empty">${t("GM.NoPlayers")}</div>`}</details></section></div>`
        : ""
    }
    ${showRemoval && combat?.started ? `<div class="ws-gm-tools">${renderGmTurnControls(combat, t)}${renderGmInitiativeButtons(combat, list, t)}${renderGmRemovalButton(list, t)}${renderGmRevealButton(combat, t)}${renderGmEndCombatButton(combat, t)}</div>` : ""}
    ${combat && !list.length ? `<div class="ws-empty">${t("GM.NoCreatures")}</div>` : ""}
  </section>${preparing ? `${combat ? `<footer class="ws-gm-preparation-footer">${renderGmRevealButton(combat, t)}<button type="button" class="ws-button ws-gm-start" data-action="gmstartcombat"><i class="fa-solid fa-play" aria-hidden="true"></i>${t("GM.StartCombat")}</button></footer>` : ""}</div>` : ""}`;
}

export function renderGmRemovalButton(list, t) {
  const count = list.filter(
    entry => defeated(entry) && !hasPlayerOwner(entry)
  ).length;
  return `<button type="button" class="ws-button" data-action="gmremovedead" ${count ? "" : "disabled"}><i class="fa-solid fa-skull" aria-hidden="true"></i>${t("GM.RemoveDead")} · ${count}</button>`;
}

export const canHideCombatant = combatant => {
  const token = combatant?.token;
  return Boolean(
    token?.isOwner &&
    (token.actor ?? combatant.actor)?.type === "npc" &&
    !hasPlayerOwner(combatant)
  );
};

export function renderGmHiddenButton(combatant, t, escapeHTML) {
  if (!canHideCombatant(combatant)) return "";
  const hidden = Boolean(combatant.token.hidden);
  const label = t(hidden ? "GM.ShowToken" : "GM.HideToken");
  return `<button type="button" class="ws-button ws-gm-hidden-toggle ${hidden ? "ws-active" : ""}" data-action="gmhidden" data-combatant-id="${escapeHTML(combatant.id)}" aria-pressed="${hidden}" title="${label}" aria-label="${escapeHTML(label + ": " + (combatant.name ?? combatant.actor?.name ?? ""))}"><i class="fa-solid ${hidden ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i><span>${t(hidden ? "GM.Hidden" : "GM.Visible")}</span></button>`;
}

export function renderGmDefeatedButton(combatant, t, escapeHTML) {
  if (!(combatant?.token?.actor ?? combatant?.actor)?.isOwner) return "";
  const active = defeated(combatant);
  const label = t(active ? "GM.UnmarkDefeated" : "GM.MarkDefeated");
  return `<button type="button" class="ws-button ws-gm-defeated-toggle ${active ? "ws-active" : ""}" data-action="gmdefeated" data-combatant-id="${escapeHTML(combatant.id)}" aria-pressed="${active}" title="${label}" aria-label="${escapeHTML(label + ": " + (combatant.name ?? combatant.actor?.name ?? ""))}"><i class="fa-solid fa-skull" aria-hidden="true"></i><span>${label}</span></button>`;
}

export function renderGmRevealButton(combat, t) {
  if (!combat) return "";
  const count = entries(combat.combatants).filter(
    entry => canHideCombatant(entry) && entry.token.hidden
  ).length;
  return `<button type="button" class="ws-button ws-gm-reveal-all" data-action="gmrevealhidden" ${count ? "" : "disabled"}><i class="fa-solid fa-eye" aria-hidden="true"></i>${t("GM.RevealHidden")} · ${count}</button>`;
}

export function renderGmInitiativeButtons(
  combat,
  list,
  t,
  { resets = false } = {}
) {
  if (!combat) return "";
  const sc = readScInitiative(combat);
  if (sc) {
    return `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="players" data-reroll="false" title="${t("SC.RollInTracker")}" disabled><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${t("SC.RollPlayers")}</button>`;
  }
  return (
    [
      ["all", "GM.RollAllInitiative", "fa-dice-d20"],
      ["npc", "GM.RollNpcInitiative", "fa-dragon"]
    ]
      .map(
        ([scope, label, icon]) =>
          `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="${scope}" data-reroll="false" ${(combat.combatants?.size ?? list.length) ? "" : "disabled"}><i class="fa-solid ${icon}" aria-hidden="true"></i>${t(label)}</button>`
      )
      .join("") +
    (resets
      ? [
          ["all", "GM.ResetAllInitiative"],
          ["npc", "GM.ResetNpcInitiative"]
        ]
          .map(
            ([scope, label]) =>
              `<button type="button" class="ws-button" data-action="gmresetinitiative" data-scope="${scope}" ${combat && (combat.turns ?? entries(combat.combatants)).some(entry => entry.initiative != null && (scope === "all" || (entry.isNPC ?? !hasPlayerOwner(entry)))) ? "" : "disabled"}><i class="fa-solid fa-eraser" aria-hidden="true"></i>${t(label)}</button>`
          )
          .join("")
      : "")
  );
}

export function renderGmEndCombatButton(combat, t) {
  return combat
    ? `<button type="button" class="ws-button ws-gm-end-combat" data-action="gmendcombat" title="${t("GM.EndCombat")}" aria-label="${t("GM.EndCombat")}" ${combat.started ? "" : "disabled"}><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>${t("GM.EndCombat")}</button>`
    : "";
}

export function renderGmTurnControls(combat, t) {
  const sc = readScInitiative(combat);
  const control = (action, icon, label, disabled = false) =>
    `<button type="button" class="ws-button" data-action="${action}" title="${t(label)}" aria-label="${t(label)}" ${disabled ? "disabled" : ""}><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="ws-gm-navigation">${control("gmprevious", "fa-backward-step", sc ? "SC.PreviousPhase" : "GM.PreviousTurn", !canGoToPreviousTurn(combat))}<button type="button" class="ws-button ${getSetting(SETTINGS.gmFollowTurn) ? "ws-active" : ""}" data-action="gmfollow" title="${t("GM.Follow")}" aria-label="${t("GM.Follow")}" aria-pressed="${Boolean(getSetting(SETTINGS.gmFollowTurn))}"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span>${t("GM.Follow")}</span></button>${control("gmnext", "fa-forward-step", sc ? "SC.NextPhase" : "GM.NextTurn", !combat?.started || Boolean(sc && !sc.valid))}</div>`;
}

export const canGoToPreviousTurn = combat =>
  canScGoBack(combat) ??
  Boolean(
    combat?.started && (Number(combat.round) > 1 || Number(combat.turn) > 0)
  );
