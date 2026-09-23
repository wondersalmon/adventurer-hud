import { createHudState, resolveHudMode, setRegularView } from "./hud/state.js";
import { createHudActions } from "./hud/actions.js";
import { openActorPicker } from "./hud/actor-picker.js";
import { createCombatRenderer } from "./hud/combat.js";
import { createHudComponents } from "./hud/components.js";
import { syncHealthAppearance as syncHealthAppearanceClass } from "./hud/health-feedback.js";
import {
  centeredWindowPosition,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "./hud/geometry.js";
import { createRefreshScheduler, refreshHudView } from "./hud/refresh.js";
import { favoriteEntriesForActor, toggleFavorite } from "./hud/quick-access.js";
import { createModuleTranslator } from "./localization.js";
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

    const { language, t, tf } = await createModuleTranslator({
      language: getSetting(SETTINGS.language),
      i18n: game.i18n
    });
    const adapter = getSystemAdapter(game.system.id);
    if (!adapter) {
      throw new Error(
        tf("Errors.UnsupportedSystem", {
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
        lang: language,
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
      initiative: adapter.capabilities.combat,
      inventory: adapter.capabilities.inventory,
      itemDetails: getSetting(SETTINGS.showItemDetails),
      showActionTypes: getSetting(SETTINGS.showActionTypes),
      modeNavigation: getSetting(SETTINGS.showModeNavigation),
      search: getSetting(SETTINGS.showSearch),
      activityPicker:
        adapter.capabilities.activityChoice &&
        getSetting(SETTINGS.showActivityPicker),
      favorites: getSetting(SETTINGS.showFavorites),
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

    const hudState = createHudState({
      proficientSkillsOnly: getSetting(SETTINGS.proficientSkillsOnly),
      favoriteEntries: favoriteEntriesForActor(
        getSetting(SETTINGS.favoriteEntries),
        actor.uuid
      )
    });

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

    const canRollDeathSave = () => {
      const { dead, failure, hp, stable, success } = deathData();
      return hp <= 0 && !dead && !stable && failure < 3 && success < 3;
    };

    const isActiveCombatant = () =>
      Boolean(game.combat?.started && getCombatant());

    const combatModeAvailable = () =>
      adapter.capabilities.combat && adapter.isActorSupported(actor);

    const currentMode = () =>
      resolveHudMode({
        combatAvailable: combatModeAvailable(),
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
      canRollDeathSave,
      deathData,
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

    const {
      changeResource,
      combatActions,
      combatHTML,
      openHpDialog,
      openResourceDialog
    } = combatRenderer;
    const { availableViews, normalHTML } = regularRenderer;

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
          regular: normalHTML
        })
      }
    );

    // =========================================================
    // Dialog state
    // =========================================================

    const dialogTitle = () =>
      currentMode() === "combat"
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
            '[data-action="useactivity"]',
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

    const syncHealthAppearance = () =>
      syncHealthAppearanceClass(
        app?.element,
        adapter.capabilities.combat ? adapter.combatStats(actor).hp : null,
        adapter.capabilities.combat
      );

    const refreshHud = (region = null) => {
      if (!combatModeAvailable()) {
        hudState.forcedMode = null;
      }
      syncHealthAppearance();
      refreshHudView({
        app,
        availableViews,
        hudState,
        mode: currentMode(),
        region,
        renderers: {
          actions: combatActions,
          combat: combatHTML,
          regular: normalHTML
        },
        setView,
        title: dialogTitle()
      });
    };

    const refreshScheduler = createRefreshScheduler(refreshHud);

    const updateSearch = query => {
      hudState.searchQuery = query;
      refreshHud(currentMode() === "combat" ? "actions" : null);
      const input = app.element.querySelector('[data-action="searchitems"]');
      input?.focus();
      input?.setSelectionRange?.(query.length, query.length);
    };

    const toggleFavoriteEntry = async (itemId, activityId) => {
      const next = toggleFavorite(hudState.favoriteEntries, itemId, activityId);
      const stored = getSetting(SETTINGS.favoriteEntries) ?? {};
      await setSetting(SETTINGS.favoriteEntries, {
        ...stored,
        [actor.uuid]: next
      });
      hudState.favoriteEntries = next;
      refreshHud();
    };

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
      toggleFavoriteEntry,
      updateSearch,
      visibility,
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
      visualEffectsEnabled: getSetting(SETTINGS.showVisualEffects),
      isCurrentCombatant: combatant => {
        const tokenId = token?.document?.id ?? token?.id;
        return (
          Boolean(combatant?.tokenId) &&
          getCombatant()?.id === combatant?.id &&
          (!tokenId || combatant?.tokenId === tokenId)
        );
      },
      readVisibility,
      syncPreferences: () => {
        hudState.proficientSkillsOnly = getSetting(
          SETTINGS.proficientSkillsOnly
        );
      },
      onSearchInput: query => updateSearch(query),
      readHp: adapter.capabilities.combat
        ? () => {
            const hp = adapter.combatStats(actor).hp;
            return {
              value: Number(hp.value ?? 0),
              temp: Number(hp.temp ?? 0),
              max: Number(hp.max ?? 0)
            };
          }
        : null,
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

    syncHealthAppearance();

    if (currentMode() === "regular") {
      setView(hudState.currentView);
    }
  } catch (error) {
    console.error("Rolls HUD | fatal error", error);

    ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
  }
}
