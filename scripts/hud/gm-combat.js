import { getCurrentCombat } from "../runtime-helpers.js";
import { getSetting, setSetting, SETTINGS } from "../settings.js";

const entries = collection => [...(collection?.values?.() ?? collection ?? [])];
export const defeated = combatant =>
  Boolean(combatant?.isDefeated ?? combatant?.defeated) ||
  Boolean(
    (combatant?.token?.actor ?? combatant?.actor)?.statuses?.has(
      globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead"
    )
  );

export function gmRoster(combat, { isGM, sceneId, includePlayerNpcs = false }) {
  if (!isGM) return [];
  return (combat?.turns ?? entries(combat?.combatants)).filter(combatant => {
    const actor = combatant.token?.actor ?? combatant.actor;
    return (
      actor?.type === "npc" &&
      actor.isOwner &&
      combatant.token &&
      (!sceneId || combatant.sceneId === sceneId) &&
      (includePlayerNpcs ||
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
  const roster = () =>
    gmRoster(getCombat(), {
      isGM: isGM(),
      sceneId: getSceneId(),
      includePlayerNpcs: readSetting(SETTINGS.gmIncludePlayerNpcs)
    });
  const remember = combatant => {
    memory.combatId = getCombat()?.id ?? null;
    memory.combatantId = combatant?.id ?? null;
    if (combatant) memory.index = roster().indexOf(combatant);
    return combatant;
  };
  const sync = ({
    follow = false,
    forceFollow = false,
    selectedToken
  } = {}) => {
    if (!isGM()) return null;
    if (memory.combatId && memory.combatId !== getCombat()?.id) {
      memory.combatantId = null;
      memory.index = 0;
      memory.suppressedTurn = null;
    }
    const list = roster();
    const current = list.find(combatant => combatant.id === memory.combatantId);
    const turnKey = `${getCombat()?.id}:${getCombat()?.round}:${getCombat()?.turn}:${getCombat()?.combatant?.id}`;
    if (memory.suppressedTurn && memory.suppressedTurn !== turnKey)
      memory.suppressedTurn = null;
    if (
      (follow || forceFollow) &&
      !memory.endingTurn &&
      (forceFollow || memory.suppressedTurn !== turnKey) &&
      (forceFollow || readSetting(SETTINGS.gmFollowTurn))
    ) {
      const followedId = getCombat()?.started
        ? getCombat()?.combatant?.id
        : list.find(entry => !defeated(entry))?.id;
      const active = list.find(
        combatant =>
          combatant.id === followedId &&
          (!defeated(combatant) ||
            forceFollow ||
            readSetting(SETTINGS.gmHighlightDead))
      );
      if (active) return remember(active);
    }
    if (current) return current;
    const token = selectedToken?.document ?? selectedToken;
    const preferred = list.find(combatant => combatant.tokenId === token?.id);
    const active = list.find(
      combatant =>
        combatant.id === getCombat()?.combatant?.id && !defeated(combatant)
    );
    const eligible = list.filter(combatant => !defeated(combatant));
    return remember(
      preferred ??
        (memory.combatantId
          ? eligible.find(
              combatant => list.indexOf(combatant) >= (memory.index ?? 0)
            )
          : active) ??
        eligible[0] ??
        list[0]
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
          ordered.find(entry => entry.id !== expectedId && !defeated(entry)) ??
            before
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
  t,
  tf
}) {
  if (!controller.isGM()) return "";
  const combat = controller.getCombat();
  const list = controller.roster();
  return `<section class="ws-gm-combat">
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
          : `<strong class="ws-gm-combat-name">${escapeHTML(combat?.name?.trim() || combat?.scene?.name || t(combat ? "GM.Combat" : "GM.NoCombat"))}</strong>`
      }
      <button type="button" class="ws-button" data-action="gmendcombat" title="${t("GM.EndCombat")}" aria-label="${t("GM.EndCombat")}" ${combat?.started ? "" : "disabled"}><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i></button>
    </div>
    <div class="ws-gm-turn"><span>${escapeHTML(tf("GM.Round", { round: combat?.round ?? 0 }))}</span><strong>${escapeHTML(combat?.combatant?.name ?? t("GM.NoTurn"))}</strong>
    </div>
    ${!combat ? `<button type="button" class="ws-button" data-action="gmcreatecombat"><i class="fa-solid fa-plus" aria-hidden="true"></i>${t("GM.CreateCombat")}</button>` : ""}
    ${combat && !combat.started ? `<button type="button" class="ws-button ws-gm-start" data-action="gmstartcombat"><i class="fa-solid fa-play" aria-hidden="true"></i>${t("GM.StartCombat")}</button>` : ""}
    <details class="ws-gm-encounter-tools"><summary>${t("GM.CombatSetup")}</summary>
    <div class="ws-gm-setup"><button type="button" class="ws-button" data-action="gmaddcreatures"><i class="fa-solid fa-users" aria-hidden="true"></i>${t("GM.AddCreatures")}</button><button type="button" class="ws-button" data-action="gmaddcreatures" data-scope="all"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>${t("GM.AddSceneCreatures")}</button></div>
    <div class="ws-gm-initiative-controls">${[
      ["selected", false, "GM.RollSelectedInitiative"],
      ["all", false, "GM.RollAllInitiative"],
      ["selected", true, "GM.RerollSelectedInitiative"],
      ["all", true, "GM.RerollAllInitiative"]
    ]
      .map(
        ([scope, reroll, label]) =>
          `<button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="${scope}" data-reroll="${reroll}" ${combat && list.length ? "" : "disabled"}><i class="fa-solid ${reroll ? "fa-rotate" : "fa-dice-d20"}" aria-hidden="true"></i>${t(label)}</button>`
      )
      .join("")}</div></details>
    <details class="ws-gm-list" ${controller.memory?.collapsed ? "" : "open"}><summary>${t("GM.Creatures")} · ${list.length}</summary><div class="ws-gm-roster">${list
      .map(combatant => {
        const actor = combatant.token.actor ?? combatant.actor;
        const hp = adapter.combatStats(actor).hp;
        return `<button type="button" class="ws-button ws-gm-creature ${defeated(combatant) ? "ws-gm-defeated" : ""} ${combatant.id === selectedId ? "ws-selected" : ""} ${combatant.id === combat?.combatant?.id ? "ws-active" : ""}" data-action="gmselect" data-combatant-id="${escapeHTML(combatant.id)}" aria-pressed="${combatant.id === selectedId}">
        <span class="ws-gm-token-hp" title="${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}"><span style="width:${hp.max > 0 ? Math.min(100, Math.max(0, (hp.value / hp.max) * 100)) : 0}%"></span><b>${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}</b></span>
        <img src="${escapeHTML(combatant.token.texture?.src || actor.img || "icons/svg/mystery-man.svg")}" alt="" loading="lazy">
        <strong>${escapeHTML(combatant.name ?? actor.name)}</strong>
        <small>${escapeHTML(combatant.initiative ?? "—")}</small>
        ${combatant.hidden ? `<i class="fa-solid fa-eye-slash" title="${t("GM.Hidden")}"></i>` : ""}${defeated(combatant) ? `<i class="fa-solid fa-skull" title="${t("GM.Defeated")}"></i>` : ""}
      </button>`;
      })
      .join("")}</div></details>
    ${showRemoval ? `<div class="ws-gm-tools">${renderGmTurnControls(combat, t)}${renderGmRemovalButton(list, t)}</div>` : ""}
    ${!combat || !list.length ? `<div class="ws-empty">${t(combat ? "GM.NoCreatures" : "GM.NoCombat")}</div>` : ""}
  </section>`;
}

export function renderGmRemovalButton(list, t) {
  const count = list.filter(
    entry =>
      defeated(entry) &&
      !(entry.players ?? []).some(user => user.active && !user.isGM)
  ).length;
  return `<button type="button" class="ws-button" data-action="gmremovedead" ${count ? "" : "disabled"}><i class="fa-solid fa-skull" aria-hidden="true"></i>${t("GM.RemoveDead")} · ${count}</button>`;
}

export function renderGmTurnControls(combat, t) {
  const control = (action, icon, label, disabled = false) =>
    `<button type="button" class="ws-button" data-action="${action}" title="${t(label)}" aria-label="${t(label)}" ${disabled ? "disabled" : ""}><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="ws-gm-navigation">${control("gmprevious", "fa-backward-step", "GM.PreviousTurn", !combat?.started)}<button type="button" class="ws-button ${getSetting(SETTINGS.gmFollowTurn) ? "ws-active" : ""}" data-action="gmfollow" aria-pressed="${Boolean(getSetting(SETTINGS.gmFollowTurn))}"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i>${t("GM.Follow")}</button>${control("gmnext", "fa-forward-step", "GM.NextTurn", !combat?.started)}</div>`;
}
