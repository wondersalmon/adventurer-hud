import { openRollsHud } from "./rolls-hud.js";
import { MODULE_ID } from "./module-id.js";
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

    if (actor && actor.uuid !== globalThis.__adventurerHud?.actorUuid) {
      void openRollsHud();
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
    SETTINGS.automaticCombatMode,
    SETTINGS.keepOpen,
    SETTINGS.showAbilityChecks,
    SETTINGS.showDeathSaves,
    SETTINGS.showInitiative,
    SETTINGS.showItemDetails,
    SETTINGS.showSavingThrows,
    SETTINGS.showShortcuts,
    SETTINGS.showSkills,
    SETTINGS.showTools
  ]);

  if (layoutSettings.has(key) && getOpenApp()?.rendered) {
    void openRollsHud();
  }
});
