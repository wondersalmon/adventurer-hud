export function createHudComponents(context) {
  const {
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
  } = context;

  // =========================================================
  // Abilities
  // =========================================================

  function abilityCards() {
    return `<div class="ws-ability-cards">${abilities
      .map(([id, short, icon]) => {
        const data = adapter.abilityData(actor, id);
        const safeId = escapeHTML(id);
        const rollButton = (type, label) => {
          const rollLabel = escapeHTML(
            tf(
              type === "save"
                ? "RollLabels.SavingThrow"
                : "RollLabels.AbilityCheck",
              { ability: short }
            )
          );
          const proficient = type === "save" && saveProf(id) > 0;
          return `<button type="button" class="ws-ability-roll ws-button ${proficient ? "ws-save-prof" : ""}"
          data-action="ability" data-type="${type}" data-key="${safeId}"
          title="${rollLabel}" aria-label="${rollLabel}" ${canRollActor ? "" : "disabled"}>
          <span>${label}</span>
          <strong>${formatMod(adapter.abilityTotal(data, type))}</strong>
        </button>`;
        };
        return `<div class="ws-ability-card">
        <div class="ws-ability-card-title"><i class="fa-solid ${escapeHTML(icon)}"></i>${escapeHTML(short)}</div>
        ${rollButton("save", t("Labels.Save"))}
        ${rollButton("check", t("Labels.Check"))}
      </div>`;
      })
      .join("")}</div>`;
  }

  const gmSaves = () =>
    `<section class="ws-gm-saves"><h3>${t("GM.Saves")}</h3><div>${abilities.map(([id, short]) => `<button type="button" class="ws-button" data-action="ability" data-type="save" data-key="${escapeHTML(id)}" title="${escapeHTML(tf("RollLabels.SavingThrow", { ability: short }))}" ${canRollActor ? "" : "disabled"}><span>${escapeHTML(short)}</span><strong>${formatMod(adapter.abilityTotal(adapter.abilityData(actor, id), "save"))}</strong></button>`).join("")}</div></section>`;

  const abilitiesSection = (mode = "regular") => {
    const expanded =
      hudState[
        mode === "combat" ? "combatAbilitiesExpanded" : "abilitiesExpanded"
      ];

    return `
      <section class="ws-ability-table ${expanded ? "ws-expanded" : ""}">
        <button type="button" class="ws-section-toggle ws-button"
          data-action="toggleabilities" aria-expanded="${expanded}">
          <span><i class="fa-solid fa-dice"></i>${t("Labels.Abilities")}</span>
          <i class="fa-solid fa-chevron-${expanded ? "up" : "down"}"></i>
        </button>
        ${
          expanded
            ? `
          ${abilityCards()}`
            : ""
        }
      </section>
    `;
  };

  // =========================================================
  // Skills
  // =========================================================

  const skillFilterHTML = () => `
    <div class="ws-skill-filter" role="group" aria-label="${t("Skills.Filter")}">
      <button type="button" class="ws-button ${hudState.proficientSkillsOnly ? "ws-active" : ""}"
        data-action="skillfilter" data-proficient="true" aria-pressed="${hudState.proficientSkillsOnly}">
        ${t("Skills.Trained")}
      </button>
      <button type="button" class="ws-button ${hudState.proficientSkillsOnly ? "" : "ws-active"}"
        data-action="skillfilter" data-proficient="false" aria-pressed="${!hudState.proficientSkillsOnly}">
        ${t("Skills.All")}
      </button>
    </div>`;

  const spellFilterHTML = () => `
    <div class="ws-spell-filter" role="group" aria-label="${t("Combat.SpellFilter")}">
      <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "ws-active" : ""}"
        data-action="spellfilter" data-prepared="true" aria-pressed="${hudState.preparedSpellsOnly}">
        ${t("Combat.Prepared")}
      </button>
      <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "" : "ws-active"}"
        data-action="spellfilter" data-prepared="false" aria-pressed="${!hudState.preparedSpellsOnly}">
        ${t("Combat.AllSpells")}
      </button>
    </div>`;

  function skillsHTML(mode = "regular") {
    const visibleSkills = hudState.proficientSkillsOnly
      ? skills.filter(([id]) => skillProf(id) >= 1)
      : skills;
    if (!visibleSkills.length) {
      return `<div class="ws-empty">${t("Skills.EmptyFiltered")}</div>`;
    }

    return visibleSkills
      .map(([id, name, icon]) => {
        const data = adapter.skillData(actor, id);

        const safeId = escapeHTML(id);
        const safeName = escapeHTML(name);

        const [symbol, css, label] = marker(skillProf(id));

        return `
            <button
              type="button"
              class="ws-entry ws-button ${mode === "combat" ? `ws-combat-skill ${visibility.itemDetails ? "ws-skill-details" : ""}` : ""}"
              data-action="skill"
              data-key="${safeId}"
              title="${safeName}${label ? ` • ${label}` : ""}"
              aria-label="${safeName}"
              ${canRollActor ? "" : "disabled"}
            >
              <i
                class="
                  fa-solid
                  ${escapeHTML(icon)}
                  ws-entry-icon
                "
              ></i>

              <span class="ws-entry-name">
                ${safeName}
              </span>

              <span
                class="
                  ws-entry-marker
                  ${css}
                "
              >
                ${symbol}
              </span>

              <span class="ws-entry-value">
                ${formatMod(data.total)}
              </span>
            </button>
          `;
      })
      .join("");
  }

  // =========================================================
  // Tools
  // =========================================================

  function toolEntries(list) {
    return list
      .map(tool => {
        const id = escapeHTML(tool.id);
        const name = escapeHTML(tool.name);
        const ability = escapeHTML(tool.ability?.toUpperCase() || "—");

        const [symbol, css, label] = marker(tool.proficiency);

        return `
          <button
            type="button"
            class="ws-entry ws-button"
            data-action="tool"
            data-key="${id}"
            title="${name}${label ? ` • ${label}` : ""}"
            aria-label="${name}"
            ${canRollActor ? "" : "disabled"}
          >
            <img class="ws-entry-icon" src="${escapeHTML(tool.img)}" alt="">
             <span class="ws-entry-name">
              ${name}
            </span>

            <span
              class="
                ws-entry-marker
                ${css}
              "
            >
              ${symbol}
            </span>

            <span
              class="
                ws-entry-value
                ws-tool-ability
              "
            >
              ${ability}
            </span>
          </button>
        `;
      })
      .join("");
  }

  const toolSection = (title, icon, list) => {
    if (!list.length) {
      return "";
    }

    return `
        <section class="ws-tool-section">

          <div class="ws-section-title">
            <i
              class="fa-solid ${icon}"
            ></i>

            ${title}
          </div>

          <div class="ws-entry-grid">
            ${toolEntries(list)}
          </div>

        </section>
      `;
  };

  // =========================================================
  // Common UI
  // =========================================================

  const classSummary = () => {
    return adapter.classSummary(actor, {
      formatLevel: level => tf("Actor.Level", { level })
    });
  };

  const inspirationControl = () => {
    const active = adapter.inspiration(actor);

    return `
        <button
          type="button"
          class="ws-header-control ws-inspiration ws-button ${active ? "ws-active" : ""}"
          data-action="inspiration"
          title="${active ? t("Actor.InspirationActive") : t("Actor.InspirationInactive")}"
          aria-pressed="${active}"
          ${canRollActor ? "" : "disabled"}
        >
          <i class="fa-solid fa-star"></i>
          <span>${t("Actor.Inspiration")}</span>
        </button>
      `;
  };

  const restControls = (extra = "") => `
    <div class="ws-rest-controls">
      ${extra}
      <button type="button" class="ws-header-control ws-button" data-action="shortrest" title="${t("Actor.ShortRest")}" ${canRollActor ? "" : "disabled"}>
        <i class="fa-solid fa-campground"></i><span>${t("Actor.ShortRestShort")}</span>
      </button>
      <button type="button" class="ws-header-control ws-button" data-action="longrest" title="${t("Actor.LongRest")}" ${canRollActor ? "" : "disabled"}>
        <i class="fa-solid fa-moon"></i><span>${t("Actor.LongRestShort")}</span>
      </button>
    </div>`;

  const actorHeader = (extra = "") => {
    const summary = classSummary();

    return `
      <div class="ws-actor-header">
        <img
          class="ws-actor-portrait"
          data-open-actor-sheet
          src="${escapeHTML(context.portrait ?? actor.img ?? "icons/svg/mystery-man.svg")}"
          alt="${escapeHTML(actor.name)}"
          title="${t("Actor.OpenSheet")}"
        >

        <div class="ws-actor-identity" data-open-actor-sheet title="${t("Actor.OpenSheet")}">
          <strong>${escapeHTML(actor.name)}</strong>
          ${
            summary
              ? `<span title="${escapeHTML(summary)}">${escapeHTML(summary)}</span>`
              : ""
          }
        </div>

        ${extra}
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

  const shortcutHint = () => `
      <div
        class="ws-shortcuts"
        title="${t("Shortcuts.Hint")}"
        aria-label="${t("Shortcuts.Aria")}"
      >
        <span><kbd>Shift</kbd> ${t("Shortcuts.Fast")}</span>
        <span><kbd>Alt</kbd> ${t("Shortcuts.Advantage")}</span>
        <span><kbd>Ctrl</kbd> ${t("Shortcuts.Disadvantage")}</span>
      </div>
    `;

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

          ${t("Labels.Rolls")}
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
    abilitiesSection,
    gmSaves,
    actorHeader,
    back,
    inspirationControl,
    legend,
    modeNavigation,
    restControls,
    shortcutHint,
    skillFilterHTML,
    skillsHTML,
    spellFilterHTML,
    toolSection
  };
}
