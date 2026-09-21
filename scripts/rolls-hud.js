import { abilities, gaming, musical, skillIcons } from "./constants.js";
import { MODULE_ID } from "./module-id.js";
import {
  calculateResourceValue,
  findCombatant,
  tokenForActor
} from "./runtime-helpers.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
  saveWindowGeometry,
  setSetting,
  SETTINGS
} from "./settings.js";

export async function openRollsHud(actorOverride = null) {
  try {
    // =========================================================
    // System
    // =========================================================

    if (game.system.id !== "dnd5e") {
      throw new Error(game.i18n.localize("ADVENTURER_HUD.Errors.Dnd5eOnly"));
    }

    const { DialogV2 } = foundry.applications.api;

    const state = (globalThis.__adventurerHud ??= {});
    state.app ??= null;
    state.position ??= null;
    state.toolNames ??= new Map();

    const t = key => game.i18n.localize(`ADVENTURER_HUD.${key}`);

    const tf = (key, data) => game.i18n.format(`ADVENTURER_HUD.${key}`, data);

    // =========================================================
    // Actor
    // =========================================================

    const selected = canvas.tokens.controlled;

    if (selected.length > 1) {
      return ui.notifications.warn(t("Warnings.OneToken"));
    }

    const selectedToken = selected[0] ?? null;
    const actor = actorOverride ?? selectedToken?.actor ?? null;
    const token = tokenForActor(selectedToken, actor);

    if (!actor) {
      const availableActors = game.actors.filter(
        candidate => candidate.type === "character" && candidate.isOwner
      );

      if (!availableActors.length) {
        return ui.notifications.warn(t("Warnings.NoActor"));
      }

      if (availableActors.length === 1) {
        return openRollsHud(availableActors[0]);
      }

      const pickerContent = document.createElement("div");
      pickerContent.innerHTML = `<div class="ws-actor-picker-list">${availableActors
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map(
          candidate => `
            <button
              type="button"
              class="ws-actor-picker-entry"
              data-action="selectactor"
              data-actor-id="${candidate.id}"
            >
              <img src="${foundry.utils.escapeHTML(candidate.img ?? "icons/svg/mystery-man.svg")}" alt="">
              <span>${foundry.utils.escapeHTML(candidate.name)}</span>
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          `
        )
        .join("")}</div>`;

      const picker = new DialogV2({
        classes: ["ws-actor-picker"],
        window: { title: t("Actor.Select") },
        position: {
          width: Math.min(380, Math.max(280, window.innerWidth - 32)),
          height: "auto"
        },
        content: pickerContent,
        actions: {
          selectactor: async function (_event, target) {
            const selectedActor = game.actors.get(target.dataset.actorId);
            await picker.close();

            if (selectedActor) {
              void openRollsHud(selectedActor);
            }
          }
        },
        buttons: [
          {
            action: "close",
            label: t("Actor.Cancel")
          }
        ]
      });

      return picker.render({ force: true });
    }

    if (state.app?.rendered) {
      await flushWindowGeometry();
      await state.app.close();
    }

    state.actorUuid = actor.uuid;
    state.tokenUuid = token?.document?.uuid ?? token?.uuid ?? null;

    const canRollActor = actor.isOwner;
    const adaptiveLayout = Boolean(getSetting(SETTINGS.adaptiveLayout));
    const fontSize = getSetting(SETTINGS.fontSize) || "large";

    const visibility = {
      abilityChecks: getSetting(SETTINGS.showAbilityChecks),
      deathSaves: getSetting(SETTINGS.showDeathSaves),
      initiative: getSetting(SETTINGS.showInitiative),
      itemDetails: getSetting(SETTINGS.showItemDetails),
      modeNavigation: getSetting(SETTINGS.showModeNavigation),
      combatResources: getSetting(SETTINGS.showCombatResources),
      combatWeapons: getSetting(SETTINGS.showCombatWeapons),
      combatSpells: getSetting(SETTINGS.showCombatSpells),
      combatActions: getSetting(SETTINGS.showCombatActions),
      combatBonusActions: getSetting(SETTINGS.showCombatBonusActions),
      combatReactions: getSetting(SETTINGS.showCombatReactions),
      combatSpecial: getSetting(SETTINGS.showCombatSpecial),
      savingThrows: getSetting(SETTINGS.showSavingThrows),
      shortcuts: getSetting(SETTINGS.showShortcuts),
      skills: getSetting(SETTINGS.showSkills),
      tools: getSetting(SETTINGS.showTools)
    };

    const skills = Object.entries(CONFIG.DND5E.skills ?? {})
      .map(([id, config]) => [
        id,
        game.i18n.localize(config.label ?? id),
        skillIcons[id] ?? "fa-dice-d20"
      ])
      .sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));

    // =========================================================
    // Helpers
    // =========================================================

    const profValue = value =>
      Number(
        value?.multiplier ??
          value?.value ??
          value?.prof?.multiplier ??
          value?.prof?.value ??
          value?.prof ??
          value ??
          0
      ) || 0;

    const escapeHTML = value => foundry.utils.escapeHTML(String(value ?? ""));

    const loadStoredPosition = defaultWidth => {
      const saved = getWindowGeometry();

      if (!saved) {
        return {};
      }

      const left = Number(saved.left);
      const top = Number(saved.top);
      const savedWidth = Number(saved.width);
      const savedHeight = Number(saved.height);

      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return {};
      }

      const minimumWidth = adaptiveLayout ? 270 : 420;
      const width = Number.isFinite(savedWidth)
        ? Math.min(
            Math.max(minimumWidth, savedWidth),
            Math.max(minimumWidth, window.innerWidth - 16)
          )
        : defaultWidth;

      const height = Number.isFinite(savedHeight)
        ? Math.min(
            Math.max(180, savedHeight),
            Math.max(180, window.innerHeight - 16)
          )
        : null;

      return {
        width,
        ...(height === null ? {} : { height }),
        left: Math.min(
          Math.max(0, left),
          Math.max(0, window.innerWidth - width)
        ),
        top: Math.min(
          Math.max(0, top),
          Math.max(0, window.innerHeight - (height ?? 80))
        )
      };
    };

    const storePosition = position => {
      const left = Number(position?.left);
      const top = Number(position?.top);
      const width = Number(position?.width);
      const height = Number(position?.height);

      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return;
      }

      state.position = {
        left,
        top,
        ...(Number.isFinite(width) ? { width } : {}),
        ...(Number.isFinite(height) ? { height } : {})
      };

      saveWindowGeometry(state.position);
    };

    let keepOpen = Boolean(getSetting(SETTINGS.keepOpen));

    const storeKeepOpen = async value => {
      keepOpen = Boolean(value);
      await setSetting(SETTINGS.keepOpen, keepOpen);
    };

    const layoutDefaults = Object.freeze({
      regular: ["navigation", "abilities", "destinations", "shortcuts"],
      combat: [
        "navigation",
        "heading",
        "stats",
        "resources",
        "conditions",
        "saves",
        "actions",
        "shortcuts"
      ],
      death: ["navigation", "heading", "tracker", "roll", "shortcuts"]
    });
    let hudLayout = foundry.utils.deepClone(
      getSetting(SETTINGS.hudLayout) ?? {}
    );
    let editMode = false;

    const modeLayout = mode => {
      const defaults = layoutDefaults[mode] ?? [];
      const saved = hudLayout[mode] ?? {};
      const order = [
        ...(saved.order ?? []).filter(id => defaults.includes(id)),
        ...defaults.filter(id => !(saved.order ?? []).includes(id))
      ];

      return {
        order: [...new Set(order)],
        hidden: (saved.hidden ?? []).filter(id => defaults.includes(id))
      };
    };

    const saveModeLayout = (mode, value) => {
      hudLayout = { ...hudLayout, [mode]: value };
      void setSetting(SETTINGS.hudLayout, hudLayout);
    };

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
      const data = actor.system.abilities?.[id] ?? {};

      return profValue(data.save?.prof ?? data.saveProf);
    };

    const numericProfBonus = proficiency => {
      const term = proficiency?.term;

      if (
        term === null ||
        term === undefined ||
        term === "" ||
        !Number.isFinite(Number(term))
      ) {
        return 0;
      }

      return Number(proficiency.flat ?? term) || 0;
    };

    const abilityTotal = (data, type) => {
      const preparedValue = data[type]?.value;

      const prepared = Number(preparedValue);

      if (
        preparedValue !== null &&
        preparedValue !== undefined &&
        preparedValue !== "" &&
        Number.isFinite(prepared)
      ) {
        return prepared;
      }

      const legacyBonus = Number(data[`${type}Bonus`] ?? 0) || 0;

      const legacyProf = data[`${type}Prof`];

      return (
        (Number(data.mod) || 0) + legacyBonus + numericProfBonus(legacyProf)
      );
    };

    const skillProf = id => profValue(actor.system.skills?.[id]?.prof);

    const getCombatant = () => {
      const combat = game.combat;

      if (!combat) {
        return null;
      }

      const tokenId = token?.document?.id ?? token?.id;
      return findCombatant(combat.combatants, {
        actorId: actor.id,
        tokenId
      });
    };

    // =========================================================
    // Death saves
    // =========================================================

    const deathData = () => ({
      failure: Number(actor.system.attributes.death?.failure ?? 0),
      hp: Number(actor.system.attributes.hp?.value ?? 0),
      success: Number(actor.system.attributes.death?.success ?? 0)
    });

    const showDeathSaves = () =>
      visibility.deathSaves &&
      actor.type === "character" &&
      deathData().hp <= 0;

    const deathModeAvailable = () =>
      visibility.deathSaves && actor.type === "character";

    const canRollDeathSave = () => {
      const { failure, hp, success } = deathData();
      return hp <= 0 && failure < 3 && success < 3;
    };

    let forceRegularMode = false;
    let forceCombatMode = false;
    let forceDeathMode = false;
    let savingThrowsExpanded = true;

    const isActiveCombatant = () =>
      Boolean(game.combat?.started && getCombatant());

    const combatModeAvailable = () => actor.type === "character";

    const currentMode = () => {
      if (forceRegularMode) {
        return "regular";
      }

      if (forceCombatMode && combatModeAvailable()) {
        return "combat";
      }

      if (forceDeathMode && (editMode || deathModeAvailable())) {
        return "death";
      }

      if (showDeathSaves()) {
        return "death";
      }

      if (getSetting(SETTINGS.automaticCombatMode) && isActiveCombatant()) {
        return "combat";
      }

      return "regular";
    };

    // =========================================================
    // Tools
    // =========================================================

    const ownedToolNames = new Map(
      actor.items
        .filter(item => item.type === "tool")
        .map(item => [item.system?.type?.baseItem, item.name])
    );

    function toolIcon(id, isMusic) {
      if (isMusic) {
        return "fa-music";
      }

      if (gaming.has(id)) {
        return "fa-dice";
      }

      return (
        {
          thief: "fa-key",
          herb: "fa-leaf",
          disg: "fa-masks-theater",
          forg: "fa-file-signature",
          navg: "fa-compass",
          pois: "fa-flask"
        }[id] ?? "fa-screwdriver-wrench"
      );
    }

    async function toolName(id, config) {
      const owned = ownedToolNames.get(id);

      if (owned) {
        return owned;
      }

      if (config?.label) {
        return game.i18n.localize(config.label);
      }

      if (config?.id) {
        const cacheKey = `${game.i18n.lang}:${config.id}`;
        const cached = state.toolNames.get(cacheKey);

        if (cached) {
          return cached;
        }

        try {
          const document = await fromUuid(config.id);

          if (document?.name) {
            state.toolNames.set(cacheKey, document.name);
            return document.name;
          }
        } catch (error) {
          console.warn(`Rolls HUD | tool ${id}`, error);
        }
      }

      return id
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, char => char.toUpperCase());
    }

    const tools = (
      await Promise.all(
        Object.entries(actor.system.tools ?? {}).map(async ([id, data]) => {
          const proficiency = profValue(data);

          if (proficiency <= 0) {
            return null;
          }

          const config = CONFIG.DND5E.tools?.[id] ?? {};

          const isMusic = musical.has(id);

          return {
            id,
            name: await toolName(id, config),
            proficiency,
            ability: data?.ability ?? config.ability ?? "",
            isMusic,
            icon: toolIcon(id, isMusic)
          };
        })
      )
    )
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(a.isMusic) - Number(b.isMusic) || a.name.localeCompare(b.name)
      );

    const normalTools = tools.filter(tool => !tool.isMusic);

    const instruments = tools.filter(tool => tool.isMusic);

    // =========================================================
    // Abilities
    // =========================================================

    function abilityRow(type, label, labelIcon, showLabel = true) {
      return `
        <div class="ws-ability-row ${showLabel ? "" : "ws-label-free"}">

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
              const data = actor.system.abilities?.[id] ?? {};

              const proficient = type === "save" && saveProf(id) > 0;

              const total = abilityTotal(data, type);

              const rollLabel = tf(
                type === "save"
                  ? "RollLabels.SavingThrow"
                  : "RollLabels.AbilityCheck",
                { ability: short }
              );

              return `
                  <button
                    type="button"
                    class="
                      ws-ability
                      ws-button
                      ${proficient ? "ws-save-prof" : ""}
                    "
                    data-action="ability"
                    data-type="${type}"
                    data-key="${id}"
                    title="${rollLabel}"
                    aria-label="${rollLabel}"
                    ${canRollActor ? "" : "disabled"}
                  >
                    <span class="ws-ability-label">
                      <i class="fa-solid ${icon}"></i>
                      <span>${short}</span>
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

    const savingThrowsSection = () => `
      <div class="ws-saving-throws ${savingThrowsExpanded ? "ws-expanded" : ""}">
        <button
          type="button"
          class="ws-section-toggle ws-button"
          data-action="togglesaves"
          aria-expanded="${savingThrowsExpanded}"
        >
          <span><i class="fa-solid fa-shield-halved"></i>${t("Labels.Save")}</span>
          <i class="fa-solid fa-chevron-${savingThrowsExpanded ? "up" : "down"}"></i>
        </button>
        ${
          savingThrowsExpanded
            ? abilityRow("save", t("Labels.Save"), "fa-shield-halved", false)
            : ""
        }
      </div>
    `;

    // =========================================================
    // Skills
    // =========================================================

    function skillsHTML() {
      return skills
        .map(([id, name, icon]) => {
          const data = actor.system.skills?.[id] ?? {};

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
                  ${icon}
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
          const current = actor.system.tools?.[tool.id] ?? {};

          const id = escapeHTML(tool.id);
          const name = escapeHTML(tool.name);
          const ability = escapeHTML(
            (current.ability ?? tool.ability)?.toUpperCase() || "—"
          );

          const [symbol, css, label] = marker(profValue(current));

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
                ${tool.icon}
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
      const classes = actor.items
        .filter(item => item.type === "class")
        .map(item => {
          const level = Number(item.system?.levels ?? item.system?.level ?? 0);
          return `${item.name}${level > 0 ? ` ${level}` : ""}`;
        });

      if (classes.length) {
        return classes.join(" / ");
      }

      const level = Number(actor.system.details?.level ?? 0);
      return level > 0 ? tf("Actor.Level", { level }) : "";
    };

    const inspirationControl = () => {
      const active = Boolean(actor.system.attributes?.inspiration);

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

    const restControls = () => `
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
    `;

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
          ${summary ? `<span>${escapeHTML(summary)}</span>` : ""}
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
      if (!editMode && !visibility.modeNavigation) {
        return "";
      }

      const buttons = [];

      if (mode !== "regular") {
        buttons.push(
          modeButton("normal", "fa-table-cells", t("Combat.Regular"))
        );
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

      if (mode !== "death" && (editMode || deathModeAvailable())) {
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

    function normalHTML() {
      return `
        <div
          id="ws-main"
          class="ws-view"
        >
          ${actorHeader(inspirationControl())}

          ${restControls()}

          <div class="ws-layout-anchor"></div>

          ${modeNavigation("regular")}

          ${
            visibility.abilityChecks || visibility.savingThrows
              ? `
                <div class="ws-divider"></div>

                <div class="ws-ability-table">
                  ${
                    visibility.abilityChecks
                      ? abilityRow("check", t("Labels.Check"), "fa-dice")
                      : ""
                  }

                  ${visibility.savingThrows ? savingThrowsSection() : ""}
                </div>
              `
              : ""
          }

          ${
            visibility.skills || visibility.tools || visibility.combatSpells
              ? `
                <div class="ws-divider"></div>

                <div class="ws-nav-grid">

            ${
              visibility.skills
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="skills"
            >
              <span class="ws-nav-main">
                <i
                  class="fa-solid fa-list-check"
                ></i>

                ${t("Labels.Skills")}
              </span>

              <i
                class="
                  fa-solid
                  fa-chevron-right
                  ws-arrow
                "
              ></i>
            </button>
            `
                : ""
            }

            ${
              visibility.tools
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="tools"
            >
              <span class="ws-nav-main">
                <i
                  class="
                    fa-solid
                    fa-screwdriver-wrench
                  "
                ></i>

                ${t("Labels.Tools")}
              </span>

              <i
                class="
                  fa-solid
                  fa-chevron-right
                  ws-arrow
                "
              ></i>
            </button>
            `
                : ""
            }

            ${
              visibility.combatSpells
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="spells"
            >
              <span class="ws-nav-main">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                ${t("Combat.Spells")}
              </span>
              <i class="fa-solid fa-chevron-right ws-arrow"></i>
            </button>
            `
                : ""
            }

                </div>
              `
              : ""
          }

          ${shortcutHint()}
        </div>

        <div
          id="ws-skills"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Skills"), "fa-list-check")}

          <div class="ws-divider"></div>

          <div class="ws-scroll">
            <div class="ws-entry-grid">
              ${skillsHTML()}
            </div>
          </div>

          <div class="ws-divider"></div>

          ${legend()}

          ${shortcutHint()}
        </div>

        <div
          id="ws-tools"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Tools"), "fa-screwdriver-wrench")}

          <div class="ws-divider"></div>

          <div class="ws-scroll">
            <div class="ws-tools-content">

              ${
                tools.length
                  ? `
                    ${toolSection(
                      t("Labels.Tools"),
                      "fa-screwdriver-wrench",
                      normalTools
                    )}

                    ${toolSection(
                      t("Labels.Instruments"),
                      "fa-music",
                      instruments
                    )}
                  `
                  : `
                    <div class="ws-empty">

                      <i
                        class="
                          fa-solid
                          fa-screwdriver-wrench
                        "
                      ></i>

                      <span>
                        ${t("Tools.Empty")}
                      </span>

                    </div>
                  `
              }

            </div>
          </div>

          ${
            tools.length
              ? `
                <div class="ws-divider"></div>
                ${legend()}
              `
              : ""
          }

          ${shortcutHint()}
        </div>

        <div id="ws-spells" class="ws-view ws-hidden">
          ${back(t("Combat.Spells"), "fa-wand-magic-sparkles")}

          <div class="ws-divider"></div>

          <div class="ws-spell-filter" role="group" aria-label="${t("Combat.SpellFilter")}">
            <button type="button" class="ws-button ${preparedSpellsOnly ? "ws-active" : ""}" data-action="spellfilter" data-prepared="true">
              ${t("Combat.Prepared")}
            </button>
            <button type="button" class="ws-button ${preparedSpellsOnly ? "" : "ws-active"}" data-action="spellfilter" data-prepared="false">
              ${t("Combat.AllSpells")}
            </button>
          </div>

          <div class="ws-combat-item-list">
            ${
              spellGroups(combatItems("spells")) ||
              `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
            }
          </div>

          ${shortcutHint()}
        </div>
      `;
    }

    // =========================================================
    // Combat mode
    // =========================================================

    let combatCategory = "weapons";
    let preparedSpellsOnly = true;
    let resourcesExpanded = false;

    const itemActivities = item => {
      const activities = item.system?.activities;

      return typeof activities?.values === "function"
        ? [...activities.values()]
        : Object.values(activities ?? {});
    };

    const itemActivation = item => {
      const legacy = item.system?.activation?.type;

      if (legacy) {
        return legacy;
      }

      return itemActivities(item).find(activity => activity?.activation?.type)
        ?.activation?.type;
    };

    const configLabel = config =>
      game.i18n.localize(config?.label ?? config ?? "");

    const activationLabel = item => {
      const type = itemActivation(item);
      const common = {
        action: "Combat.Action",
        bonus: "Combat.BonusAction",
        reaction: "Combat.Reaction",
        special: "Combat.Special"
      }[type];

      if (common) {
        return t(common);
      }

      return configLabel(
        CONFIG.DND5E.activityActivationTypes?.[type] ??
          CONFIG.DND5E.abilityActivationTypes?.[type] ??
          type
      );
    };

    const itemRange = item => {
      const activityRange = itemActivities(item).find(
        activity => activity?.range
      )?.range;
      const range = activityRange ?? item.system?.range ?? {};
      const rawValue = range.value?.value ?? range.value;
      const value = rawValue === 0 ? 0 : rawValue || "";
      const long = range.long ?? range.value?.long ?? "";
      const units = range.units ?? range.value?.units ?? "";
      const unitConfig =
        CONFIG.DND5E.rangeTypes?.[units] ?? CONFIG.DND5E.movementUnits?.[units];
      const unit = configLabel(unitConfig) || units;

      if (range.special) {
        return escapeHTML(range.special);
      }

      if (!value && !unit) {
        return t("Combat.RangeUnknown");
      }

      const distance = long ? `${value}/${long}` : value;

      return escapeHTML([distance, unit].filter(part => part !== "").join(" "));
    };

    const hasSpellProperty = (item, property) => {
      const properties = item.system?.properties;
      const activityHasProperty = itemActivities(item).some(activity => {
        if (property === "concentration") {
          return Boolean(activity?.duration?.concentration);
        }

        return false;
      });

      return [
        properties?.has?.(property),
        properties?.includes?.(property),
        properties?.[property],
        item.system?.components?.[property],
        property === "concentration" && item.system?.duration?.concentration,
        property === "ritual" && item.system?.preparation?.mode === "ritual",
        activityHasProperty
      ].some(Boolean);
    };

    const itemResourceCost = item => {
      const activityTarget = itemActivities(item)
        .flatMap(activity => activity?.consumption?.targets ?? [])
        .find(target => Number(target?.value ?? target?.amount) > 0);
      const legacy = item.system?.consume;
      const amount = Number(
        activityTarget?.value ?? activityTarget?.amount ?? legacy?.amount ?? 0
      );

      if (!amount) {
        return "";
      }

      const targetId = activityTarget?.target ?? legacy?.target;
      const targetItem = targetId ? actor.items.get(targetId) : null;
      const label =
        targetItem?.name ??
        String(targetId ?? "")
          .split(".")
          .filter(Boolean)
          .at(-1) ??
        t("Combat.Resource");

      return `${amount} ${label}`;
    };

    const itemAttackBonus = item => {
      const activity = itemActivities(item).find(
        candidate => candidate?.type === "attack" || candidate?.attack
      );
      const value =
        activity?.labels?.toHit ??
        activity?.labels?.modifier ??
        item.labels?.toHit ??
        item.labels?.attack;

      if ([undefined, null, ""].includes(value)) {
        return "";
      }

      const label = String(value).trim();
      return /^\d/.test(label) ? `+${label}` : label;
    };

    const damagePartFormula = part => {
      if (Array.isArray(part)) {
        return part[0] ?? "";
      }

      if (part?.formula) {
        return part.formula;
      }

      const number = Number(part?.number ?? 0);
      const denomination = Number(part?.denomination ?? 0);
      const bonus = String(part?.bonus ?? "").trim();

      if (!number || !denomination) {
        return bonus;
      }

      return `${number}d${denomination}${bonus ? ` + ${bonus}` : ""}`;
    };

    const resolveDamageFormula = (formula, item, activity) => {
      if (!formula) {
        return "";
      }

      const source = String(formula);
      const rollData =
        activity?.getRollData?.({ deterministic: true }) ??
        item.getRollData?.() ??
        actor.getRollData?.() ??
        {};
      let resolved = source;

      try {
        resolved = Roll.replaceFormulaData(source, rollData, {
          missing: 0,
          warn: false
        });
      } catch {
        // Keep the readable source formula when a system formula cannot be resolved.
      }

      return resolved.replaceAll(/\s+/g, " ").trim();
    };

    const itemDamageFormula = item => {
      const activities = itemActivities(item);
      const activityParts = activities.flatMap(activity =>
        (activity?.damage?.parts ?? []).map(part => ({ activity, part }))
      );
      const legacyParts = item.system?.damage?.parts ?? [];
      const base = item.system?.damage?.base;
      const records = [
        ...activityParts,
        ...(base?.formula ? [{ activity: activities[0], part: base }] : []),
        ...legacyParts.map(part => ({ activity: activities[0], part }))
      ];
      const sourceFormulas = records.map(({ part }) => damagePartFormula(part));
      const formulas = records
        .map(({ activity, part }) =>
          resolveDamageFormula(damagePartFormula(part), item, activity)
        )
        .map(formula => String(formula ?? "").trim())
        .filter(Boolean);
      const unique = [...new Set(formulas)];

      if (
        item.type === "weapon" &&
        unique.length &&
        !sourceFormulas.some(formula => String(formula).includes("@mod"))
      ) {
        const activity = activities.find(candidate => candidate?.attack);
        const abilityId =
          activity?.ability ??
          item.system?.ability ??
          (item.system?.actionType?.startsWith("r") ? "dex" : "str");
        const modifier = Number(actor.system.abilities?.[abilityId]?.mod ?? 0);

        if (modifier) {
          unique[0] = `${unique[0]} ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;
        }
      }

      return unique.join(" + ");
    };

    const isPreparedSpell = item => {
      const preparation = item.system?.preparation ?? {};

      return Boolean(
        Number(item.system?.level ?? 0) === 0 ||
        preparation.prepared ||
        ["always", "atwill", "innate", "pact"].includes(preparation.mode)
      );
    };

    const combatItems = category =>
      actor.items.filter(item => {
        if (category === "weapons") {
          return item.type === "weapon";
        }

        if (category === "spells") {
          return item.type === "spell";
        }

        return itemActivation(item) === category;
      });

    const combatItemButton = item => {
      const isSpell = item.type === "spell";
      const isWeapon = item.type === "weapon";
      const showsRange = isSpell || isWeapon;
      const concentration = isSpell && hasSpellProperty(item, "concentration");
      const ritual = isSpell && hasSpellProperty(item, "ritual");
      const activation = itemActivation(item);
      const resourceCost = itemResourceCost(item);
      const attackBonus = isSpell || isWeapon ? itemAttackBonus(item) : "";
      const damageFormula = isSpell || isWeapon ? itemDamageFormula(item) : "";
      const showsDetails =
        visibility.itemDetails &&
        (showsRange ||
          activation ||
          concentration ||
          ritual ||
          resourceCost ||
          attackBonus ||
          damageFormula);

      return `
        <div class="ws-combat-item-card ${
          showsDetails ? "ws-detailed-card" : ""
        }">
          <button
            type="button"
            class="ws-combat-item ws-button"
            data-action="useitem"
            data-item-id="${escapeHTML(item.id)}"
            title="${escapeHTML(item.name)}"
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(item.name)}</strong>
              ${
                showsDetails
                  ? `
                    <small class="ws-spell-meta">
                      ${
                        showsRange
                          ? `
                            <span title="${t("Combat.Range")}">
                              <i class="fa-solid fa-crosshairs"></i>
                              ${itemRange(item)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        activation
                          ? `
                            <span title="${t("Combat.Activation")}">
                              <i class="fa-solid fa-hourglass-half"></i>
                              ${escapeHTML(activationLabel(item))}
                            </span>
                          `
                          : ""
                      }
                      ${
                        attackBonus
                          ? `
                            <span title="${t("Combat.AttackBonus")}">
                              <i class="fa-solid fa-bullseye"></i>
                              ${escapeHTML(attackBonus)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        damageFormula
                          ? `
                            <span title="${t("Combat.DamageFormula")}">
                              <i class="fa-solid fa-burst"></i>
                              ${escapeHTML(damageFormula)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        concentration
                          ? `<b title="${t("Combat.Concentration")}">${t("Combat.ConcentrationShort")}</b>`
                          : ""
                      }
                      ${
                        ritual
                          ? `<b title="${t("Combat.Ritual")}">${t("Combat.RitualShort")}</b>`
                          : ""
                      }
                      ${
                        resourceCost
                          ? `<b title="${t("Combat.ResourceCost")}"><i class="fa-solid fa-battery-half"></i> ${escapeHTML(resourceCost)}</b>`
                          : ""
                      }
                    </small>
                  `
                  : ""
              }
            </span>

            <i class="fa-solid fa-dice-d20"></i>
          </button>

          <button
            type="button"
            class="ws-item-description ws-button"
            data-action="openitem"
            data-item-id="${escapeHTML(item.id)}"
            title="${t("Combat.OpenDescription")}"
            aria-label="${t("Combat.OpenDescription")}: ${escapeHTML(item.name)}"
          >
            <i class="fa-solid fa-book-open"></i>
          </button>
        </div>
      `;
    };

    const combatCategories = () =>
      [
        ["weapons", "fa-swords", "Combat.Weapons", visibility.combatWeapons],
        [
          "spells",
          "fa-wand-magic-sparkles",
          "Combat.Spells",
          visibility.combatSpells
        ],
        ["action", "fa-circle-play", "Combat.Action", visibility.combatActions],
        [
          "bonus",
          "fa-bolt",
          "Combat.BonusAction",
          visibility.combatBonusActions
        ],
        [
          "reaction",
          "fa-shield",
          "Combat.Reaction",
          visibility.combatReactions
        ],
        ["special", "fa-star", "Combat.Special", visibility.combatSpecial]
      ].filter(([, , , visible]) => visible);

    const spellSlots = level => {
      if (level <= 0) {
        return `<span>${t("Combat.Cantrip")}</span>`;
      }

      const standard = actor.system.spells?.[`spell${level}`] ?? {};
      const pools = [];

      if (Number(standard.max ?? 0) > 0) {
        pools.push([Number(standard.value ?? 0), Number(standard.max)]);
      }

      const pact = actor.system.spells?.pact ?? {};
      if (Number(pact.level) === level && Number(pact.max ?? 0) > 0) {
        pools.push([Number(pact.value ?? 0), Number(pact.max)]);
      }

      if (!pools.length) {
        return `<span>${t("Combat.NoSlots")}</span>`;
      }

      return pools
        .map(([value, max]) => {
          const dots =
            max <= 10
              ? Array.from(
                  { length: max },
                  (_, index) =>
                    `<i class="ws-slot ${index < value ? "ws-slot-filled" : ""}"></i>`
                ).join("")
              : "";

          return `
            <span class="ws-spell-slots" title="${value}/${max}">
              ${dots}<b>${value}/${max}</b>
            </span>
          `;
        })
        .join("");
    };

    const spellGroups = items => {
      const filtered = preparedSpellsOnly
        ? items.filter(isPreparedSpell)
        : items;
      const levels = new Map();

      for (const item of filtered) {
        const level = Number(item.system?.level ?? 0);
        const spells = levels.get(level) ?? [];
        spells.push(item);
        levels.set(level, spells);
      }

      return [...levels.entries()]
        .sort(([a], [b]) => a - b)
        .map(
          ([level, spells]) => `
            <section class="ws-spell-level">
              <div class="ws-spell-level-heading">
                <strong>${
                  level === 0
                    ? t("Combat.Cantrips")
                    : tf("Combat.SpellLevel", { level })
                }</strong>
                ${spellSlots(level)}
              </div>
              <div class="ws-combat-item-grid">
                ${spells.map(combatItemButton).join("")}
              </div>
            </section>
          `
        )
        .join("");
    };

    const combatActions = () => {
      const categories = combatCategories();

      if (!categories.length) {
        return "";
      }

      if (!categories.some(([category]) => category === combatCategory)) {
        combatCategory = categories[0][0];
      }

      const items = combatItems(combatCategory);

      return `
        <div class="ws-combat-actions">
          <div class="ws-combat-filters">
            ${categories
              .map(
                ([category, icon, label]) => `
                  <button
                    type="button"
                    class="ws-combat-filter ws-button ${
                      combatCategory === category ? "ws-active" : ""
                    }"
                    data-action="combatfilter"
                    data-category="${category}"
                    title="${t(label)}"
                  >
                    <i class="fa-solid ${icon}"></i>
                    <span>${t(label)}</span>
                    <small>${combatItems(category).length}</small>
                  </button>
                `
              )
              .join("")}
          </div>

          ${
            combatCategory === "spells"
              ? `
                <div class="ws-spell-filter" role="group" aria-label="${t("Combat.SpellFilter")}">
                  <button type="button" class="ws-button ${preparedSpellsOnly ? "ws-active" : ""}" data-action="spellfilter" data-prepared="true">
                    ${t("Combat.Prepared")}
                  </button>
                  <button type="button" class="ws-button ${preparedSpellsOnly ? "" : "ws-active"}" data-action="spellfilter" data-prepared="false">
                    ${t("Combat.AllSpells")}
                  </button>
                </div>
              `
              : ""
          }

          <div class="ws-combat-item-list">
            ${
              items.length
                ? combatCategory === "spells"
                  ? spellGroups(items) ||
                    `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
                  : `<div class="ws-combat-item-grid">${items.map(combatItemButton).join("")}</div>`
                : `<div class="ws-empty">${t("Combat.Empty")}</div>`
            }
          </div>
        </div>
      `;
    };

    const configuredStatuses = () => {
      const statuses = Array.isArray(CONFIG.statusEffects)
        ? CONFIG.statusEffects
        : [...(CONFIG.statusEffects?.values?.() ?? [])];
      return statuses.filter(status => status?.id);
    };

    const activeStatuses = () => {
      const configured = configuredStatuses();
      const byId = new Map(configured.map(status => [status.id, status]));
      const statuses = new Map();

      for (const id of actor.statuses ?? []) {
        const status = byId.get(id) ?? { id, name: id };
        statuses.set(id, { ...status, statusId: id });
      }

      for (const effect of actor.effects ?? []) {
        const effectStatuses = [...(effect.statuses ?? [])];

        if (effect.disabled || !effectStatuses.length) {
          continue;
        }

        for (const id of effectStatuses) {
          const configuredStatus = byId.get(id) ?? {};
          statuses.set(id, {
            ...configuredStatus,
            id,
            statusId: id,
            effectId: effect.id,
            name:
              configuredStatus.name ?? configuredStatus.label ?? effect.name,
            img:
              configuredStatus.img ??
              configuredStatus.icon ??
              effect.img ??
              effect.icon
          });
        }
      }

      return [...statuses.values()];
    };

    const combatStatuses = () => {
      const statuses = activeStatuses();
      const statusLabel = status =>
        game.i18n.localize(status.name ?? status.label ?? status.id);
      const statusIcon = status =>
        status.img ?? status.icon ?? "icons/svg/aura.svg";

      if (!statuses.length) {
        return "";
      }

      return `
        <div class="ws-combat-statuses">
          <div class="ws-active-conditions">
            ${statuses
              .map(status => {
                const label = statusLabel(status);

                return `
                  <button
                    type="button"
                    class="ws-status ws-button"
                    data-action="removestatus"
                    data-status-id="${escapeHTML(status.id)}"
                    ${status.effectId ? `data-effect-id="${escapeHTML(status.effectId)}"` : ""}
                    title="${tf("Combat.RemoveCondition", { condition: label })}"
                    ${canRollActor ? "" : "disabled"}
                  >
                    <img src="${escapeHTML(statusIcon(status))}" alt="">
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    };

    const combatInitiative = () => {
      const combatant = getCombatant();

      if (!visibility.initiative || !combatant) {
        return "";
      }

      const rolled = combatant.initiative != null;

      return `
        <button
          type="button"
          class="ws-header-initiative ws-button ${rolled ? "" : "ws-unrolled"}"
          data-action="initiative"
          title="${rolled ? t("Initiative.Rolled") : t("Initiative.Roll")}"
          ${rolled || !canRollActor ? "disabled" : ""}
        >
          <span>${t("Labels.Initiative")}</span>
          <strong>${rolled ? combatant.initiative : "—"}</strong>
        </button>
      `;
    };

    const combatResources = () => {
      if (!visibility.combatResources) {
        return "";
      }

      const actorResources = Object.entries(actor.system.resources ?? {})
        .map(([id, resource]) => ({
          id,
          label: resource?.label || id,
          value: Number(resource?.value ?? 0),
          max: Number(resource?.max ?? 0),
          itemId: null
        }))
        .filter(resource => resource.max > 0 || resource.value > 0);

      const featureResources = actor.items
        .filter(item => item.type === "feat")
        .map(item => {
          const uses = item.system?.uses ?? {};
          const max = Number(uses.max ?? 0);
          const spent = Number(uses.spent ?? 0);
          const hasLegacyValue = ![undefined, null, ""].includes(uses.value);
          const value = hasLegacyValue
            ? Number(uses.value) || 0
            : Math.max(0, max - spent);

          return {
            id: item.id,
            label: item.name,
            value,
            max,
            itemId: item.id
          };
        })
        .filter(resource => resource.max > 0);

      const actorLabels = new Set(
        actorResources.map(resource =>
          String(resource.label).trim().toLocaleLowerCase()
        )
      );
      const resources = [
        ...actorResources,
        ...featureResources.filter(
          resource =>
            !actorLabels.has(String(resource.label).trim().toLocaleLowerCase())
        )
      ];

      if (!resources.length) {
        return "";
      }

      return `
        <div class="ws-combat-resources ${resourcesExpanded ? "ws-expanded" : ""}">
          <button type="button" class="ws-resources-toggle ws-button" data-action="toggleresources" aria-expanded="${resourcesExpanded}">
            <span><i class="fa-solid fa-battery-three-quarters"></i>${t("Combat.ClassResources")}</span>
            <span>${resources.length}<i class="fa-solid fa-chevron-${resourcesExpanded ? "up" : "down"}"></i></span>
          </button>
          <div class="ws-resource-grid">
            ${resources
              .map(
                resource => `
                <button
                  type="button"
                  class="ws-combat-stat ws-resource-link ws-button"
                  data-action="openresource"
                  ${resource.itemId ? `data-item-id="${resource.itemId}"` : `data-resource-id="${escapeHTML(resource.id)}"`}
                  title="${t("Combat.ManageResource")}"
                >
                  <span>${escapeHTML(resource.label)}</span>
                  <strong>${resource.value} / ${resource.max || "—"}</strong>
                </button>
              `
              )
              .join("")}
          </div>
        </div>
      `;
    };

    const openResourceDialog = ({ item = null, resourceId = null } = {}) => {
      const actorResource = resourceId
        ? actor.system.resources?.[resourceId]
        : null;
      const uses = item?.system?.uses ?? actorResource ?? {};
      const max = Number(uses.max ?? 0);
      const current = ![undefined, null, ""].includes(uses.value)
        ? Number(uses.value) || 0
        : Math.max(0, max - Number(uses.spent ?? 0));
      const content = document.createElement("div");
      content.innerHTML = `
        <div class="ws-resource-dialog-content">
          <p>${escapeHTML(item?.name ?? actorResource?.label ?? resourceId)}</p>
          <label>
            <span>${t("Combat.ResourceAmount")}</span>
            <input type="number" name="amount" value="1" min="1" max="${Math.max(1, current, max)}" step="1">
          </label>
          <small>${tf("Combat.ResourceRemaining", { current, max })}</small>
          <div class="ws-resource-dialog-actions">
            <button type="button" data-action="changeresource" data-direction="consume" ${current <= 0 ? "disabled" : ""}>
              <i class="fa-solid fa-minus"></i>${t("Combat.Consume")}
            </button>
            <button type="button" data-action="changeresource" data-direction="restore" ${max <= 0 || current >= max ? "disabled" : ""}>
              <i class="fa-solid fa-plus"></i>${t("Combat.Restore")}
            </button>
          </div>
        </div>
      `;

      const dialog = new DialogV2({
        classes: ["ws-resource-dialog"],
        window: { title: t("Combat.ManageResource") },
        position: { width: 320, height: "auto" },
        content,
        actions: {
          changeresource: async function (_event, target) {
            const input = dialog.element.querySelector('[name="amount"]');
            const direction = target.dataset.direction;
            const nextValue = calculateResourceValue({
              amount: input?.value,
              current,
              direction,
              max
            });

            if (nextValue === null || nextValue === current) {
              return;
            }

            const sourceUses = item?._source?.system?.uses ?? {};

            if (item && Object.hasOwn(sourceUses, "spent")) {
              await item.update({
                "system.uses.spent": Math.max(0, max - nextValue)
              });
            } else if (item) {
              await item.update({
                "system.uses.value": nextValue
              });
            } else if (resourceId) {
              await actor.update({
                [`system.resources.${resourceId}.value`]: nextValue
              });
            }

            await dialog.close();
          }
        },
        buttons: [
          {
            action: "close",
            label: t("Actor.Cancel")
          }
        ]
      });

      return dialog.render({ force: true });
    };

    const openHpDialog = field => {
      const hp = actor.system.attributes.hp ?? {};
      const isTemp = field === "temp";
      const current = Number(hp[field] ?? 0);
      const content = document.createElement("div");
      content.innerHTML = `
        <div class="ws-hp-dialog-content">
          <label>
            <span>${t(isTemp ? "Combat.TempHP" : "Combat.HP")}</span>
            <input type="number" name="value" value="${current}" min="0" step="1">
          </label>
          <button type="button" data-action="savehp">
            <i class="fa-solid fa-check"></i>${t("Combat.SaveHP")}
          </button>
        </div>
      `;

      const dialog = new DialogV2({
        classes: ["ws-hp-dialog"],
        window: {
          title: t(isTemp ? "Combat.EditTempHP" : "Combat.EditHP")
        },
        position: { width: 280, height: "auto" },
        content,
        actions: {
          savehp: async function () {
            const input = dialog.element.querySelector('[name="value"]');
            let value = Math.max(0, Number(input?.value ?? current) || 0);

            if (!isTemp) {
              value = Math.min(value, Math.max(0, Number(hp.max ?? 0)));
            }

            await actor.update({ [`system.attributes.hp.${field}`]: value });
            await dialog.close();
          }
        },
        buttons: [
          {
            action: "close",
            label: t("Actor.Cancel")
          }
        ]
      });

      return dialog.render({ force: true });
    };

    function combatHTML() {
      const combatant = getCombatant();
      const hp = actor.system.attributes.hp ?? {};
      const ac = actor.system.attributes.ac?.value ?? "—";
      const movement = actor.system.attributes.movement ?? {};
      const speed = movement.walk ?? movement.fly ?? "—";
      const units = movement.units ?? "";
      const isTurn = game.combat?.combatant?.id === combatant?.id;

      return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          <div class="ws-layout-anchor"></div>

          ${modeNavigation("combat")}

          <div class="ws-combat-heading">
            <span>
              <i class="fa-solid fa-shield-halved"></i>
              ${t("Labels.Combat")}
            </span>

            ${isTurn ? `<b>${t("Combat.YourTurn")}</b>` : ""}
          </div>

          <div class="ws-combat-stats">
            <button
              type="button"
              class="ws-combat-stat ws-combat-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="value"
              title="${t("Combat.EditHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.HP")}</span>
              <strong>
                ${Number(hp.value ?? 0)} / ${Number(hp.max ?? 0)}
              </strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            <button
              type="button"
              class="ws-combat-stat ws-combat-temp-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="temp"
              title="${t("Combat.EditTempHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.TempHP")}</span>
              <strong>${Number(hp.temp ?? 0)}</strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            ${
              Number(hp.tempmax ?? 0) !== 0
                ? `
                  <div class="ws-combat-stat ws-combat-temp-max">
                    <span>${t("Combat.TempMax")}</span>
                    <strong>${formatMod(hp.tempmax)}</strong>
                  </div>
                `
                : ""
            }

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

          </div>

          ${combatResources()}

          ${combatStatuses()}

          ${
            visibility.savingThrows
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${savingThrowsSection()}
                </div>
              `
              : ""
          }

          ${combatActions()}

          ${shortcutHint()}
        </div>
      `;
    }

    // =========================================================
    // Death saves
    // =========================================================

    const deathPips = (value, type) =>
      Array.from(
        { length: 3 },
        (_, index) => `
          <span
            class="
              ws-death-pip
              ws-death-${type}
              ${index < value ? "ws-death-filled" : ""}
            "
          ></span>
        `
      ).join("");

    const deathTracker = () => {
      const { failure, success } = deathData();

      return `
        <div class="ws-death-tracker">

        <div class="ws-death-track">
          <span class="ws-death-label">
            ${t("Death.Successes")}
          </span>

          <div class="ws-death-pips">
            ${deathPips(success, "success")}
          </div>
        </div>

        <div class="ws-death-track">
          <span class="ws-death-label">
            ${t("Death.Failures")}
          </span>

          <div class="ws-death-pips">
            ${deathPips(failure, "failure")}
          </div>
        </div>

        </div>
      `;
    };

    function deathHTML() {
      return `
        <div
          id="ws-death"
          class="ws-view ws-death-view"
        >
          ${actorHeader(inspirationControl())}

          <div class="ws-layout-anchor"></div>

          ${modeNavigation("death")}

          <div class="ws-death-heading">

            <div class="ws-death-heading-icon">
              <i
                class="
                  fa-solid
                  fa-heart-pulse
                "
              ></i>
            </div>

            <div>
              <strong>
                ${t("Labels.DeathSaves")}
              </strong>

              <span>
                ${t("Death.ZeroHP")}
              </span>
            </div>

          </div>

          ${deathTracker()}

          ${
            canRollActor && canRollDeathSave()
              ? `
                <div class="ws-death-roll-section">
                  <button
                    type="button"
                    class="ws-death-roll ws-button"
                    data-action="death"
                    aria-label="${t("Death.Roll")}"
                  >
                    <span>
                      <i class="fa-solid fa-dice-d20"></i>
                      ${t("Death.Roll")}
                    </span>

                    <i
                      class="fa-solid fa-chevron-right ws-arrow"
                    ></i>
                  </button>
                </div>
              `
              : ""
          }

          ${shortcutHint()}
        </div>
      `;
    }

    // =========================================================
    // Content
    // =========================================================

    const content = document.createElement("div");

    const renderTemplate =
      foundry.applications.handlebars?.renderTemplate ??
      globalThis.renderTemplate;

    content.innerHTML = await renderTemplate(
      "modules/adventurer-hud/templates/rolls-hud.hbs",
      {
        body:
          currentMode() === "death"
            ? deathHTML()
            : currentMode() === "combat"
              ? combatHTML()
              : normalHTML()
      }
    );

    // =========================================================
    // Dialog state
    // =========================================================

    const dialogTitle = () =>
      currentMode() === "death"
        ? tf("Window.DeathTitle", { actor: actor.name })
        : currentMode() === "combat"
          ? tf("Window.CombatTitle", { actor: actor.name })
          : tf("Window.Title", { actor: actor.name });

    let currentView = "main";
    let rollPending = false;

    const setRollControlsDisabled = disabled => {
      app?.element
        ?.querySelectorAll(
          [
            '[data-action="initiative"]',
            '[data-action="ability"]',
            '[data-action="skill"]',
            '[data-action="tool"]',
            '[data-action="death"]',
            '[data-action="useitem"]',
            '[data-action="removestatus"]',
            '[data-action="edithp"]',
            '[data-action="shortrest"]',
            '[data-action="longrest"]'
          ].join(",")
        )
        .forEach(button => {
          button.disabled = disabled;
        });
    };

    const rollAndClose = async callback => {
      if (rollPending) {
        return;
      }

      rollPending = true;
      setRollControlsDisabled(true);

      try {
        const result = await callback();

        if (result && !keepOpen) {
          await app.close();
        }

        return result;
      } finally {
        rollPending = false;

        if (app?.rendered) {
          refreshHud();
        }
      }
    };

    const performAndRefresh = async callback => {
      if (rollPending) {
        return;
      }

      rollPending = true;
      setRollControlsDisabled(true);

      try {
        return await callback();
      } finally {
        rollPending = false;
        refreshHud();
      }
    };

    const setView = view => {
      if (!["main", "skills", "tools", "spells"].includes(view)) {
        return;
      }

      currentView = view;

      app.element
        .querySelectorAll(".ws-view")
        .forEach(element => element.classList.add("ws-hidden"));

      app.element.querySelector(`#ws-${view}`)?.classList.remove("ws-hidden");
    };

    const layoutSelectors = {
      regular: {
        navigation: ".ws-mode-navigation",
        abilities: ".ws-ability-table",
        destinations: ".ws-nav-grid",
        shortcuts: ".ws-shortcuts"
      },
      combat: {
        navigation: ".ws-mode-navigation",
        heading: ".ws-combat-heading",
        stats: ".ws-combat-stats",
        resources: ".ws-combat-resources",
        conditions: ".ws-combat-statuses",
        saves: ".ws-ability-table",
        actions: ".ws-combat-actions",
        shortcuts: ".ws-shortcuts"
      },
      death: {
        navigation: ".ws-mode-navigation",
        heading: ".ws-death-heading",
        tracker: ".ws-death-tracker",
        roll: ".ws-death-roll-section",
        shortcuts: ".ws-shortcuts"
      }
    };

    const applyLayout = mode => {
      const view = app?.element?.querySelector(
        `#ws-${mode === "regular" ? "main" : mode}`
      );
      const anchor = view?.querySelector(":scope > .ws-layout-anchor");

      if (!view || !anchor) {
        return;
      }

      view
        .querySelectorAll(":scope > .ws-divider")
        .forEach(divider => divider.remove());

      const selectors = layoutSelectors[mode];
      const elements = new Map();

      for (const [id, selector] of Object.entries(selectors)) {
        const element = view.querySelector(`:scope > ${selector}`);

        if (element) {
          element.dataset.layoutSection = id;
          elements.set(id, element);
        }
      }

      const layout = modeLayout(mode);
      let cursor = anchor;

      for (const id of layout.order) {
        const element = elements.get(id);

        if (!element) {
          continue;
        }

        cursor.after(element);
        cursor = element;
        element.classList.toggle(
          "ws-layout-hidden",
          layout.hidden.includes(id) && !(editMode && id === "navigation")
        );
      }

      view.classList.toggle("ws-edit-mode", editMode);

      if (!editMode) {
        return;
      }

      for (const [id, element] of elements) {
        if (layout.hidden.includes(id) && id !== "navigation") {
          continue;
        }

        element.draggable = true;
        element.classList.add("ws-layout-editable");
        element.insertAdjacentHTML(
          "afterbegin",
          `<div class="ws-layout-controls">
            <span><i class="fa-solid fa-grip-vertical"></i>${t(`Layout.${id}`)}</span>
            <button type="button" data-action="layoutremove" data-section="${id}" title="${t("Layout.Remove")}"><i class="fa-solid fa-xmark"></i></button>
          </div>`
        );

        element.addEventListener("dragstart", event => {
          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        });
        element.addEventListener("dragover", event => event.preventDefault());
        element.addEventListener("drop", event => {
          event.preventDefault();
          const source = event.dataTransfer.getData("text/plain");

          if (!source || source === id || !layout.order.includes(source)) {
            return;
          }

          const order = layout.order.filter(entry => entry !== source);
          order.splice(order.indexOf(id), 0, source);
          saveModeLayout(mode, { ...layout, order });
          refreshHud();
        });
      }

      const hidden = layout.hidden.filter(
        id => id !== "navigation" && elements.has(id)
      );
      const palette = document.createElement("div");
      palette.className = "ws-layout-palette";
      palette.innerHTML = `
        <strong><i class="fa-solid fa-pen-ruler"></i>${t("Layout.EditMode")}</strong>
        ${
          hidden.length
            ? hidden
                .map(
                  id =>
                    `<button type="button" class="ws-button" data-action="layoutadd" data-section="${id}"><i class="fa-solid fa-plus"></i>${t(`Layout.${id}`)}</button>`
                )
                .join("")
            : `<span>${t("Layout.AllVisible")}</span>`
        }
      `;
      anchor.after(palette);
    };

    const refreshHud = () => {
      if (!app?.rendered) {
        return;
      }

      const shell = app.element.querySelector(".ws-shell");

      if (!shell) {
        return;
      }

      if (!showDeathSaves() && !combatModeAvailable()) {
        forceRegularMode = false;
        forceCombatMode = false;
        forceDeathMode = false;
      }

      const mode = currentMode();
      shell.innerHTML =
        mode === "death"
          ? deathHTML()
          : mode === "combat"
            ? combatHTML()
            : normalHTML();

      const windowTitle = app.element.querySelector(".window-title");

      if (windowTitle) {
        windowTitle.textContent = dialogTitle();
      }

      applyLayout(mode);

      if (mode === "regular") {
        setView(currentView);
      } else {
        currentView = "main";
      }
    };

    // =========================================================
    // ApplicationV2 actions
    // =========================================================

    const actions = {
      initiative: async function (event) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        if (!game.combat) {
          return ui.notifications.warn(t("Initiative.NoCombat"));
        }

        const combatant = getCombatant();

        if (combatant?.initiative != null) {
          return;
        }

        if (!combatant) {
          return ui.notifications.warn(t("Initiative.NotCombatant"));
        }

        return rollAndClose(() =>
          game.combat.rollInitiative(combatant.id, { event })
        );
      },

      ability: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const { type, key } = target.dataset;

        return rollAndClose(() =>
          type === "save"
            ? actor.rollSavingThrow({
                ability: key,
                event
              })
            : actor.rollAbilityCheck({
                ability: key,
                event
              })
        );
      },

      skill: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return rollAndClose(() =>
          actor.rollSkill({
            skill: target.dataset.key,
            event
          })
        );
      },

      tool: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return rollAndClose(() =>
          actor.rollToolCheck({
            tool: target.dataset.key,
            event
          })
        );
      },

      death: async function (event) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        if (!canRollDeathSave()) {
          return ui.notifications.warn(t("Death.NotRequired"));
        }

        return rollAndClose(() => actor.rollDeathSave({ event }));
      },

      normal: function () {
        forceRegularMode = true;
        forceCombatMode = false;
        forceDeathMode = false;
        currentView = "main";
        refreshHud();
      },

      regularview: function (_event, target) {
        forceRegularMode = true;
        forceCombatMode = false;
        forceDeathMode = false;
        currentView = target.dataset.view;
        refreshHud();
      },

      combatmode: function () {
        if (!combatModeAvailable()) {
          return ui.notifications.warn(t("Combat.NotAvailable"));
        }

        forceRegularMode = false;
        forceCombatMode = true;
        forceDeathMode = false;
        currentView = "main";
        refreshHud();
      },

      combatfilter: function (_event, target) {
        combatCategory = target.dataset.category;
        refreshHud();
      },

      spellfilter: function (_event, target) {
        preparedSpellsOnly = target.dataset.prepared === "true";
        refreshHud();
      },

      togglesaves: function () {
        savingThrowsExpanded = !savingThrowsExpanded;
        refreshHud();
      },

      layoutremove: function (_event, target) {
        const mode = currentMode();
        const layout = modeLayout(mode);
        const section = target.dataset.section;

        if (!layout.hidden.includes(section)) {
          layout.hidden.push(section);
          saveModeLayout(mode, layout);
          refreshHud();
        }
      },

      layoutadd: function (_event, target) {
        const mode = currentMode();
        const layout = modeLayout(mode);
        layout.hidden = layout.hidden.filter(
          id => id !== target.dataset.section
        );
        saveModeLayout(mode, layout);
        refreshHud();
      },

      toggleresources: function () {
        resourcesExpanded = !resourcesExpanded;
        refreshHud();
      },

      edithp: function (_event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return openHpDialog(target.dataset.hpField);
      },

      inspiration: function () {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return performAndRefresh(() =>
          actor.update({
            "system.attributes.inspiration":
              !actor.system.attributes?.inspiration
          })
        );
      },

      shortrest: function () {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return performAndRefresh(() => actor.shortRest());
      },

      longrest: function () {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return performAndRefresh(() => actor.longRest());
      },

      useitem: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const item = actor.items.get(target.dataset.itemId);

        if (!item) {
          return ui.notifications.warn(t("Combat.ItemMissing"));
        }

        return rollAndClose(() => item.use({ event }));
      },

      openitem: function (_event, target) {
        const item = actor.items.get(target.dataset.itemId);

        if (!item) {
          return ui.notifications.warn(t("Combat.ItemMissing"));
        }

        return item.sheet.render({ force: true });
      },

      openresource: function (_event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const item = target.dataset.itemId
          ? actor.items.get(target.dataset.itemId)
          : null;
        const resourceId = target.dataset.resourceId;

        if (!item && !resourceId) {
          return ui.notifications.warn(t("Combat.ItemMissing"));
        }

        return openResourceDialog({ item, resourceId });
      },

      removestatus: async function (_event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const statusId = target.dataset.statusId;
        const effectId = target.dataset.effectId;

        if (actor.statuses?.has(statusId)) {
          await actor.toggleStatusEffect(statusId, { active: false });
        } else if (effectId) {
          await actor.effects.get(effectId)?.delete();
        }
        refreshHud();
      },

      settings: async function () {
        const sheet = game.settings.sheet;
        await sheet.render({ force: true });

        const category = sheet.element?.querySelector(
          `[data-category="${MODULE_ID}"], [data-tab="${MODULE_ID}"]`
        );

        if (category) {
          category.click();
        } else {
          sheet.search?.(t("Title"));
        }

        return sheet;
      },

      toggleedit: function () {
        editMode = !editMode;
        currentView = "main";
        refreshHud();
      },

      deathmode: function () {
        if (!editMode && !deathModeAvailable()) {
          return ui.notifications.warn(t("Combat.NotAvailable"));
        }

        forceRegularMode = false;
        forceCombatMode = false;
        forceDeathMode = true;
        currentView = "main";
        refreshHud();
      },

      togglekeepopen: async function () {
        await storeKeepOpen(!keepOpen);
        ui.notifications.info(
          t(keepOpen ? "Window.KeepOpenEnabled" : "Window.KeepOpenDisabled")
        );
      },

      resetwindow: async function () {
        app.setPosition({
          width: dialogWidth,
          height: "auto"
        });

        await new Promise(resolve => requestAnimationFrame(resolve));

        const rect = app.element.getBoundingClientRect();

        const left = Math.max(
          0,
          Math.round((window.innerWidth - rect.width) / 2)
        );

        const top = Math.max(
          0,
          Math.round((window.innerHeight - rect.height) / 2)
        );

        app.setPosition({ left, top });

        storePosition({
          left,
          top,
          width: rect.width,
          height: "auto"
        });

        await flushWindowGeometry();
      },

      view: function (_event, target) {
        setView(target.dataset.view);
      }
    };

    for (const [name, action] of Object.entries(actions)) {
      actions[name] = async function (...args) {
        try {
          return await action.apply(this, args);
        } catch (error) {
          console.error(`Rolls HUD | ${name} action`, error);

          ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
        }
      };
    }

    // =========================================================
    // DialogV2
    // =========================================================

    const dialogWidth = Math.min(450, Math.max(320, window.innerWidth - 32));

    const storedPosition = loadStoredPosition(dialogWidth);

    const app = new DialogV2({
      classes: [
        "ws-rolls-dialog",
        adaptiveLayout ? "ws-adaptive" : "ws-fixed",
        `ws-font-${fontSize}`
      ],

      window: {
        title: dialogTitle(),
        resizable: true,
        controls: [
          {
            icon: "fa-solid fa-pen-ruler",
            label: t("Layout.ToggleEdit"),
            action: "toggleedit"
          },
          {
            icon: keepOpen ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off",
            label: t("Window.KeepOpenMenu"),
            action: "togglekeepopen"
          },
          {
            icon: "fa-solid fa-arrow-rotate-left",
            label: t("Window.ResetHint"),
            action: "resetwindow"
          },
          {
            icon: "fa-solid fa-gear",
            label: t("Settings.Open"),
            action: "settings"
          }
        ]
      },

      position: {
        width: dialogWidth,
        height: "auto",
        ...storedPosition
      },

      content,

      actions,

      buttons: [
        {
          action: "close",
          label: "Close"
        }
      ]
    });

    await app.render({
      force: true
    });

    state.app = app;

    app.addEventListener("position", () => storePosition(app.position));

    const refreshActorEffect = effect => {
      if (effect?.parent?.uuid === actor.uuid) {
        refreshHud();
      }
    };

    const hookIds = [
      [
        "updateActor",
        Hooks.on("updateActor", updatedActor => {
          if (updatedActor.uuid === actor.uuid) {
            refreshHud();
          }
        })
      ],
      [
        "createActiveEffect",
        Hooks.on("createActiveEffect", refreshActorEffect)
      ],
      [
        "updateActiveEffect",
        Hooks.on("updateActiveEffect", refreshActorEffect)
      ],
      [
        "deleteActiveEffect",
        Hooks.on("deleteActiveEffect", refreshActorEffect)
      ],
      ["createItem", Hooks.on("createItem", refreshActorEffect)],
      ["updateItem", Hooks.on("updateItem", refreshActorEffect)],
      ["deleteItem", Hooks.on("deleteItem", refreshActorEffect)],
      ["createCombat", Hooks.on("createCombat", refreshHud)],
      ["updateCombat", Hooks.on("updateCombat", refreshHud)],
      ["deleteCombat", Hooks.on("deleteCombat", refreshHud)],
      ["createCombatant", Hooks.on("createCombatant", refreshHud)],
      ["updateCombatant", Hooks.on("updateCombatant", refreshHud)],
      ["deleteCombatant", Hooks.on("deleteCombatant", refreshHud)]
    ];

    app.addEventListener(
      "close",
      () => {
        void flushWindowGeometry();

        for (const [hook, id] of hookIds) {
          Hooks.off(hook, id);
        }

        if (state.app === app) {
          state.app = null;
          state.actorUuid = null;
          state.tokenUuid = null;
        }
      },
      { once: true }
    );

    if (currentMode() === "regular") {
      applyLayout("regular");
      setView(currentView);
    } else {
      applyLayout(currentMode());
    }
  } catch (error) {
    console.error("Rolls HUD | fatal error", error);

    ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
  }
}
