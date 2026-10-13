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
  const spellFilterHTML = () => {
    if (visibility?.spellPreparation === false) return "";
    const limits =
      adapter?.spellPreparationLimits?.(actor, { includeSources: true }) ?? [];
    const sources = adapter?.spellSources?.(actor) ?? [];
    const controls = new Map(sources.map(source => [source.source, source]));
    for (const limit of limits)
      controls.set(limit.source ?? limit.name, {
        ...controls.get(limit.source),
        ...limit
      });
    const sourceAvailable = sources.some(
      source => source.source === hudState.spellSource
    );
    const preparationLabel = t(
      hudState.unpreparedSpellsOnly
        ? "Combat.Unprepared"
        : hudState.preparedSpellsOnly
          ? "Combat.Prepared"
          : "Combat.AllSpells"
    );
    const selectedSource = sourceAvailable
      ? controls.get(hudState.spellSource)
      : null;
    const sourceLabel = selectedSource?.name ?? t("Combat.AllSpellSources");
    const selectedCount = Number.isFinite(selectedSource?.max)
      ? ` ${selectedSource.value}/${selectedSource.max}`
      : "";
    return `
    <details class="ws-spell-filters" data-spell-filters="main">
      <summary data-spell-filters-toggle="main"><i class="fa-solid fa-filter" aria-hidden="true"></i><span>${t("Combat.SpellFilter")}</span><span class="ws-spell-filter-selection">${escapeHTML(`${preparationLabel} · ${sourceLabel}${selectedCount}`)}</span><i class="fa-solid fa-chevron-down ws-spell-filter-chevron" aria-hidden="true"></i></summary>
      <div class="ws-spell-filter-body">
    <div class="ws-spell-filter ws-filter-tabs" role="group" aria-label="${t("Combat.SpellFilter")}">
      <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "ws-active" : ""}"
        data-action="spellfilter" data-prepared="true" aria-pressed="${hudState.preparedSpellsOnly}">
        ${t("Combat.Prepared")}
      </button>
      <button type="button" class="ws-button ${!hudState.preparedSpellsOnly && !hudState.unpreparedSpellsOnly ? "ws-active" : ""}"
        data-action="spellfilter" data-prepared="false" aria-pressed="${!hudState.preparedSpellsOnly && !hudState.unpreparedSpellsOnly}">
        ${t("Combat.AllSpells")}
      </button>
      <button type="button" class="ws-button ${hudState.unpreparedSpellsOnly ? "ws-active" : ""}" data-action="spellfilter" data-prepared="unprepared" aria-pressed="${Boolean(hudState.unpreparedSpellsOnly)}">${t("Combat.Unprepared")}</button>
    </div>
    ${
      controls.size
        ? `<div class="ws-spell-preparation-summary" role="group" aria-label="${t("Combat.SpellSources")}"><button type="button" class="ws-button ws-preparation-limit ${sourceAvailable ? "" : "ws-active"}" data-action="spellsourcefilter" data-source="" aria-pressed="${!sourceAvailable}">${t("Combat.AllSpellSources")}</button>${[
            ...controls.values()
          ]
            .map(source => {
              const active =
                sourceAvailable && hudState.spellSource === source.source;
              const count = Number.isFinite(source.max)
                ? `<strong>${source.value}/${source.max}</strong>`
                : "";
              const name = escapeHTML(
                source.name ?? t("Combat.OtherSpellSources")
              );
              return source.source
                ? `<button type="button" class="ws-button ws-preparation-limit ${active ? "ws-active" : ""} ${source.value > source.max ? "ws-limit-exceeded" : ""}" data-action="spellsourcefilter" data-source="${escapeHTML(source.source)}" aria-pressed="${active}"><span>${name}</span>${count}</button>`
                : `<span class="ws-preparation-limit"><span>${name}</span>${count}</span>`;
            })
            .join("")}</div>`
        : ""
    }</div></details>`;
  };
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
