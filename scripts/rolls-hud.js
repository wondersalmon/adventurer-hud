import {
  createHudState,
  resolveHudMode,
  setRegularView,
  syncHudPreferences
} from "./hud/state.js";
import { createHudActions } from "./hud/actions.js";
import { selectHudActor } from "./hud/actor-selection.js";
import { createHudActorContext } from "./hud/actor-context.js";
import { createLatestRefresh } from "./hud/async-refresh.js";
import {
  createGmCombatController,
  renderGmCombatHeader,
  renderGmRemovalButton,
  renderGmTurnControls
} from "./hud/gm-combat.js";
import { createCombatRenderer } from "./hud/combat.js";
import { createItemPanelRenderer } from "./hud/item-panels.js";
import { createHpDialogController } from "./hud/hp-dialog.js";
import { createHudComponents } from "./hud/components.js";
import { syncHealthAppearance as syncHealthAppearanceClass } from "./hud/health-feedback.js";
import {
  centeredWindowPosition,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "./hud/geometry.js";
import { createRefreshScheduler, refreshHudView } from "./hud/refresh.js";
import { createHudRollRunner } from "./hud/roll-runner.js";
import { createHudToolState } from "./hud/tool-state.js";
import {
  favoriteEntries,
  toggleFavorite,
  queueFavoriteChange
} from "./dnd5e/favorites.js";
import { panelStateForActor, panelStateSnapshot } from "./hud/panel-state.js";
import { createModuleTranslator } from "./localization.js";
import { createRegularRenderer } from "./hud/regular.js";
import { activateHudWindow } from "./hud/window-session.js";
import { createHudApplicationClass } from "./hud/window-controls.js";
import { readHudVisibility } from "./hud/visibility.js";
import { renderHudMode } from "./render/index.js";
import { getCurrentCombat } from "./runtime-helpers.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
  saveWindowGeometry,
  setSetting,
  SETTINGS
} from "./settings.js";
import { dnd5eAdapter } from "./dnd5e/index.js";
import { createTaskQueue } from "./task-queue.js";
import { actorActionCooldown } from "./hud/action-cooldown.js";

const queueOpening = createTaskQueue();

export function openRollsHud(actorOverride = null) {
  return queueOpening(() => openHud(actorOverride));
}

async function openHud(actorOverride) {
  try {
    if (game.system.id !== "dnd5e")
      throw new Error(
        game.i18n.localize("ADVENTURER_HUD.Errors.UnsupportedSystem")
      );
    // =========================================================
    // System
    // =========================================================

    const { language, t, tf } = await createModuleTranslator({
      language: getSetting(SETTINGS.language),
      i18n: game.i18n
    });
    const adapter = dnd5eAdapter;

    const { DialogV2 } = foundry.applications.api;

    const state = (globalThis.__adventurerHud ??= {});
    state.app ??= null;
    state.actor ??= null;
    state.position ??= null;
    const gmActive = Boolean(game.user?.isGM && getSetting(SETTINGS.gmEnabled));
    state.gm ??= {};
    const gmController = gmActive
      ? createGmCombatController({ memory: state.gm })
      : null;
    let previousGmFollow = gmActive ? getSetting(SETTINGS.gmFollowTurn) : false;
    const gmCombatant = gmController?.sync({
      selectedToken:
        canvas.tokens.controlled.length === 1
          ? canvas.tokens.controlled[0]
          : null
    });
    if (!gmActive && state.preset === "gm") {
      if (actorOverride?.type === "npc") actorOverride = null;
      await state.app?.close();
      state.preset = "player";
    }

    // =========================================================
    // Actor
    // =========================================================

    const selection = gmActive
      ? gmCombatant
        ? {
            actor: gmCombatant.token.actor ?? gmCombatant.actor,
            token: gmCombatant.token
          }
        : null
      : await selectHudActor({
          actorOverride,
          adapter,
          DialogV2,
          language,
          onSelect: selectedActor => openRollsHud(selectedActor),
          t,
          tf
        });
    if (!selection) {
      if (gmActive)
        return await openEmptyGmHud({ state, gmController, DialogV2, t, tf });
      return;
    }
    const reusedApp =
      gmActive && state.preset === "gm" && state.app?.rendered
        ? state.app
        : null;
    const session = {};
    const isSessionCurrent = () => state.session === session;
    const actorContext = createHudActorContext({
      ...selection,
      combatantId: gmCombatant?.id,
      getCombat: () =>
        gmController ? gmController.getCombat() : getCurrentCombat(game)
    });
    const { actor, getCombatState } = actorContext;
    if (state.app?.rendered && !reusedApp) {
      await flushWindowGeometry();
      await state.app.close();
    }

    state.session = session;
    state.actorUuid = actorContext.actorUuid;
    state.actor = actor;
    state.tokenUuid = actorContext.tokenUuid;
    state.preset = gmActive ? "gm" : "player";

    const canRollActor = actor.isOwner;
    const canStartMutation = actorActionCooldown(actor);
    const fontSize = getSetting(SETTINGS.fontSize) || "medium";

    const readVisibility = () => ({
      ...readHudVisibility(),
      ...(gmActive
        ? {
            modeNavigation: false,
            favorites: false,
            combatSkills: false,
            gm: true,
            attackDetails: getSetting(SETTINGS.gmShowAttackDetails)
          }
        : {})
    });
    const visibility = readVisibility();

    const abilities = adapter.abilityDefinitions();
    const skills = adapter.skillDefinitions({
      localize: value => game.i18n.localize(value),
      actor
    });

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

    let pinned = Boolean(getSetting(SETTINGS.pinWindow));

    const hudState = createHudState({
      ...panelStateForActor(
        getSetting(SETTINGS.panelStates),
        gmActive ? `gm:${actorContext.tokenUuid}` : actor.uuid
      ),
      proficientSkillsOnly: getSetting(SETTINGS.proficientSkillsOnly),
      favoriteEntries: favoriteEntries(actor),
      statusDescriptions: await adapter.statusDescriptions(actor)
    });

    let panelStateWrite = Promise.resolve();
    const savePanelState = () => {
      const snapshot = panelStateSnapshot(hudState);
      panelStateWrite = panelStateWrite
        .catch(() => {})
        .then(() =>
          setSetting(SETTINGS.panelStates, {
            ...(getSetting(SETTINGS.panelStates) ?? {}),
            [gmActive ? `gm:${actorContext.tokenUuid}` : actor.uuid]: snapshot
          })
        );
      void panelStateWrite.catch(error => {
        console.warn("Adventurer HUD | panel state save failed", error);
      });
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
      return adapter.saveProficiency(actor, id);
    };

    const skillProf = id => adapter.skillProficiency(actor, id);

    // =========================================================
    // Death saves
    // =========================================================

    const deathData = () => adapter.deathData(actor);

    const canRollDeathSave = () => {
      const { dead, failure, hp, stable, success } = deathData();
      return (
        actor.type === "character" &&
        hp <= 0 &&
        !dead &&
        !stable &&
        failure < 3 &&
        success < 3
      );
    };

    const combatModeAvailable = () =>
      adapter.isActorSupported(actor, { gm: gmActive });

    const currentMode = () =>
      gmActive
        ? "combat"
        : resolveHudMode({
            combatAvailable: combatModeAvailable(),
            forcedMode: hudState.forcedMode,
            isActiveCombatant: getCombatState().isActive
          });

    // =========================================================
    // Tools
    // =========================================================

    const { toolState, refreshTools } = await createHudToolState({
      actor,
      adapter,
      isRendered: () => app?.rendered && isSessionCurrent(),
      scheduleRefresh: () => refreshScheduler.schedule()
    });

    const components = createHudComponents({
      portrait: gmCombatant?.token?.texture?.src,
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

    const itemPanels = createItemPanelRenderer({
      skills,
      actor,
      adapter,
      escapeHTML,
      hudState,
      skillsHTML: components.skillsHTML,
      skillFilterHTML: components.skillFilterHTML,
      spellFilterHTML: components.spellFilterHTML,
      t,
      tf,
      visibility
    });
    const { openHpDialog } = createHpDialogController({
      actor,
      adapter,
      canStartMutation,
      DialogV2,
      t
    });
    const combatRenderer = createCombatRenderer({
      actor,
      adapter,
      canRollActor,
      canRollDeathSave,
      deathData,
      escapeHTML,
      formatMod,
      getCombatState,
      gmCombatant,
      gmHeader: gmActive
        ? () =>
            renderGmCombatHeader({
              controller: gmController,
              selectedId: gmCombatant.id,
              showRemoval: false,
              adapter,
              escapeHTML,
              t,
              tf
            })
        : null,
      hudState,
      ...components,
      combatActions: itemPanels.combatActions,
      gmSpecialActions: itemPanels.gmSpecialActions,
      gmTurnControls: () => renderGmTurnControls(gmController.getCombat(), t),
      gmRemovalButton: () => renderGmRemovalButton(gmController.roster(), t),
      favoriteSection: itemPanels.favoriteSection,
      t,
      visibility
    });

    const regularRenderer = createRegularRenderer({
      hudState,
      toolState,
      ...components,
      ...itemPanels,
      combatInitiative: combatRenderer.combatInitiative,
      healthPanel: combatRenderer.healthPanel,
      t,
      visibility
    });

    const { combatHTML } = combatRenderer;
    const { combatActions } = itemPanels;
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
        adapter.combatStats(actor).hp,
        true
      );

    const refreshHud = (region = null) => {
      if (!isSessionCurrent()) return;
      hudState.favoriteEntries = favoriteEntries(actor);
      if (!visibility.modeNavigation || !combatModeAvailable()) {
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
    let gmOpenRequest = null;
    const reopenGmSelection = () =>
      (gmOpenRequest ??= openRollsHud().finally(() => {
        gmOpenRequest = null;
      }));
    const onGmCombatChange = ({ follow = true } = {}) => {
      if (!gmController || !app?.rendered || !isSessionCurrent()) return;
      if (!game.user?.isGM) {
        void app.close();
        return;
      }
      const next = gmController.sync({
        follow: follow && canvas.tokens.controlled.length <= 1
      });
      if (
        !next ||
        next.id !== gmCombatant.id ||
        (next.token.actor ?? next.actor) !== actor ||
        next.token.uuid !== actorContext.tokenUuid
      ) {
        void reopenGmSelection();
      } else refreshScheduler.schedule();
    };
    const refreshStatuses = createLatestRefresh({
      load: () => adapter.statusDescriptions(actor),
      isCurrent: () => app?.rendered && isSessionCurrent(),
      apply: descriptions => {
        hudState.statusDescriptions = descriptions;
        refreshScheduler.schedule();
      },
      onError: error => {
        console.warn("Adventurer HUD | status refresh failed", error);
      }
    });
    const { performRoll, performAndRefresh } = createHudRollRunner({
      canStartMutation,
      getApp: () => app,
      refreshHud,
      refreshScheduler
    });
    const { performAndRefresh: performSceneAction } = createHudRollRunner({
      disabledActions: ["gmremove", "gmremovedead", "gmping"],
      getApp: () => (isSessionCurrent() ? app : null),
      refreshHud,
      refreshScheduler
    });

    const updateSearch = query => {
      hudState.searchQuery = query;
      refreshHud(currentMode() === "combat" ? "actions" : null);
      const input = app.element.querySelector('[data-action="searchitems"]');
      input?.focus();
      input?.setSelectionRange?.(query.length, query.length);
    };

    const toggleFavoriteEntry = (itemId, activityId) =>
      queueFavoriteChange(actor, async () => {
        await toggleFavorite(actor, itemId, activityId);
        refreshHud();
      });

    // =========================================================
    // ApplicationV2 actions
    // =========================================================

    const actions = createHudActions({
      actor,
      adapter,
      canStartMutation,
      canRollActor,
      canRollDeathSave,
      combatModeAvailable,
      currentMode,
      getCombatState,
      gmController,
      gmCombatantId: gmCombatant?.id,
      openGmSelection: reopenGmSelection,
      onGmCombatChange,
      hudState,
      openHpDialog,
      performAndRefresh,
      performSceneAction,
      refreshHud,
      savePanelState,
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
      performRoll,
      setView,
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

    const dialogWidth = Math.min(
      gmActive ? 360 : 450,
      Math.max(320, window.innerWidth - 32)
    );

    const storedPosition = normalizeWindowGeometry(getWindowGeometry(), {
      defaultWidth: dialogWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    });

    const AdventurerHudDialog = createHudApplicationClass({
      DialogV2,
      document,
      getPinLabel: value => t(value ? "Window.Unpin" : "Window.Pin"),
      isPinned: () => state.app?.hudPinState?.() ?? pinned
    });

    let app = reusedApp;
    const actionRoutes = Object.fromEntries(
      Object.keys(actions).map(key => [
        key,
        function (...args) {
          return app.hudActions?.[key]?.apply(app, args);
        }
      ])
    );
    app ??= new AdventurerHudDialog({
      classes: ["ws-rolls-dialog", `ws-font-${String(fontSize).toLowerCase()}`],

      window: {
        title: dialogTitle(),
        resizable: true,
        controls: [
          ...(game.user?.isGM
            ? [
                {
                  icon: "fa-solid fa-dragon",
                  label: t("Settings.GM.Name"),
                  action: "gmsettings"
                }
              ]
            : []),
          ...(!gmActive
            ? [
                {
                  icon: "fa-solid fa-arrows-left-right",
                  label: t("Window.ToggleModeNavigation"),
                  action: "togglemodes"
                }
              ]
            : []),
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

      actions: actionRoutes,

      buttons: [
        {
          action: "close",
          label: t("Window.Close")
        }
      ]
    });

    app.hudActions = actions;
    app.hudPinState = () => pinned;
    await activateHudWindow({
      fontSize,
      reuse: Boolean(reusedApp),
      content,
      title: dialogTitle(),
      actor,
      app,
      visualEffectsEnabled: getSetting(SETTINGS.showVisualEffects),
      isCurrentCombatant: actorContext.isCurrentCombatant,
      isPlayersTurn: () => getCombatState().isTurn,
      readVisibility,
      syncPreferences: () => {
        syncHudPreferences(hudState, {
          modeNavigation: visibility.modeNavigation,
          proficientSkillsOnly: getSetting(SETTINGS.proficientSkillsOnly)
        });
        if (gmController) {
          const following = getSetting(SETTINGS.gmFollowTurn);
          if (following && !previousGmFollow) {
            gmController.resumeFollow();
            onGmCombatChange();
          }
          previousGmFollow = following;
        }
      },
      onSearchInput: query => updateSearch(query),
      readHp: () => {
        const hp = adapter.combatStats(actor).hp;
        return {
          value: Number(hp.value ?? 0),
          temp: Number(hp.temp ?? 0),
          max: Number(hp.max ?? 0)
        };
      },
      refreshHud,
      refreshScheduler,
      onToolsChange: refreshTools,
      onStatusChange: refreshStatuses,
      onCombatChange: gmActive ? onGmCombatChange : null,
      onCombatSelection: gmActive
        ? async id => {
            if (gmController.chooseCombat(id)) await openRollsHud();
          }
        : null,
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

async function openEmptyGmHud({ state, gmController, DialogV2, t, tf }) {
  if (!game.user?.isGM) return;
  const reusedApp =
    state.preset === "gm" && state.app?.rendered ? state.app : null;
  if (state.app?.rendered && !reusedApp) await state.app.close();
  const session = {};
  state.session = session;
  state.actor = state.actorUuid = state.tokenUuid = null;
  state.preset = "gm";
  const escapeHTML = value => foundry.utils.escapeHTML(String(value ?? ""));
  const body = () =>
    `<div class="ws-view ws-combat-view">${renderGmCombatHeader({ controller: gmController, selectedId: null, adapter: dnd5eAdapter, escapeHTML, t, tf })}</div>`;
  const content = document.createElement("div");
  content.innerHTML = `<div class="ws-shell">${body()}</div>`;
  const width = Math.min(360, Math.max(320, window.innerWidth - 32));
  let pinned = Boolean(getSetting(SETTINGS.pinWindow));
  const refreshHud = () => {
    if (app?.rendered && state.session === session)
      app.element.querySelector(".ws-shell").innerHTML = body();
  };
  const refreshScheduler = createRefreshScheduler(refreshHud);
  let opening = null;
  const onCombatChange = () => {
    if (!app?.rendered || state.session !== session) return;
    if (!game.user?.isGM) {
      void app.close();
      return;
    }
    if (gmController.sync())
      void (opening ??= openRollsHud().finally(() => {
        opening = null;
      }));
    else refreshScheduler.schedule();
  };
  const { performAndRefresh } = createHudRollRunner({
    getApp: () => app,
    refreshHud,
    refreshScheduler
  });
  const actions = createHudActions({
    gmController,
    canRollActor: false,
    t,
    onGmCombatChange: onCombatChange,
    openGmSelection: () => openRollsHud(),
    performAndRefresh,
    togglePin: async () => {
      pinned = !pinned;
      await setSetting(SETTINGS.pinWindow, pinned);
      app.updatePinControl();
    }
  });
  const Hud = createHudApplicationClass({
    DialogV2,
    document,
    getPinLabel: value => t(value ? "Window.Unpin" : "Window.Pin"),
    isPinned: () => state.app?.hudPinState?.() ?? pinned
  });
  let app = reusedApp;
  const actionRoutes = Object.fromEntries(
    Object.keys(actions).map(key => [
      key,
      (...args) => app.hudActions?.[key]?.apply(app, args)
    ])
  );
  app ??= new Hud({
    classes: [
      "ws-rolls-dialog",
      `ws-font-${String(getSetting(SETTINGS.fontSize)).toLowerCase()}`
    ],
    window: {
      title: t("GM.Title"),
      resizable: true,
      controls: [
        {
          icon: "fa-solid fa-dragon",
          label: t("Settings.GM.Name"),
          action: "gmsettings"
        }
      ]
    },
    position: {
      width,
      height: "auto",
      ...normalizeWindowGeometry(getWindowGeometry(), {
        defaultWidth: width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      })
    },
    content,
    actions: actionRoutes,
    buttons: [{ action: "close", label: t("Window.Close") }]
  });
  app.hudActions = actions;
  app.hudPinState = () => pinned;
  await activateHudWindow({
    fontSize: getSetting(SETTINGS.fontSize) || "medium",
    reuse: Boolean(reusedApp),
    content,
    title: t("GM.Title"),
    actor: null,
    app,
    state,
    refreshHud,
    refreshScheduler,
    visualEffectsEnabled: getSetting(SETTINGS.showVisualEffects),
    readVisibility: readHudVisibility,
    visibility: readHudVisibility(),
    setPinned: value => {
      pinned = value;
    },
    storePosition: position =>
      saveWindowGeometry(storedWindowGeometry(position)),
    onSearchInput: () => {},
    onCombatChange,
    onCombatSelection: async id => {
      if (gmController.chooseCombat(id)) await openRollsHud();
    }
  });
}
