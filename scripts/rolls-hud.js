import { createHudState, resolveHudMode, setRegularView } from "./hud/state.js";
import { createHudActions } from "./hud/actions.js";
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
import { activateHudWindow } from "./hud/window-session.js";
import { createHudApplicationClass } from "./hud/window-controls.js";
import { renderHudMode } from "./render/index.js";
import { findCombatant, tokenForActor } from "./runtime-helpers.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
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
    const fontSize = getSetting(SETTINGS.fontSize) || "medium";

    const readVisibility = () => ({
      abilityChecks: adapter.capabilities.abilityChecks,
      deathSaves:
        adapter.capabilities.deathSaves && getSetting(SETTINGS.showDeathSaves),
      initiative: adapter.capabilities.combat,
      inventory: adapter.capabilities.inventory,
      itemDetails: getSetting(SETTINGS.showItemDetails),
      modeNavigation: getSetting(SETTINGS.showModeNavigation),
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

    const actions = createHudActions({
      actor,
      adapter,
      canRollActor,
      canRollDeathSave,
      changeResource,
      combatModeAvailable,
      currentMode,
      deathModeAvailable,
      getCombatant,
      hudState,
      isCloseAfterRoll: () => closeAfterRoll,
      openHpDialog,
      openResourceDialog,
      performAndRefresh,
      refreshHud,
      resetWindow: async () => {
        app.setPosition({ width: dialogWidth, height: "auto" });
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = app.element.getBoundingClientRect();
        const { left, top } = centeredWindowPosition(rect, {
          width: window.innerWidth,
          height: window.innerHeight
        });
        app.setPosition({ left, top });
        storePosition({ left, top, width: rect.width, height: "auto" });
        await flushWindowGeometry();
      },
      rollAndClose,
      setView,
      storeCloseAfterRoll,
      t,
      togglePin: async () => {
        pinned = !pinned;
        await setSetting(SETTINGS.pinWindow, pinned);
        app.updatePinControl();
      }
    });

    // =========================================================
    // DialogV2
    // =========================================================

    const dialogWidth = Math.min(450, Math.max(320, window.innerWidth - 32));

    const storedPosition = normalizeWindowGeometry(getWindowGeometry(), {
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
      classes: ["ws-rolls-dialog", `ws-font-${String(fontSize).toLowerCase()}`],

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

    await activateHudWindow({
      actor,
      app,
      canRollActor,
      changeResource,
      isCloseAfterRoll: () => closeAfterRoll,
      readVisibility,
      refreshHud,
      refreshScheduler,
      setCloseAfterRoll: value => {
        closeAfterRoll = value;
      },
      setPinned: value => {
        pinned = value;
      },
      state,
      storePosition,
      visibility
    });

    if (currentMode() === "regular") {
      setView(hudState.currentView);
    }
  } catch (error) {
    console.error("Rolls HUD | fatal error", error);

    ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
  }
}
