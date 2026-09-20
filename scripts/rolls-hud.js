import { abilities, gaming, musical, skillIcons } from "./constants.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
  saveWindowGeometry,
  setSetting,
  SETTINGS
} from "./settings.js";

export async function openRollsHud() {
  try {
    // =========================================================
    // System
    // =========================================================

    if (game.system.id !== "dnd5e") {
      throw new Error(game.i18n.localize("SIMPLE_ROLLS.Errors.Dnd5eOnly"));
    }

    const { DialogV2 } = foundry.applications.api;

    const state = (globalThis.__wsRollsHud ??= {});
    state.app ??= null;
    state.position ??= null;
    state.toolNames ??= new Map();

    const t = key => game.i18n.localize(`SIMPLE_ROLLS.${key}`);

    const tf = (key, data) => game.i18n.format(`SIMPLE_ROLLS.${key}`, data);

    // =========================================================
    // Actor
    // =========================================================

    const selected = canvas.tokens.controlled;

    if (selected.length > 1) {
      return ui.notifications.warn(t("Warnings.OneToken"));
    }

    const token = selected[0] ?? null;
    const actor = token?.actor ?? game.user.character;

    if (!actor) {
      return ui.notifications.warn(t("Warnings.NoActor"));
    }

    if (state.app?.rendered) {
      await flushWindowGeometry();
      await state.app.close();
    }

    state.actorUuid = actor.uuid;

    const canRollActor = actor.isOwner;

    const visibility = {
      abilityChecks: getSetting(SETTINGS.showAbilityChecks),
      deathSaves: getSetting(SETTINGS.showDeathSaves),
      initiative: getSetting(SETTINGS.showInitiative),
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

      const width = Number.isFinite(savedWidth)
        ? Math.min(
            Math.max(160, savedWidth),
            Math.max(160, window.innerWidth - 16)
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

    const getCombatant = () => token?.document.combatant ?? null;

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

    const canRollDeathSave = () => {
      const { failure, success } = deathData();
      return failure < 3 && success < 3;
    };

    let forceRegularMode = false;
    let forceCombatMode = false;

    const combatModeAvailable = () =>
      Boolean(game.combat?.started && getCombatant());

    const currentMode = () => {
      if (forceRegularMode) {
        return "regular";
      }

      if (forceCombatMode && combatModeAvailable()) {
        return "combat";
      }

      if (showDeathSaves()) {
        return "death";
      }

      if (getSetting(SETTINGS.automaticCombatMode) && combatModeAvailable()) {
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
    // Initiative
    // =========================================================

    function initiativeHTML() {
      if (!visibility.initiative) {
        return "";
      }

      const combatant = getCombatant();

      if (combatant?.initiative != null) {
        return `
          <div
            class="ws-init ws-init-done"
            title="${t("Initiative.Rolled")}"
          >
            <span>
              <i class="fa-solid fa-dice-d20"></i>
              ${t("Labels.Initiative")}
            </span>

            <b>
              ${combatant.initiative}
            </b>
          </div>
        `;
      }

      const title = !canRollActor
        ? t("Warnings.NoPermission")
        : !token
          ? t("Initiative.SelectToken")
          : !game.combat
            ? t("Initiative.NoCombat")
            : !combatant
              ? t("Initiative.NotCombatant")
              : t("Initiative.Roll");

      const disabled = !canRollActor || !token || !game.combat || !combatant;

      return `
        <button
          type="button"
          class="ws-init ws-button"
          data-action="initiative"
          title="${title}"
          aria-label="${title}"
          ${disabled ? "disabled" : ""}
        >
          <span>
            <i class="fa-solid fa-dice-d20"></i>
            ${t("Labels.Initiative")}
          </span>

          <i
            class="fa-solid fa-chevron-right ws-arrow"
          ></i>
        </button>
      `;
    }

    // =========================================================
    // Abilities
    // =========================================================

    function abilityRow(type, label, labelIcon) {
      return `
        <div class="ws-ability-row">

          <div class="ws-row-label">
            <i
              class="fa-solid ${labelIcon}"
            ></i>

            ${label}
          </div>

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
                    <i
                      class="fa-solid ${icon}"
                    ></i>

                    <span>
                      ${short}
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

    const actorHeader = () => `
      <div class="ws-actor-header">
        <img
          class="ws-actor-portrait"
          src="${escapeHTML(actor.img ?? "icons/svg/mystery-man.svg")}"
          alt="${escapeHTML(actor.name)}"
        >

        <div class="ws-actor-identity">
          <strong>${escapeHTML(actor.name)}</strong>
          <span>${t(`Modes.${currentMode()}`)}</span>
        </div>
      </div>
    `;

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

        <div class="ws-window-options">
          <label
            class="ws-keep-open"
            title="${t("Window.KeepOpenHint")}"
          >
            <input
              class="ws-keep-open-input"
              type="checkbox"
              data-action="keepopen"
              ${keepOpen ? "checked" : ""}
            >

            <span
              class="ws-keep-open-box"
              aria-hidden="true"
            ></span>

            <span>${t("Window.KeepOpen")}</span>
          </label>

          <button
            type="button"
            class="ws-reset-window"
            data-action="resetwindow"
            title="${t("Window.ResetHint")}"
            aria-label="${t("Window.ResetHint")}"
          >
            <i class="fa-solid fa-arrow-rotate-left"></i>
            <span>${t("Window.Reset")}</span>
          </button>
        </div>
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
          ${actorHeader()}

          ${initiativeHTML()}

          ${
            showDeathSaves()
              ? `
                <button
                  type="button"
                  class="ws-death-switch ws-button"
                  data-action="deathmode"
                  title="${t("Death.Open")}"
                  aria-label="${t("Death.Open")}"
                >
                  <span>
                    <i class="fa-solid fa-heart-pulse"></i>
                    ${t("Labels.DeathSaves")}
                  </span>

                  <i
                    class="fa-solid fa-chevron-right ws-arrow"
                  ></i>
                </button>
              `
              : ""
          }

          ${
            combatModeAvailable()
              ? `
                <button
                  type="button"
                  class="ws-combat-switch ws-button"
                  data-action="combatmode"
                  title="${t("Combat.Open")}"
                  aria-label="${t("Combat.Open")}"
                >
                  <span>
                    <i class="fa-solid fa-shield-halved"></i>
                    ${t("Labels.Combat")}
                  </span>

                  <i class="fa-solid fa-chevron-right ws-arrow"></i>
                </button>
              `
              : ""
          }

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

                  ${
                    visibility.savingThrows
                      ? abilityRow("save", t("Labels.Save"), "fa-shield-halved")
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${
            visibility.skills || visibility.tools
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
      `;
    }

    // =========================================================
    // Combat mode
    // =========================================================

    function combatHTML() {
      const combatant = getCombatant();
      const hp = actor.system.attributes.hp ?? {};
      const ac = actor.system.attributes.ac?.value ?? "—";
      const movement = actor.system.attributes.movement ?? {};
      const speed = movement.walk ?? movement.fly ?? "—";
      const units = movement.units ?? "";
      const isTurn = game.combat?.combatant?.id === combatant?.id;
      const concentrating = Boolean(actor.statuses?.has("concentrating"));

      return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader()}

          <div class="ws-combat-heading">
            <span>
              <i class="fa-solid fa-shield-halved"></i>
              ${t("Labels.Combat")}
            </span>

            ${isTurn ? `<b>${t("Combat.YourTurn")}</b>` : ""}
          </div>

          <div class="ws-combat-stats">
            <div class="ws-combat-stat ws-combat-hp">
              <span>${t("Combat.HP")}</span>
              <strong>
                ${Number(hp.value ?? 0)} / ${Number(hp.max ?? 0)}
                ${
                  Number(hp.temp ?? 0) > 0
                    ? `<small>+${Number(hp.temp)}</small>`
                    : ""
                }
              </strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Initiative")}</span>
              <strong>${combatant?.initiative ?? "—"}</strong>
            </div>
          </div>

          ${
            concentrating
              ? `
                <div class="ws-concentration">
                  <i class="fa-solid fa-circle-dot"></i>
                  ${t("Combat.Concentrating")}
                </div>
              `
              : ""
          }

          ${combatant?.initiative == null ? initiativeHTML() : ""}

          ${
            visibility.savingThrows
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${abilityRow("save", t("Labels.Save"), "fa-shield-halved")}
                </div>
              `
              : ""
          }

          ${
            visibility.skills || visibility.tools
              ? `
                <div class="ws-nav-grid">
                  ${
                    visibility.skills
                      ? `
                        <button
                          type="button"
                          class="ws-nav ws-button"
                          data-action="regularview"
                          data-view="skills"
                        >
                          <span class="ws-nav-main">
                            <i class="fa-solid fa-list-check"></i>
                            ${t("Labels.Skills")}
                          </span>
                          <i class="fa-solid fa-chevron-right ws-arrow"></i>
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
                          data-action="regularview"
                          data-view="tools"
                        >
                          <span class="ws-nav-main">
                            <i class="fa-solid fa-screwdriver-wrench"></i>
                            ${t("Labels.Tools")}
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

          <button
            type="button"
            class="ws-mode-fallback ws-button"
            data-action="normal"
            title="${t("Combat.Regular")}"
            aria-label="${t("Combat.Regular")}"
          >
            <span>
              <i class="fa-solid fa-table-cells"></i>
              ${t("Combat.Regular")}
            </span>
            <i class="fa-solid fa-chevron-right ws-arrow"></i>
          </button>

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
          ${actorHeader()}

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
              `
              : ""
          }

          <button
            type="button"
            class="ws-death-fallback ws-button"
            data-action="normal"
            title="${t("Death.Regular")}"
            aria-label="${t("Death.Regular")}"
          >
            <span>
              <i class="fa-solid fa-table-cells"></i>
              ${t("Death.Regular")}
            </span>

            <i
              class="fa-solid fa-chevron-right ws-arrow"
            ></i>
          </button>

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
      "modules/simple-rolls/templates/rolls-hud.hbs",
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
            '[data-action="death"]'
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

    const setView = view => {
      if (!["main", "skills", "tools"].includes(view)) {
        return;
      }

      currentView = view;

      app.element
        .querySelectorAll(".ws-view")
        .forEach(element => element.classList.add("ws-hidden"));

      app.element.querySelector(`#ws-${view}`)?.classList.remove("ws-hidden");
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

        if (!token) {
          return ui.notifications.warn(t("Initiative.SelectToken"));
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
        currentView = "main";
        refreshHud();
      },

      regularview: function (_event, target) {
        forceRegularMode = true;
        forceCombatMode = false;
        currentView = target.dataset.view;
        refreshHud();
      },

      combatmode: function () {
        if (!combatModeAvailable()) {
          return ui.notifications.warn(t("Combat.NotAvailable"));
        }

        forceRegularMode = false;
        forceCombatMode = true;
        currentView = "main";
        refreshHud();
      },

      deathmode: function () {
        if (!showDeathSaves()) {
          return ui.notifications.warn(t("Death.NotRequired"));
        }

        forceRegularMode = false;
        forceCombatMode = false;
        currentView = "main";
        refreshHud();
      },

      keepopen: async function (_event, target) {
        await storeKeepOpen(target.checked);

        app.element
          .querySelectorAll('[data-action="keepopen"]')
          .forEach(input => {
            input.checked = keepOpen;
          });
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
      classes: ["ws-rolls-dialog"],

      window: {
        title: dialogTitle(),
        resizable: true
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

    const hookIds = [
      [
        "updateActor",
        Hooks.on("updateActor", updatedActor => {
          if (updatedActor.uuid === actor.uuid) {
            refreshHud();
          }
        })
      ],
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
        }
      },
      { once: true }
    );

    if (currentMode() === "regular") {
      setView(currentView);
    }
  } catch (error) {
    console.error("Rolls HUD | fatal error", error);

    ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
  }
}
