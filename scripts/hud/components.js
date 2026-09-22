export function createHudComponents(context) {
  const {
    abilities,
    actor,
    adapter,
    canRollActor,
    combatModeAvailable,
    deathModeAvailable,
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

  function abilityRow(type, label, labelIcon, showLabel = true) {
    return `
        <div class="ws-ability-row ${showLabel ? "" : "ws-label-free"}" style="--ws-ability-count: ${abilities.length}">

          ${
            showLabel
              ? `
                <div class="ws-row-label">
                  <i class="fa-solid ${labelIcon}"></i>
                  ${label}
                </div>
              `
              : ""
          }

          ${abilities
            .map(([id, short, icon]) => {
              const data = adapter.abilityData(actor, id);
              const safeId = escapeHTML(id);
              const safeShort = escapeHTML(short);
              const safeIcon = escapeHTML(icon);

              const proficient = type === "save" && saveProf(id) > 0;

              const total = adapter.abilityTotal(data, type);

              const rollLabel = tf(
                type === "save"
                  ? "RollLabels.SavingThrow"
                  : "RollLabels.AbilityCheck",
                { ability: short }
              );
              const safeRollLabel = escapeHTML(rollLabel);

              return `
                  <button
                    type="button"
                    class="
                      ws-ability
                      ws-button
                      ${proficient ? "ws-save-prof" : ""}
                    "
                    data-action="ability"
                    data-type="${escapeHTML(type)}"
                    data-key="${safeId}"
                    title="${safeRollLabel}"
                    aria-label="${safeRollLabel}"
                    ${canRollActor ? "" : "disabled"}
                  >
                    <span class="ws-ability-label">
                      <i class="fa-solid ${safeIcon}"></i>
                      <span>${safeShort}</span>
                    </span>

                    <span class="ws-ability-value">
                      ${formatMod(total)}
                    </span>

                    ${
                      proficient
                        ? `
                          <span
                            class="ws-prof-dot"
                          ></span>
                        `
                        : ""
                    }
                  </button>
                `;
            })
            .join("")}

        </div>
      `;
  }

  const abilityChecksSection = (mode = "regular") => {
    const stateKey =
      mode === "combat"
        ? "combatAbilityChecksExpanded"
        : "abilityChecksExpanded";
    const expanded = hudState[stateKey];
    const action = mode === "combat" ? "togglecombatchecks" : "togglechecks";

    return `
      <div class="ws-ability-checks ${expanded ? "ws-expanded" : ""}">
        <button
          type="button"
          class="ws-section-toggle ws-button"
          data-action="${action}"
          aria-expanded="${expanded}"
        >
          <span><i class="fa-solid fa-dice"></i>${t("Labels.Check")}</span>
          <i class="fa-solid fa-chevron-${expanded ? "up" : "down"}"></i>
        </button>
        ${
          expanded
            ? abilityRow("check", t("Labels.Check"), "fa-dice", false)
            : ""
        }
      </div>
    `;
  };

  const savingThrowsSection = (mode = "regular") => {
    const stateKey =
      mode === "combat" ? "combatSavingThrowsExpanded" : "savingThrowsExpanded";
    const expanded = hudState[stateKey];
    const action = mode === "combat" ? "togglecombatsaves" : "togglesaves";

    return `
      <div class="ws-saving-throws ${expanded ? "ws-expanded" : ""}">
        <button
          type="button"
          class="ws-section-toggle ws-button"
          data-action="${action}"
          aria-expanded="${expanded}"
        >
          <span><i class="fa-solid fa-shield-halved"></i>${t("Labels.Save")}</span>
          <i class="fa-solid fa-chevron-${expanded ? "up" : "down"}"></i>
        </button>
        ${
          expanded
            ? abilityRow("save", t("Labels.Save"), "fa-shield-halved", false)
            : ""
        }
      </div>
    `;
  };

  // =========================================================
  // Skills
  // =========================================================

  function skillsHTML() {
    return skills
      .map(([id, name, icon]) => {
        const data = adapter.skillData(actor, id);

        const safeId = escapeHTML(id);
        const safeName = escapeHTML(name);

        const [symbol, css, label] = marker(skillProf(id));

        return `
            <button
              type="button"
              class="ws-entry ws-button"
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
            <i
              class="
                fa-solid
                  ${escapeHTML(tool.icon)}
                ws-entry-icon
              "
            ></i>

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
    if (!adapter.capabilities.inspiration) return "";
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

  const restControls = () =>
    adapter.capabilities.rests
      ? `
      <div class="ws-rest-controls">
        <button type="button" class="ws-header-control ws-button" data-action="shortrest" title="${t("Actor.ShortRest")}" ${canRollActor ? "" : "disabled"}>
          <i class="fa-solid fa-campground"></i>
          <span>${t("Actor.ShortRestShort")}</span>
        </button>
        <button type="button" class="ws-header-control ws-button" data-action="longrest" title="${t("Actor.LongRest")}" ${canRollActor ? "" : "disabled"}>
          <i class="fa-solid fa-moon"></i>
          <span>${t("Actor.LongRestShort")}</span>
        </button>
      </div>
    `
      : "";

  const actorHeader = (extra = "") => {
    const summary = classSummary();

    return `
      <div class="ws-actor-header">
        <img
          class="ws-actor-portrait"
          src="${escapeHTML(actor.img ?? "icons/svg/mystery-man.svg")}"
          alt="${escapeHTML(actor.name)}"
        >

        <div class="ws-actor-identity">
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

  const modeButton = (action, icon, label, cssClass = "") => `
      <button
        type="button"
        class="ws-mode-link ws-button ${cssClass}"
        data-action="${action}"
      >
        <span><i class="fa-solid ${icon}"></i>${label}</span>
        <i class="fa-solid fa-chevron-right ws-arrow"></i>
      </button>
    `;

  const modeNavigation = mode => {
    if (!visibility.modeNavigation) {
      return "";
    }

    const buttons = [];

    if (mode !== "regular") {
      buttons.push(modeButton("normal", "fa-table-cells", t("Combat.Regular")));
    }

    if (mode !== "combat" && combatModeAvailable()) {
      buttons.push(
        modeButton(
          "combatmode",
          "fa-shield-halved",
          t("Labels.Combat"),
          "ws-combat-switch"
        )
      );
    }

    if (mode !== "death" && deathModeAvailable()) {
      buttons.push(
        modeButton(
          "deathmode",
          "fa-heart-pulse",
          t("Labels.DeathSaves"),
          "ws-death-switch"
        )
      );
    }

    return buttons.length
      ? `<div class="ws-mode-navigation">${buttons.join("")}</div>`
      : "";
  };

  const legend = () => `
      <div class="ws-legend">

        <span>
          <b class="ws-proficient">●</b>
          ${t("Labels.Proficiency")}
        </span>

        <span>
          <b class="ws-expertise">★</b>
          ${t("Labels.Expertise")}
        </span>

      </div>
    `;

  const shortcutHint = () =>
    visibility.shortcuts
      ? `
      <div
        class="ws-shortcuts"
        title="${t("Shortcuts.Hint")}"
        aria-label="${t("Shortcuts.Aria")}"
      >
        <span><kbd>Shift</kbd> ${t("Shortcuts.Fast")}</span>
        <span><kbd>Alt</kbd> ${t("Shortcuts.Advantage")}</span>
        <span><kbd>Ctrl</kbd> ${t("Shortcuts.Disadvantage")}</span>
      </div>
    `
      : "";

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
    abilityChecksSection,
    abilityRow,
    actorHeader,
    back,
    inspirationControl,
    legend,
    modeNavigation,
    restControls,
    savingThrowsSection,
    shortcutHint,
    skillsHTML,
    toolSection
  };
}
