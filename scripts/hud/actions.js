import { setForcedMode, setRegularView } from "./state.js";
import {
  getSetting,
  openSettings,
  openGmSettings,
  setSetting,
  SETTINGS
} from "../settings.js";
import { usableActivities } from "./quick-access.js";
import {
  deadCreatures,
  createSceneCombat,
  addGmCreatures,
  addSceneCreatures,
  moveToCreature,
  removeDeadCreatures
} from "./gm-scene.js";

export function createHudActions({
  actor,
  adapter,
  canRollActor,
  canStartMutation = () => true,
  canRollDeathSave,
  combatModeAvailable,
  currentMode,
  getCombatState,
  gmController,
  gmCombatantId,
  openGmSelection,
  onGmCombatChange,
  hudState,
  openHpDialog,
  performAndRefresh,
  performSceneAction = performAndRefresh,
  refreshHud,
  savePanelState,
  resetWindow,
  performRoll,
  setView,
  t,
  toggleFavoriteEntry,
  updateSearch,
  visibility,
  togglePin
}) {
  const actions = {
    gmstartcombat: async function () {
      if (
        !gmController?.isGM() ||
        !gmController.getCombat() ||
        gmController.getCombat().started
      )
        return;
      return performSceneAction(async () => {
        await gmController.getCombat().startCombat();
        gmController.resumeFollow();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmcreatecombat: async function () {
      if (!gmController?.isGM()) return;
      return performSceneAction(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (combat) gmController.chooseCombat(combat.id);
        onGmCombatChange();
      });
    },
    gmaddcreatures: async function (_event, target) {
      if (!gmController?.isGM()) return;
      return performSceneAction(async () => {
        const combat = gmController.getCombat() ?? (await createSceneCombat());
        if (!combat) return;
        gmController.chooseCombat(combat.id);
        if (target?.dataset.scope === "all") await addSceneCreatures(combat);
        else await addGmCreatures(combat);
        onGmCombatChange();
      });
    },
    gmendcombat: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performSceneAction(() => gmController.getCombat()?.endCombat());
    },
    gmrollinitiative: async function (_event, target) {
      if (!gmController?.isGM()) return;
      return performAndRefresh(async () => {
        const combat = gmController.getCombat();
        if (!combat) return;
        const entries = gmController
          .roster()
          .filter(
            entry =>
              (target.dataset.scope === "all" || entry.id === gmCombatantId) &&
              (target.dataset.reroll === "true" || entry.initiative == null)
          );
        if (entries.length)
          await combat.rollInitiative(
            entries.map(entry => entry.id),
            { updateTurn: true }
          );
      });
    },
    gmspeeds() {
      hudState.gmSpeedsExpanded = !hudState.gmSpeedsExpanded;
      refreshHud();
    },
    gmlegendary() {
      hudState.gmLegendaryExpanded = !hudState.gmLegendaryExpanded;
      refreshHud();
    },
    initiative: async function (event) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { combat, combatant } = getCombatState();
      if (!combat) {
        return ui.notifications.warn(t("Initiative.NoCombat"));
      }

      if (combatant?.initiative != null) {
        return;
      }

      if (!combatant) {
        return ui.notifications.warn(t("Initiative.NotCombatant"));
      }

      return performRoll(() =>
        adapter.rollInitiative(actor, { combatant, event })
      );
    },

    endturn: async function () {
      if (!getCombatState().canEndTurn) return;
      return performAndRefresh(async () => {
        const { combat, canEndTurn } = getCombatState();
        if (!canEndTurn) return;
        if (!gmController) return combat.nextTurn();
        const next = await gmController.endTurn(gmCombatantId, () =>
          combat.nextTurn()
        );
        if (next && next.id !== gmCombatantId) await openGmSelection();
      });
    },

    gmsettings: () => openGmSettings(),
    gmsheet: () => actor?.sheet?.render({ force: true }),
    gmcenter: () => moveToCreature(gmController?.sync()),
    gmping: () =>
      performSceneAction(() =>
        moveToCreature(gmController?.sync(), { ping: true })
      ),
    gmremove: () =>
      performSceneAction(() =>
        removeDeadCreatures(gmController?.getCombat(), [gmCombatantId])
      ),
    gmremovedead: async function () {
      if (!gmController?.isGM()) return;
      const combat = gmController.getCombat();
      const ids = deadCreatures(combat).map(entry => entry.id);
      if (!ids.length) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("GM.RemoveDead") },
        content: `<p>${foundry.utils.escapeHTML(t("GM.RemoveDeadConfirm"))} (${ids.length})</p>`
      });
      if (confirmed)
        return performSceneAction(async () => {
          const count = await removeDeadCreatures(combat, ids);
          if (!count) ui.notifications.warn(t("GM.NoTokensRemoved"));
        });
    },
    gmselect: async function (_event, target) {
      if (!gmController?.isGM()) return;
      if (await gmController.select(target.dataset.combatantId))
        return openGmSelection();
    },
    gmfollow: async function () {
      if (!gmController?.isGM()) return;
      gmController.resumeFollow();
      await setSetting(
        SETTINGS.gmFollowTurn,
        !getSetting(SETTINGS.gmFollowTurn)
      );
      if (getSetting(SETTINGS.gmFollowTurn)) {
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      } else onGmCombatChange();
    },
    gmprevious: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performAndRefresh(async () => {
        if (!gmController.isGM() || !gmController.getCombat()?.started) return;
        await gmController.getCombat().previousTurn();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },
    gmnext: async function () {
      if (!gmController?.isGM() || !gmController.getCombat()?.started) return;
      return performAndRefresh(async () => {
        if (!gmController.isGM() || !gmController.getCombat()?.started) return;
        await gmController.getCombat().nextTurn();
        gmController.sync({ forceFollow: true });
        await openGmSelection();
      });
    },

    ability: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      const { type, key } = target.dataset;

      return performRoll(() =>
        adapter.rollAbility(actor, { type, key, event })
      );
    },

    skill: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
        adapter.rollSkill(actor, { key: target.dataset.key, event })
      );
    },

    tool: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      return performRoll(() =>
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

      return performRoll(() => adapter.rollDeathSave(actor, { event }));
    },

    normal: function () {
      setForcedMode(hudState, "regular");
      savePanelState?.();
      refreshHud();
    },

    regularview: function (_event, target) {
      setForcedMode(hudState, "regular");
      setRegularView(hudState, target.dataset.view);
      savePanelState?.();
      refreshHud();
    },

    combatmode: function () {
      if (!combatModeAvailable()) {
        return ui.notifications.warn(t("Combat.NotAvailable"));
      }

      setForcedMode(hudState, "combat");
      savePanelState?.();
      refreshHud();
    },

    combatfilter: function (_event, target) {
      hudState.combatCategory =
        hudState.combatCategory === target.dataset.category
          ? null
          : target.dataset.category;
      hudState.actionMenuOpen = false;
      savePanelState?.();
      refreshHud("actions");
    },

    toggleactionmenu: function () {
      hudState.actionMenuOpen = !hudState.actionMenuOpen;
      savePanelState?.();
      refreshHud("actions");
    },

    inventoryfilter: function (_event, target) {
      hudState.inventoryCategory = target.dataset.category;
      savePanelState?.();
      refreshHud();
    },

    spellfilter: function (_event, target) {
      hudState.preparedSpellsOnly = target.dataset.prepared === "true";
      savePanelState?.();
      refreshHud(currentMode() === "combat" ? "actions" : null);
    },

    skillfilter: async function (_event, target) {
      const proficientOnly = target.dataset.proficient === "true";
      if (hudState.proficientSkillsOnly === proficientOnly) return;
      await setSetting(SETTINGS.proficientSkillsOnly, proficientOnly);
      hudState.proficientSkillsOnly = proficientOnly;
      refreshHud();
    },

    toggleabilities: function () {
      const key =
        currentMode() === "combat"
          ? "combatAbilitiesExpanded"
          : "abilitiesExpanded";
      hudState[key] = !hudState[key];
      savePanelState?.();
      refreshHud();
    },

    togglefavorites: function () {
      hudState.favoritesExpanded = !hudState.favoritesExpanded;
      savePanelState?.();
      refreshHud();
    },

    toggleconditions: function () {
      hudState.conditionsExpanded = !hudState.conditionsExpanded;
      savePanelState?.();
      refreshHud();
    },

    edithp: function (event) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }

      if (event.shiftKey) {
        const hp = adapter.combatStats(actor).hp;
        const max = Number(hp.max ?? 0);
        if (max <= 0 || Number(hp.value ?? 0) >= max) return;
        return performAndRefresh(() =>
          adapter.updateHp(actor, {
            damage: Number(hp.value ?? 0) - max,
            temp: Number(hp.temp ?? 0)
          })
        );
      }

      return openHpDialog();
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

      const useState = adapter.itemUseState?.(item);
      if (useState?.blocked) return ui.notifications.warn(t(useState.reason));

      if (
        visibility.activityPicker &&
        !event.shiftKey &&
        usableActivities(adapter, item).length > 1
      ) {
        hudState.openActivityItemId =
          hudState.openActivityItemId === item.id ? null : item.id;
        refreshHud();
        return;
      }

      return performRoll(() => adapter.useItem(item, { event }));
    },

    useactivity: async function (event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const item = actor.items.get(target.dataset.itemId);
      if (!item) return ui.notifications.warn(t("Combat.ItemMissing"));
      const useState = adapter.itemUseState?.(item, target.dataset.activityId);
      if (useState?.blocked) return ui.notifications.warn(t(useState.reason));
      return performRoll(() =>
        adapter.useActivity(item, target.dataset.activityId, { event })
      );
    },

    togglefavorite: function (_event, target) {
      if (!visibility.favorites) return;
      return toggleFavoriteEntry(
        target.dataset.itemId,
        target.dataset.activityId ?? null
      );
    },

    togglespellprepared: function (_event, target) {
      if (!canRollActor) {
        return ui.notifications.warn(t("Warnings.NoPermission"));
      }
      const item = actor.items.get(target.dataset.itemId);
      if (
        item?.type !== "spell" ||
        !adapter.spellPreparation(item)?.canPrepare
      ) {
        return;
      }
      return performAndRefresh(() => adapter.toggleSpellPreparation(item));
    },

    clearsearch: function () {
      updateSearch("");
    },

    openitem: function (event, target) {
      const item = actor.items.get(target.dataset.itemId);

      if (!item) {
        return ui.notifications.warn(t("Combat.ItemMissing"));
      }

      if (event.shiftKey) {
        if (!canStartMutation()) return;
        return adapter.showItemDescription(item, { event });
      }

      return item.sheet.render({ force: true });
    },

    settings: async function () {
      return openSettings();
    },

    togglemodes: async function () {
      return setSetting(
        SETTINGS.showModeNavigation,
        !getSetting(SETTINGS.showModeNavigation)
      );
    },

    togglepin: function () {
      return togglePin();
    },

    resetwindow: function () {
      return resetWindow();
    },

    view: function (_event, target) {
      setView(target.dataset.view);
      savePanelState?.();
    }
  };

  for (const [name, action] of Object.entries(actions)) {
    actions[name] = async function (...args) {
      try {
        if (gmController && !gmController.isGM()) return;
        if (gmController && actor && !name.startsWith("gm")) {
          const selected = gmController.sync();
          if (
            selected?.id !== gmCombatantId ||
            (selected.token.actor ?? selected.actor)?.uuid !== actor?.uuid
          )
            return;
        }
        return await action.apply(this, args);
      } catch (error) {
        console.error(`Rolls HUD | ${name} action`, error);

        ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
      }
    };
  }

  return actions;
}
