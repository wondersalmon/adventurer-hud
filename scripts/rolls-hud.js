import {
  createHudState,
  resolveHudMode,
  setForcedMode,
  setRegularView
} from "./hud/state.js";
import { openActorPicker } from "./hud/actor-picker.js";
import { createCombatRenderer } from "./hud/combat.js";
import { createHudComponents } from "./hud/components.js";
import { createDeathRenderer } from "./hud/death-saves.js";
import {
  centeredWindowPosition,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "./hud/geometry.js";
import { createRefreshScheduler } from "./hud/refresh.js";
import { createRegularRenderer } from "./hud/regular.js";
import { subscribeHudDocuments } from "./hud/subscriptions.js";
import { createHudApplicationClass } from "./hud/window-controls.js";
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

      return openActorPicker({
        actors: availableActors,
        DialogV2,
        document,
        escapeHTML: foundry.utils.escapeHTML,
        lang: game.i18n.lang,
        onSelect: selectedActor => openRollsHud(selectedActor),
        t,
        viewportWidth: window.innerWidth
      });
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

    const readVisibility = () => ({
      abilityChecks: adapter.capabilities.abilityChecks,
      deathSaves:
        adapter.capabilities.deathSaves && getSetting(SETTINGS.showDeathSaves),
      initiative: adapter.capabilities.combat,
      inventory: adapter.capabilities.inventory,
      itemDetails: getSetting(SETTINGS.showItemDetails),
      modeNavigation: getSetting(SETTINGS.showModeNavigation),
      modeHeadings: getSetting(SETTINGS.showModeHeadings),
      combatResources: adapter.capabilities.resources,
      combatStats: adapter.capabilities.combat,
      combatWeapons: adapter.capabilities.weapons,
      conditions: adapter.capabilities.conditions,
      combatSpells: adapter.capabilities.spells,
      combatActions: adapter.capabilities.actions,
      combatBonusActions: adapter.capabilities.bonusActions,
      combatReactions: adapter.capabilities.reactions,
      combatSpecial: adapter.capabilities.specialActions,
      savingThrows: adapter.capabilities.savingThrows,
      shortcuts: true,
      skills: adapter.capabilities.skills,
      tools: adapter.capabilities.tools
    });
    const visibility = readVisibility();

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

    const storePosition = position => {
      const geometry = storedWindowGeometry(position);
      if (!geometry) return;

      state.position = geometry;
      saveWindowGeometry(state.position);
    };

    let closeAfterRoll = Boolean(getSetting(SETTINGS.closeAfterRoll));
    let pinned = Boolean(getSetting(SETTINGS.pinWindow));

    const storeCloseAfterRoll = async value => {
      closeAfterRoll = Boolean(value);
      await setSetting(SETTINGS.closeAfterRoll, closeAfterRoll);
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

        if (result && closeAfterRoll) {
          await app.close();
        }

        return result;
      } finally {
        rollPending = false;

        if (app?.rendered) {
          refreshScheduler.cancel();
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
        refreshScheduler.cancel();
        if (app?.rendered) refreshHud();
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

      if (mode === "regular") {
        const visibleViews = {
          inventory: visibility.inventory,
          skills: visibility.skills,
          spells: visibility.combatSpells,
          tools: visibility.tools
        };
        if (
          hudState.currentView !== "main" &&
          !visibleViews[hudState.currentView]
        ) {
          setRegularView(hudState, "main");
        }
      }

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

    const refreshScheduler = createRefreshScheduler(refreshHud);

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

      togglecombatchecks: function () {
        hudState.combatAbilityChecksExpanded =
          !hudState.combatAbilityChecksExpanded;
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

        return performAndRefresh(async () => {
          if (effectId) {
            await actor.effects.get(effectId)?.delete();
          } else if (actor.statuses?.has(statusId)) {
            await actor.toggleStatusEffect(statusId, { active: false });
          }
        });
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

      togglecloseafterroll: async function () {
        await storeCloseAfterRoll(!closeAfterRoll);
        ui.notifications.info(
          t(
            closeAfterRoll
              ? "Window.CloseAfterRollEnabled"
              : "Window.CloseAfterRollDisabled"
          )
        );
      },

      togglepin: async function () {
        pinned = !pinned;
        await setSetting(SETTINGS.pinWindow, pinned);
        app.updatePinControl();
      },

      resetwindow: async function () {
        app.setPosition({
          width: dialogWidth,
          height: "auto"
        });

        await new Promise(resolve => requestAnimationFrame(resolve));

        const rect = app.element.getBoundingClientRect();

        const { left, top } = centeredWindowPosition(rect, {
          width: window.innerWidth,
          height: window.innerHeight
        });

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

    const storedPosition = normalizeWindowGeometry(getWindowGeometry(), {
      adaptiveLayout,
      defaultWidth: dialogWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    });

    const AdventurerHudDialog = createHudApplicationClass({
      DialogV2,
      document,
      getPinLabel: value => t(value ? "Window.Unpin" : "Window.Pin"),
      isPinned: () => pinned
    });

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
            icon: closeAfterRoll
              ? "fa-solid fa-toggle-on"
              : "fa-solid fa-toggle-off",
            label: t("Window.CloseAfterRollMenu"),
            action: "togglecloseafterroll"
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

    app.applySetting = (key, value) => {
      if (key === SETTINGS.closeAfterRoll) {
        closeAfterRoll = Boolean(value);
        const control = app.options?.window?.controls?.find(
          entry => entry.action === "togglecloseafterroll"
        );
        if (control) {
          control.icon = closeAfterRoll
            ? "fa-solid fa-toggle-on"
            : "fa-solid fa-toggle-off";
        }
      }
      if (key === SETTINGS.pinWindow) {
        pinned = Boolean(value);
        app.updatePinControl();
      }
    };

    app.refreshFromSettings = () => {
      Object.assign(visibility, readVisibility());
      refreshHud();
    };

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

    const unsubscribeDocuments = subscribeHudDocuments({
      actor,
      hooks: Hooks,
      scheduleRefresh: refreshScheduler.schedule
    });

    app.addEventListener(
      "close",
      () => {
        void flushWindowGeometry();

        refreshScheduler.cancel();
        unsubscribeDocuments();

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
