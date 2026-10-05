export function createAbilityComponents(context) {
  const {
    abilities,
    actor,
    adapter,
    canRollActor = false,
    escapeHTML,
    formatMod,
    hudState,
    marker,
    saveProf,
    skillProf,
    skills,
    t,
    tf,
    visibility,
    toolState
  } = context;
  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);
  const rollButton = (id, short, type, label) => {
    const rollLabel = escapeHTML(
      tf(
        type === "save" ? "RollLabels.SavingThrow" : "RollLabels.AbilityCheck",
        { ability: short }
      )
    );
    const proficient = type === "save" && saveProf(id) > 0;
    return `<button type="button" class="ws-ability-roll ws-button ${proficient ? "ws-save-prof" : ""}"
      data-action="ability" data-type="${type}" data-key="${escapeHTML(id)}"
      title="${rollLabel}" aria-label="${rollLabel}" ${canAct() ? "" : "disabled"}>
      <span>${escapeHTML(label)}</span><strong>${formatMod(adapter.abilityTotal(adapter.abilityData(actor, id), type))}</strong>
    </button>`;
  };
  function abilityCards() {
    return `<div class="ws-ability-cards">${abilities
      .map(([id, short, icon]) => {
        return `<div class="ws-ability-card">
        <div class="ws-ability-card-title"><i class="fa-solid ${escapeHTML(icon)}"></i>${escapeHTML(short)}</div>
        ${rollButton(id, short, "save", t("Labels.Save"))}
        ${rollButton(id, short, "check", t("Labels.Check"))}
      </div>`;
      })
      .join("")}</div>`;
  }
  const gmSaves = () =>
    `<section class="ws-gm-saves"><h3>${t("GM.Saves")}</h3><div>${abilities.map(([id, short]) => `<button type="button" class="ws-button" data-action="ability" data-type="save" data-key="${escapeHTML(id)}" title="${escapeHTML(tf("RollLabels.SavingThrow", { ability: short }))}" ${canAct() ? "" : "disabled"}><span>${escapeHTML(short)}</span><strong>${formatMod(adapter.abilityTotal(adapter.abilityData(actor, id), "save"))}</strong></button>`).join("")}</div></section>`;
  const abilitiesSection = () =>
    `<section class="ws-ability-table">${abilityCards()}</section>`;
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
  function skillsHTML(mode = "regular", matchingSkills = null) {
    const visibleSkills =
      matchingSkills ??
      (hudState.proficientSkillsOnly
        ? skills.filter(([id]) => skillProf(id) >= 1)
        : skills);
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
              ${canAct() ? "" : "disabled"}
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
            ${canAct() ? "" : "disabled"}
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
  const trainedToolsHTML = () =>
    toolState
      ? `<div class="ws-tools-content">${toolSection(
          t("Labels.Tools"),
          "fa-screwdriver-wrench",
          toolState.normalTools.filter(tool => tool.proficiency >= 1)
        )}${toolSection(
          t("Labels.Instruments"),
          "fa-music",
          toolState.instruments.filter(tool => tool.proficiency >= 1)
        )}</div>`
      : "";
  const searchRolls = query => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return "";
    const matches = value => String(value).toLocaleLowerCase().includes(needle);
    const section = (label, html) =>
      html
        ? `<section class="ws-search-rolls"><h3>${t(label)}</h3><div class="ws-entry-grid">${html}</div></section>`
        : "";
    const matchingSkills = skills.filter(([id, name]) =>
      matches(`${name} ${id}`)
    );
    const matchingTools = [
      ...(toolState?.normalTools ?? []),
      ...(toolState?.instruments ?? [])
    ].filter(tool => matches(`${tool.name} ${tool.id}`));
    const abilityResults = type =>
      abilities
        .flatMap(([id, short]) => {
          const name = adapter.abilityLabel?.(id) ?? short;
          const label = tf(
            type === "save"
              ? "RollLabels.SavingThrow"
              : "RollLabels.AbilityCheck",
            { ability: name }
          );
          return matches(
            `${short} ${name} ${label} ${t(type === "save" ? "Labels.Save" : "Labels.Check")}`
          )
            ? [rollButton(id, short, type, label)]
            : [];
        })
        .join("");
    return (
      section(
        "Labels.Skills",
        matchingSkills.length ? skillsHTML("regular", matchingSkills) : ""
      ) +
      section("Labels.Tools", toolEntries(matchingTools)) +
      section("Labels.SavingThrows", abilityResults("save")) +
      section("Labels.AbilityChecks", abilityResults("check"))
    );
  };
  return {
    searchRolls,
    trainedToolsHTML,
    abilitiesSection,
    gmSaves,
    skillFilterHTML,
    skillsHTML,
    spellFilterHTML,
    toolSection
  };
}
