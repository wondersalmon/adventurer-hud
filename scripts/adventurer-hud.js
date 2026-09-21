import { openRollsHud } from "./rolls-hud.js";
import { MODULE_ID } from "./module-id.js";
import { actorContextChanged } from "./runtime-helpers.js";
import {
  getSetting,
  migrateLegacySettings,
  registerSettings,
  SETTINGS
} from "./settings.js";

let selectionTimer = null;

const getOpenApp = () => globalThis.__adventurerHud?.app ?? null;

const toggleHud = () => {
  const app = getOpenApp();

  if (app?.rendered) {
    return app.close();
  }

  return openRollsHud();
};

const scheduleActorRefresh = () => {
  if (!getSetting(SETTINGS.autoUpdateActor) || !getOpenApp()?.rendered) {
    return;
  }

  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    selectionTimer = null;

    const selected = canvas.tokens.controlled;
    if (selected.length > 1) {
      return;
    }

    const actor = selected[0]?.actor ?? game.user.character;
    const tokenUuid = selected[0]?.document?.uuid ?? selected[0]?.uuid ?? null;
    const current = globalThis.__adventurerHud ?? {};

    if (
      actor &&
      actorContextChanged(
        { actorUuid: current.actorUuid, tokenUuid: current.tokenUuid },
        { actorUuid: actor.uuid, tokenUuid }
      )
    ) {
      void openRollsHud(actor);
    }
  }, 50);
};

Hooks.once("init", () => {
  registerSettings();

  game.keybindings.register(MODULE_ID, "openHud", {
    name: "ADVENTURER_HUD.Keybindings.Open.Name",
    hint: "ADVENTURER_HUD.Keybindings.Open.Hint",
    editable: [
      {
        key: "KeyR",
        modifiers: ["SHIFT"]
      }
    ],
    restricted: false,
    onDown: () => {
      void toggleHud();
      return true;
    }
  });
});

Hooks.once("ready", async () => {
  await migrateLegacySettings();

  const module = game.modules.get(MODULE_ID);

  if (module) {
    module.api = Object.freeze({
      open: openRollsHud
    });
  }

  Hooks.callAll("adventurerHudReady", module?.api);
});

Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) {
    return;
  }

  tokenControls.tools.adventurerHud = {
    name: "adventurerHud",
    title: "ADVENTURER_HUD.Controls.Open",
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      void toggleHud();
    }
  };
});

Hooks.on("controlToken", scheduleActorRefresh);
Hooks.on("canvasReady", scheduleActorRefresh);

Hooks.on("adventurerHudSettingChanged", key => {
  const layoutSettings = new Set([
    SETTINGS.adaptiveLayout,
    SETTINGS.fontSize,
    SETTINGS.automaticCombatMode,
    SETTINGS.keepOpen,
    SETTINGS.showAbilityChecks,
    SETTINGS.showDeathSaves,
    SETTINGS.showInitiative,
    SETTINGS.showItemDetails,
    SETTINGS.showModeNavigation,
    SETTINGS.showCombatResources,
    SETTINGS.showCombatWeapons,
    SETTINGS.showCombatSpells,
    SETTINGS.showCombatActions,
    SETTINGS.showCombatBonusActions,
    SETTINGS.showCombatReactions,
    SETTINGS.showCombatSpecial,
    SETTINGS.showSavingThrows,
    SETTINGS.showShortcuts,
    SETTINGS.showSkills,
    SETTINGS.showTools
  ]);

  if (layoutSettings.has(key) && getOpenApp()?.rendered) {
    void openRollsHud();
  }
});
