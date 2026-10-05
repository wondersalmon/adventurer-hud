import { hudElementHidden } from "./window/hud-layout.js";
export function createActorHeader(context) {
  const {
    actor,
    adapter,
    canRollActor = false,
    combatModeAvailable,
    escapeHTML,
    formatMod = String,
    t,
    tf,
    visibility
  } = context;
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  const classSummary = () => {
    return adapter.classSummary(actor, {
      formatLevel: level => tf("Actor.Level", { level })
    });
  };
  const inspirationControl = () => {
    if (actor.type !== "character") return "";
    const active = adapter.inspiration(actor);

    return `
        <button
          type="button"
          class="ws-header-control ws-inspiration ws-button ${active ? "ws-active" : ""}"
          data-action="inspiration"
          title="${active ? t("Actor.InspirationActive") : t("Actor.InspirationInactive")}"
          aria-pressed="${active}"
          ${canAct() ? "" : "disabled"}
        >
          <i class="fa-solid fa-star"></i>
          <span>${t("Actor.Inspiration")}</span>
        </button>
      `;
  };
  const restControls = (extra = "") =>
    actor.type !== "character"
      ? ""
      : `
    <div class="ws-rest-controls">
      ${extra}
      <button type="button" class="ws-header-control ws-button" data-action="shortrest" title="${t("Actor.ShortRest")}" aria-label="${t("Actor.ShortRest")}" ${canAct() ? "" : "disabled"}>
        <i class="fa-solid fa-campground"></i><span>${t("Actor.ShortRestShort")}</span>
      </button>
      <button type="button" class="ws-header-control ws-button" data-action="longrest" title="${t("Actor.LongRest")}" aria-label="${t("Actor.LongRest")}" ${canAct() ? "" : "disabled"}>
        <i class="fa-solid fa-moon"></i><span>${t("Actor.LongRestShort")}</span>
      </button>
    </div>`;
  const actorHeader = (extra = "", rests = "") => {
    const summary = classSummary();
    const proficiency = adapter.combatStats?.(actor)?.proficiencyBonus;
    const proficiencyControl =
      proficiency == null
        ? ""
        : `<small class="ws-actor-proficiency" title="${t("Combat.ProficiencyBonus")}" aria-label="${escapeHTML(`${t("Combat.ProficiencyBonus")} ${proficiency}`)}">${t("Combat.ProficiencyBonusShort")} <b>${escapeHTML(proficiency === "—" ? "—" : formatMod(proficiency))}</b></small>`;

    return `
      <div class="ws-actor-header">
        <button type="button" class="ws-actor-sheet-button ws-button" data-action="gmsheet" aria-label="${t("Actor.OpenSheet")}"><img
          class="ws-actor-portrait"
          data-open-actor-sheet
          src="${escapeHTML(context.portrait ?? actor.img ?? "icons/svg/mystery-man.svg")}"
          alt="${escapeHTML(actor.name)}"
          title="${t("Actor.OpenSheet")}"
        ></button>

        <button type="button" class="ws-actor-identity ws-actor-sheet-button ws-button ${context.isCompanionTurn?.() ? "ws-companion-turn" : ""}" data-action="gmsheet" data-open-actor-sheet title="${t("Actor.OpenSheet")}${context.isCompanionTurn?.() ? ` · ${t("Companions.Turn")}` : ""}">
          <strong>${escapeHTML(actor.name)}</strong>
          <span class="ws-actor-summary">${summary ? `<span class="ws-actor-class" title="${escapeHTML(summary)}">${escapeHTML(summary)}</span>` : ""}${proficiencyControl}</span>
        </button>

        <div class="ws-actor-inspiration-slot">${rests ? `<span data-hud-home-slot="rests" hidden></span>${rests}` : ""}</div>
        <div class="ws-actor-quick-controls">${extra}${context.tokenControl?.() ?? ""}</div>
      </div>
    `;
  };
  const modeButton = (action, icon, label, active = false) => `
      <button
        type="button"
        class="ws-mode-link ws-button ${active ? "ws-active" : ""}"
        data-action="${action}"
        ${active ? 'aria-current="page" disabled' : ""}
      >
        <span><i class="fa-solid ${icon}"></i>${label}</span>
      </button>
    `;
  const modeNavigation = mode => {
    if (!visibility.modeNavigation) {
      return "";
    }

    const buttons = [
      modeButton(
        "normal",
        "fa-table-cells",
        t("Mode.Exploration"),
        mode === "regular"
      )
    ];
    if (combatModeAvailable())
      buttons.push(
        modeButton(
          "combatmode",
          "fa-shield-halved",
          t("Mode.Combat"),
          mode === "combat"
        )
      );
    return buttons.length > 1
      ? `<nav class="ws-mode-navigation" aria-label="${t("Labels.Mode")}">${buttons.join("")}</nav>`
      : "";
  };
  const legend = () => {
    const entries = [
      ["●", "ws-proficient", t("Labels.Proficiency")],
      ["★", "ws-expertise", t("Labels.Expertise")]
    ];
    return `
      <div class="ws-legend">
        ${entries.map(([symbol, css, label]) => `<span><b class="${escapeHTML(css)}">${escapeHTML(symbol)}</b>${escapeHTML(label)}</span>`).join("")}
      </div>
    `;
  };
  const shortcutHint = () => {
    if (!visibility.shortcuts || hudElementHidden(context.hudState, "hints"))
      return "";
    return `
      <div
        class="ws-shortcuts"
        title="${t("Shortcuts.Hint")}"
        aria-label="${t("Shortcuts.Aria")}"
      >
        <span><kbd>Shift</kbd> ${t("Shortcuts.Fast")}</span>
        <span><kbd>Alt</kbd> ${t("Shortcuts.Advantage")}</span>
        <span><kbd>Ctrl</kbd> ${t("Shortcuts.Disadvantage")}</span>
        <span><kbd>Ctrl + ${t("Shortcuts.LeftClick")}</kbd> ${t("Shortcuts.RemoveEffect")}</span>
      </div>
    `;
  };
  const back = (context, icon) => `
      <button
        type="button"
        class="ws-nav ws-button"
        data-action="view"
        data-view="main"
      >
        <span class="ws-nav-main">
          <i
            class="fa-solid fa-chevron-left"
          ></i>

          ${t("Labels.Back")}
        </span>

        <span class="ws-nav-context">
          <i
            class="fa-solid ${icon}"
          ></i>

          ${context}
        </span>
      </button>
    `;
  return {
    actorHeader,
    back,
    inspirationControl,
    legend,
    modeNavigation,
    restControls,
    shortcutHint
  };
}
