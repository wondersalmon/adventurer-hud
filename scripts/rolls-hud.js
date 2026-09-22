import {
  createHudState,
  resolveHudMode,
  setForcedMode,
  setRegularView
} from "./hud/state.js";
import { createCombatRenderer } from "./hud/combat.js";
import { createHudComponents } from "./hud/components.js";
import { createDeathRenderer } from "./hud/death-saves.js";
import { createRegularRenderer } from "./hud/regular.js";
import { renderHudMode } from "./render/index.js";
import { findCombatant, tokenForActor } from "./runtime-helpers.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
  openSettings,
  saveWindowGeometry,
  setSetting,
  SETTINGS
} from "./settings.js";
import { getSystemAdapter } from "./systems/index.js";

export async function openRollsHud(actorOverride = null) {
  try {
    // =========================================================
    // System
    // =========================================================

    const adapter = getSystemAdapter(game.system.id);
    if (!adapter) {
      throw new Error(
        game.i18n.format("ADVENTURER_HUD.Errors.UnsupportedSystem", {
          system: game.system.title ?? game.system.id
        })
      );
    }

    const { DialogV2 } = foundry.applications.api;

    const state = (globalThis.__adventurerHud ??= {});
    state.app ??= null;
    state.actor ??= null;
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
        candidate => adapter.isActorSupported(candidate) && candidate.isOwner
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

    if (!adapter.isActorSupported(actor)) {
      return ui.notifications.warn(
        tf("Warnings.UnsupportedActor", { actor: actor.name })
      );
    }

    if (state.app?.rendered) {
      await flushWindowGeometry();
      await state.app.close();
    }

    state.actorUuid = actor.uuid;
    state.actor = actor;
    state.tokenUuid = token?.document?.uuid ?? token?.uuid ?? null;

    const canRollActor = actor.isOwner;
    const adaptiveLayout = Boolean(getSetting(SETTINGS.adaptiveLayout));
    const fontSize = getSetting(SETTINGS.fontSize) || "medium";

    const visibility = {
      abilityChecks:
        adapter.capabilities.abilityChecks &&
        getSetting(SETTINGS.showAbilityChecks),
      deathSaves:
        adapter.capabilities.deathSaves && getSetting(SETTINGS.showDeathSaves),
      initiative: getSetting(SETTINGS.showInitiative),
      inventory:
        adapter.capabilities.inventory && getSetting(SETTINGS.showInventory),
      itemDetails: getSetting(SETTINGS.showItemDetails),
      modeNavigation: getSetting(SETTINGS.showModeNavigation),
      modeHeadings: getSetting(SETTINGS.showModeHeadings),
      combatResources:
        adapter.capabilities.resources &&
        getSetting(SETTINGS.showCombatResources),
      combatStats: getSetting(SETTINGS.showCombatStats),
      combatWeapons:
        adapter.capabilities.weapons && getSetting(SETTINGS.showCombatWeapons),
      conditions:
        adapter.capabilities.conditions && getSetting(SETTINGS.showConditions),
      combatSpells:
        adapter.capabilities.spells && getSetting(SETTINGS.showSpells),
      combatActions:
        adapter.capabilities.actions && getSetting(SETTINGS.showCombatActions),
      combatBonusActions:
        adapter.capabilities.bonusActions &&
        getSetting(SETTINGS.showCombatBonusActions),
      combatReactions:
        adapter.capabilities.reactions &&
        getSetting(SETTINGS.showCombatReactions),
      combatSpecial:
        adapter.capabilities.specialActions &&
        getSetting(SETTINGS.showCombatSpecial),
      savingThrows:
        adapter.capabilities.savingThrows &&
        getSetting(SETTINGS.showSavingThrows),
      shortcuts: getSetting(SETTINGS.showShortcuts),
      skills: adapter.capabilities.skills && getSetting(SETTINGS.showSkills),
      tools: adapter.capabilities.tools && getSetting(SETTINGS.showTools)
    };

    const abilities = adapter.abilityDefinitions();
    const skills = adapter.capabilities.skills
      ? adapter.skillDefinitions({
          localize: value => game.i18n.localize(value)
        })
      : [];

    // =========================================================
    // Helpers
    // =========================================================

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
    let pinned = Boolean(getSetting(SETTINGS.pinWindow));

    const storeKeepOpen = async value => {
      keepOpen = Boolean(value);
      await setSetting(SETTINGS.keepOpen, keepOpen);
    };

    const hudState = createHudState();

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
      return adapter.saveProficiency(actor, id);
    };

    const skillProf = id => adapter.skillProficiency(actor, id);

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

    const deathData = () => adapter.deathData(actor);

    const showDeathSaves = () =>
      visibility.deathSaves &&
      adapter.capabilities.deathSaves &&
      adapter.isActorSupported(actor) &&
      deathData().hp <= 0;

    const deathModeAvailable = () =>
      visibility.deathSaves &&
      adapter.capabilities.deathSaves &&
      adapter.isActorSupported(actor);

    const canRollDeathSave = () => {
      const { failure, hp, success } = deathData();
      return hp <= 0 && failure < 3 && success < 3;
    };

    const isActiveCombatant = () =>
      Boolean(game.combat?.started && getCombatant());

    const combatModeAvailable = () =>
      adapter.capabilities.combat && adapter.isActorSupported(actor);

    const currentMode = () =>
      resolveHudMode({
        automaticCombatMode: getSetting(SETTINGS.automaticCombatMode),
        combatAvailable: combatModeAvailable(),
        deathActive: showDeathSaves(),
        deathAvailable: deathModeAvailable(),
        forcedMode: hudState.forcedMode,
        isActiveCombatant: isActiveCombatant()
      });

    // =========================================================
    // Tools
    // =========================================================

    const tools = adapter.capabilities.tools
      ? await adapter.getTools(actor, {
          cache: state.toolNames,
          localize: value => game.i18n.localize(value),
          resolveUuid: fromUuid
        })
      : [];

    const normalTools = tools.filter(tool => !tool.isMusic);

    const instruments = tools.filter(tool => tool.isMusic);

    const components = createHudComponents({
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
    });

    const combatRenderer = createCombatRenderer({
      actor,
      adapter,
      canRollActor,
      DialogV2,
      escapeHTML,
      formatMod,
      getCombatant,
      hudState,
      ...components,
      t,
      tf,
      visibility
    });

    const regularRenderer = createRegularRenderer({
      hudState,
      instruments,
      normalTools,
      ...components,
      ...combatRenderer,
      t,
      tools,
      visibility
    });

    const deathRenderer = createDeathRenderer({
      canRollActor,
      canRollDeathSave,
      deathData,
      ...components,
      t
    });

    const {
      changeResource,
      combatActions,
      combatHTML,
      combatStatuses,
      openHpDialog,
      openResourceDialog
    } = combatRenderer;
    const { normalHTML } = regularRenderer;
    const { deathHTML } = deathRenderer;

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
        body: renderHudMode(currentMode(), {
          combat: combatHTML,
          death: deathHTML,
          regular: normalHTML
        })
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
      const previousView = hudState.currentView;
      if (!setRegularView(hudState, view)) {
        return;
      }

      if (previousView !== hudState.currentView && app?.rendered) {
        refreshHud();
        return;
      }

      app.element
        .querySelectorAll(".ws-view")
        .forEach(element => element.classList.add("ws-hidden"));

      app.element.querySelector(`#ws-${view}`)?.classList.remove("ws-hidden");
    };

    const refreshHud = (region = null) => {
      if (!app?.rendered) {
        return;
      }

      const shell = app.element.querySelector(".ws-shell");

      if (!shell) {
        return;
      }

      if (!showDeathSaves() && !combatModeAvailable()) {
        hudState.forcedMode = null;
      }

      const mode = currentMode();

      if (mode === "combat" && region === "conditions") {
        const current = shell.querySelector(".ws-combat-statuses");
        const template = document.createElement("template");
        template.innerHTML = combatStatuses();
        const next = template.content.firstElementChild;

        if (current && next) {
          current.replaceWith(next);
          return;
        }

        if (current && !next) {
          current.remove();
          return;
        }
      }

      if (mode === "combat" && region === "actions") {
        const current = shell.querySelector(".ws-combat-actions");
        if (current) {
          const template = document.createElement("template");
          template.innerHTML = combatActions();
          current.replaceWith(template.content.firstElementChild);
          return;
        }
      }

      shell.innerHTML = renderHudMode(mode, {
        combat: combatHTML,
        death: deathHTML,
        regular: normalHTML
      });

      const windowTitle = app.element.querySelector(".window-title");

      if (windowTitle) {
        windowTitle.textContent = dialogTitle();
      }

      if (mode === "regular") {
        setView(hudState.currentView);
      } else {
        hudState.currentView = "main";
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
          adapter.rollInitiative(actor, { combatant, event })
        );
      },

      ability: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const { type, key } = target.dataset;

        return rollAndClose(() =>
          adapter.rollAbility(actor, { type, key, event })
        );
      },

      skill: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return rollAndClose(() =>
          adapter.rollSkill(actor, { key: target.dataset.key, event })
        );
      },

      tool: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return rollAndClose(() =>
          adapter.rollTool(actor, { key: target.dataset.key, event })
        );
      },

      death: async function (event) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        if (!canRollDeathSave()) {
          return ui.notifications.warn(t("Death.NotRequired"));
        }

        return rollAndClose(() => adapter.rollDeathSave(actor, { event }));
      },

      normal: function () {
        setForcedMode(hudState, "regular");
        refreshHud();
      },

      regularview: function (_event, target) {
        setForcedMode(hudState, "regular");
        setRegularView(hudState, target.dataset.view);
        refreshHud();
      },

      combatmode: function () {
        if (!combatModeAvailable()) {
          return ui.notifications.warn(t("Combat.NotAvailable"));
        }

        setForcedMode(hudState, "combat");
        refreshHud();
      },

      combatfilter: function (_event, target) {
        hudState.combatCategory = target.dataset.category;
        refreshHud("actions");
      },

      inventoryfilter: function (_event, target) {
        hudState.inventoryCategory = target.dataset.category;
        refreshHud();
      },

      spellfilter: function (_event, target) {
        hudState.preparedSpellsOnly = target.dataset.prepared === "true";
        refreshHud(currentMode() === "combat" ? "actions" : null);
      },

      togglesaves: function () {
        hudState.savingThrowsExpanded = !hudState.savingThrowsExpanded;
        refreshHud();
      },

      togglecombatsaves: function () {
        hudState.combatSavingThrowsExpanded =
          !hudState.combatSavingThrowsExpanded;
        refreshHud();
      },

      togglechecks: function () {
        hudState.abilityChecksExpanded = !hudState.abilityChecksExpanded;
        refreshHud();
      },

      toggleresources: function () {
        hudState.resourcesExpanded = !hudState.resourcesExpanded;
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

        return performAndRefresh(() => adapter.toggleInspiration(actor));
      },

      shortrest: function () {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return performAndRefresh(() => adapter.shortRest(actor));
      },

      longrest: function () {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        return performAndRefresh(() => adapter.longRest(actor));
      },

      useitem: async function (event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const item = actor.items.get(target.dataset.itemId);

        if (!item) {
          return ui.notifications.warn(t("Combat.ItemMissing"));
        }

        return rollAndClose(() => adapter.useItem(item, { event }));
      },

      openitem: function (_event, target) {
        const item = actor.items.get(target.dataset.itemId);

        if (!item) {
          return ui.notifications.warn(t("Combat.ItemMissing"));
        }

        return item.sheet.render({ force: true });
      },

      openresource: async function (event, target) {
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

        if (event.shiftKey) {
          return changeResource({
            amount: 1,
            direction: "consume",
            item,
            resourceId
          });
        }

        return openResourceDialog({ item, resourceId });
      },

      removestatus: async function (_event, target) {
        if (!canRollActor) {
          return ui.notifications.warn(t("Warnings.NoPermission"));
        }

        const statusId = target.dataset.statusId;
        const effectId = target.dataset.effectId;

        if (effectId) {
          await actor.effects.get(effectId)?.delete();
        } else if (actor.statuses?.has(statusId)) {
          await actor.toggleStatusEffect(statusId, { active: false });
        }
        refreshHud();
      },

      settings: async function () {
        return openSettings();
      },

      deathmode: function () {
        if (!deathModeAvailable()) {
          return ui.notifications.warn(t("Combat.NotAvailable"));
        }

        setForcedMode(hudState, "death");
        refreshHud();
      },

      togglekeepopen: async function () {
        await storeKeepOpen(!keepOpen);
        ui.notifications.info(
          t(keepOpen ? "Window.KeepOpenEnabled" : "Window.KeepOpenDisabled")
        );
      },

      togglepin: async function () {
        pinned = !pinned;
        await setSetting(SETTINGS.pinWindow, pinned);
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

    class AdventurerHudDialog extends DialogV2 {
      async close(options = {}) {
        if (pinned && options.closeKey) {
          return this;
        }

        return super.close(options);
      }
    }

    const app = new AdventurerHudDialog({
      classes: [
        "ws-rolls-dialog",
        adaptiveLayout ? "ws-adaptive" : "ws-fixed",
        `ws-font-${String(fontSize).toLowerCase()}`
      ],

      window: {
        title: dialogTitle(),
        resizable: true,
        controls: [
          {
            icon: pinned
              ? "fa-solid fa-thumbtack"
              : "fa-solid fa-thumbtack-slash",
            label: t(pinned ? "Window.Unpin" : "Window.Pin"),
            action: "togglepin"
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
          label: t("Window.Close")
        }
      ]
    });

    await app.render({
      force: true
    });

    state.app = app;

    app.element.addEventListener("contextmenu", event => {
      const target = event.target.closest?.(".ws-resource-link");

      if (!target || !event.shiftKey || !canRollActor) {
        return;
      }

      event.preventDefault();
      const item = target.dataset.itemId
        ? actor.items.get(target.dataset.itemId)
        : null;

      void changeResource({
        amount: 1,
        direction: "restore",
        item,
        resourceId: target.dataset.resourceId
      }).catch(error => {
        console.error("Rolls HUD | quick resource restore", error);
        ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
      });
    });

    app.addEventListener("position", () => storePosition(app.position));

    const refreshActorEffect = effect => {
      if (effect?.parent?.uuid === actor.uuid) {
        refreshHud("conditions");
      }
    };

    const refreshActorItem = item => {
      if (item?.parent?.uuid === actor.uuid) {
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
      ["createItem", Hooks.on("createItem", refreshActorItem)],
      ["updateItem", Hooks.on("updateItem", refreshActorItem)],
      ["deleteItem", Hooks.on("deleteItem", refreshActorItem)],
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
          state.actor = null;
          state.actorUuid = null;
          state.tokenUuid = null;
        }
      },
      { once: true }
    );

    if (currentMode() === "regular") {
      setView(hudState.currentView);
    }
  } catch (error) {
    console.error("Rolls HUD | fatal error", error);

    ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
  }
}
