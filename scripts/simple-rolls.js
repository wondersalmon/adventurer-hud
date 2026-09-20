import { openRollsHud } from "./rolls-hud.js";
import { MODULE_ID } from "./module-id.js";
import {
  getSetting,
  migrateLegacySettings,
  registerSettings,
  SETTINGS
} from "./settings.js";

let selectionTimer = null;

const getOpenApp = () => globalThis.__wsRollsHud?.app ?? null;

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

    if (actor && actor.uuid !== globalThis.__wsRollsHud?.actorUuid) {
      void openRollsHud();
    }
  }, 50);
};

Hooks.once("init", () => {
  registerSettings();

  game.keybindings.register(MODULE_ID, "openHud", {
    name: "SIMPLE_ROLLS.Keybindings.Open.Name",
    hint: "SIMPLE_ROLLS.Keybindings.Open.Hint",
    editable: [
      {
        key: "KeyR",
        modifiers: ["SHIFT"]
      }
    ],
    restricted: false,
    onDown: () => {
      void openRollsHud();
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

  Hooks.callAll("simpleRollsReady", module?.api);
});

Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) {
    return;
  }

  tokenControls.tools.simpleRolls = {
    name: "simpleRolls",
    title: "SIMPLE_ROLLS.Controls.Open",
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      const app = getOpenApp();

      if (app?.rendered) {
        void app.close();
      } else {
        void openRollsHud();
      }
    }
  };
});

Hooks.on("controlToken", scheduleActorRefresh);
Hooks.on("canvasReady", scheduleActorRefresh);

Hooks.on("simpleRollsSettingChanged", key => {
  const layoutSettings = new Set([
    SETTINGS.automaticCombatMode,
    SETTINGS.showAbilityChecks,
    SETTINGS.showDeathSaves,
    SETTINGS.showInitiative,
    SETTINGS.showSavingThrows,
    SETTINGS.showShortcuts,
    SETTINGS.showSkills,
    SETTINGS.showTools
  ]);

  if (layoutSettings.has(key) && getOpenApp()?.rendered) {
    void openRollsHud();
  }
});
