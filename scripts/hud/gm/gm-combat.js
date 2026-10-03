import { getCurrentCombat } from "../../runtime-helpers.js";
import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";

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
  Boolean(combatant?.isDefeated ?? combatant?.defeated) ||
  Boolean(
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
      (!sceneId || combatant.sceneId === sceneId) &&
      (actor.type === "character" ||
        includePlayerNpcs ||
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
      const active = list.find(
        combatant =>
          combatant.id === followedId &&
          (combatant.token.actor ?? combatant.actor)?.type === "npc" &&
          (!defeated(combatant) ||
            forceFollow ||
            readSetting(SETTINGS.gmHighlightDead))
      );
      if (active) return remember(active, combat, list);
    }
    if (current) return current;
    const token = selectedToken?.document ?? selectedToken;
    const preferred = token?.id
      ? list.find(combatant => combatant.tokenId === token.id)
      : null;
    const active = list.find(
      combatant =>
        combatant.id === combat?.combatant?.id &&
        (combatant.token.actor ?? combatant.actor)?.type === "npc" &&
        !defeated(combatant)
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
    if (
      !isGM() ||
      memory.combatantId !== expectedId ||
      getCombat()?.combatant?.id !== expectedId
    )
      return;
    const before = sync();
    memory.endingTurn = true;
    try {
      await execute();
      const combat = getCombat();
      memory.suppressedTurn = `${combat?.id}:${combat?.round}:${combat?.turn}:${combat?.combatant?.id}`;
      if (isGM() && readSetting(SETTINGS.gmAutoAdvance)) {
        const list = roster();
        const index = list.findIndex(entry => entry.id === expectedId);
        const ordered = [...list.slice(index + 1), ...list.slice(0, index + 1)];
        remember(
          ordered.find(
            entry =>
              (entry.token.actor ?? entry.actor)?.type === "npc" &&
              entry.id !== expectedId &&
              !defeated(entry)
          ) ?? before
        );
      }
      return sync();
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
  const initiativeOrder = combat?.turns ?? entries(combat?.combatants);
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
  const renderCard = (combatant, selectable = true) => {
    const actor = combatant.token?.actor ?? combatant.actor;
    const hp = actor ? adapter.combatStats(actor).hp : { value: "—", max: "—" };
    const tag = selectable ? "button" : "div";
    return `<${tag} data-combatant-id="${escapeHTML(combatant.id)}" ${preparing ? `data-reset-initiative-id="${escapeHTML(combatant.id)}"` : ""} ${selectable ? `type="button" data-action="gmselect" aria-pressed="${combatant.id === selectedId}"` : 'tabindex="0"'} class="ws-button ws-gm-creature ${isPlayer(combatant) ? "ws-gm-player-creature" : ""} ${defeated(combatant) ? "ws-gm-defeated" : ""} ${selectable && combatant.id === selectedId ? "ws-selected" : ""} ${combatant.id === combat?.combatant?.id ? "ws-active" : ""}" title="${escapeHTML(combatant.name ?? actor?.name)}${preparing ? ` · ${escapeHTML(t("GM.ResetInitiativeHint"))}` : ""}">
      <span class="ws-gm-token-hp" title="${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}"><span style="width:${hp.max > 0 ? Math.min(100, Math.max(0, (hp.value / hp.max) * 100)) : 0}%"></span><b>${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}</b></span>
      <img src="${escapeHTML(combatant.token?.texture?.src || actor?.img || "icons/svg/mystery-man.svg")}" alt="" loading="lazy">
      <strong>${isPlayer(combatant) ? `<i class="fa-solid fa-user ws-gm-player-marker" title="${t("GM.Players")}" aria-label="${t("GM.Players")}"></i> ` : ""}${escapeHTML(combatant.name ?? actor?.name)}</strong>
      <small>${escapeHTML(combatant.initiative ?? "—")}</small>
      ${combatant.hidden ? `<i class="fa-solid fa-eye-slash" title="${t("GM.Hidden")}"></i>` : ""}${defeated(combatant) ? `<i class="fa-solid fa-skull" title="${t("GM.Defeated")}"></i>` : ""}
    </${tag}>`;
  };
  return `<section class="ws-gm-combat ${preparing ? "ws-gm-preparation" : ""}">
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
    ${!combat ? `<button type="button" class="ws-button" data-action="gmcreatecombat"><i class="fa-solid fa-plus" aria-hidden="true"></i>${t("GM.CreateCombat")}</button>` : ""}
    ${
      preparing
        ? `<section class="ws-gm-encounter-tools"><h3>${t("GM.CombatSetup")}</h3>
    <div class="ws-gm-setup"><button type="button" class="ws-button" data-action="gmaddcreatures"><i class="fa-solid fa-users" aria-hidden="true"></i>${t("GM.AddCreatures")}</button><button type="button" class="ws-button" data-action="gmaddcreatures" data-scope="all"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>${t("GM.AddSceneCreatures")}</button></div>
    <div class="ws-gm-initiative-controls">${combat && list.length ? `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="all" data-reroll="false"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${t("GM.RollAllInitiative")}</button>` : ""}</div>
    <details class="ws-gm-initiative-options"><summary data-gm-initiative-options>${t("GM.MoreInitiative")}</summary><div class="ws-gm-initiative-controls">${(combat &&
    list.length
      ? [
          ["selected", false, "GM.RollSelectedInitiative"],
          ["selected", true, "GM.RerollSelectedInitiative"],
          ["all", true, "GM.RerollAllInitiative"]
        ]
      : []
    )
      .map(
        ([scope, reroll, label]) =>
          `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="${scope}" data-reroll="${reroll}" ${combat && list.length ? "" : "disabled"}><i class="fa-solid ${reroll ? "fa-rotate" : "fa-dice-d20"}" aria-hidden="true"></i>${t(label)}</button>`
      )
      .join(
        ""
      )}</div>${combat ? `<button type="button" class="ws-button" data-action="gmresetinitiative" ${(combat.turns ?? entries(combat.combatants)).some(entry => entry.initiative != null) ? "" : "disabled"}><i class="fa-solid fa-eraser" aria-hidden="true"></i>${t("GM.ResetInitiative")}</button>` : ""}</details></section>`
        : ""
    }
    ${combat && !combat.started ? `<button type="button" class="ws-button ws-gm-start" data-action="gmstartcombat"><i class="fa-solid fa-play" aria-hidden="true"></i>${t("GM.StartCombat")}</button>` : ""}
    ${preparing ? '<div class="ws-gm-preparation-rosters">' : ""}
    ${preparing ? `<details class="ws-gm-list" ${controller.memory?.collapsed ? "" : "open"}><summary>${t("GM.Creatures")} · ${monsters.length}</summary>` : '<section class="ws-gm-list">'}<div class="ws-gm-roster">${monsters
      .map(entry =>
        renderCard(
          entry,
          list.some(npc => npc.id === entry.id)
        )
      )
      .join("")}</div>${preparing ? "</details>" : "</section>"}
    ${
      preparing
        ? `<details class="ws-gm-list ws-gm-player-roster" open><summary>${t("GM.Players")} · ${players.length}</summary><div class="ws-gm-roster">${players
            .map(entry =>
              renderCard(
                entry,
                list.some(candidate => candidate.id === entry.id)
              )
            )
            .join(
              ""
            )}</div>${players.length ? "" : `<div class="ws-empty">${t("GM.NoPlayers")}</div>`}</details></div>`
        : ""
    }
    ${showRemoval && combat?.started ? `<div class="ws-gm-tools">${renderGmTurnControls(combat, t)}${renderGmInitiativeButtons(combat, list, t)}${renderGmRemovalButton(list, t)}${renderGmEndCombatButton(combat, t)}</div>` : ""}
    ${combat && !list.length ? `<div class="ws-empty">${t("GM.NoCreatures")}</div>` : ""}
  </section>`;
}

export function renderGmRemovalButton(list, t) {
  const count = list.filter(
    entry => defeated(entry) && !hasPlayerOwner(entry)
  ).length;
  return `<button type="button" class="ws-button" data-action="gmremovedead" ${count ? "" : "disabled"}><i class="fa-solid fa-skull" aria-hidden="true"></i>${t("GM.RemoveDead")} · ${count}</button>`;
}

export function renderGmInitiativeButtons(combat, list, t) {
  if (!combat?.started) return "";
  const roll = reroll =>
    `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="all" data-reroll="${reroll}" ${list.length ? "" : "disabled"}><i class="fa-solid ${reroll ? "fa-rotate" : "fa-dice-d20"}" aria-hidden="true"></i>${t(reroll ? "GM.RerollAllInitiative" : "GM.RollAllInitiative")}</button>`;
  return roll(false);
}

export function renderGmEndCombatButton(combat, t) {
  return combat
    ? `<button type="button" class="ws-button ws-gm-end-combat" data-action="gmendcombat" title="${t("GM.EndCombat")}" aria-label="${t("GM.EndCombat")}" ${combat.started ? "" : "disabled"}><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>${t("GM.EndCombat")}</button>`
    : "";
}

export function renderGmTurnControls(combat, t) {
  const control = (action, icon, label, disabled = false) =>
    `<button type="button" class="ws-button" data-action="${action}" title="${t(label)}" aria-label="${t(label)}" ${disabled ? "disabled" : ""}><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="ws-gm-navigation">${control("gmprevious", "fa-backward-step", "GM.PreviousTurn", !combat?.started)}<button type="button" class="ws-button ${getSetting(SETTINGS.gmFollowTurn) ? "ws-active" : ""}" data-action="gmfollow" title="${t("GM.Follow")}" aria-label="${t("GM.Follow")}" aria-pressed="${Boolean(getSetting(SETTINGS.gmFollowTurn))}"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span>${t("GM.Follow")}</span></button>${control("gmnext", "fa-forward-step", "GM.NextTurn", !combat?.started)}</div>`;
}
