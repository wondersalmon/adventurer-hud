import { openRollsHud } from "./rolls-hud.js";
import { MODULE_ID } from "./module-id.js";
import { actorContextChanged } from "./runtime-helpers.js";
import {
  applyHudSettingChange,
  applyHudSettingChanges
} from "./hud/settings-refresh.js";
import {
  getSetting,
  localizeSettingsRows,
  moveSettingsMenusToBottom,
  registerSettings,
  settingRefreshStrategy,
  SETTINGS
} from "./settings.js";
import {
  defineSystemAdapter,
  getSystemAdapter,
  listSystemAdapters,
  registerSystemAdapter
} from "./systems/index.js";

let selectionTimer = null;
let settingsRefreshTimer = null;

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
  const module = game.modules.get(MODULE_ID);
  const systems = Object.freeze({
    define: defineSystemAdapter,
    get: getSystemAdapter,
    list: listSystemAdapters,
    register: registerSystemAdapter
  });

  if (module) {
    module.api = Object.freeze({
      open: openRollsHud,
      systems
    });
  }

  Hooks.callAll("adventurerHudRegisterSystemAdapters", systems);

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

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);

  Hooks.callAll("adventurerHudReady", module?.api);
  if (getSetting(SETTINGS.autoOpenHud) && !getOpenApp()?.rendered) {
    void openRollsHud(game.user.character ?? null);
  }
});

Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools || !getSetting(SETTINGS.showTokenControl)) {
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

Hooks.on("renderSettingsConfig", (app, html) => {
  const root = html ?? app.element;
  moveSettingsMenusToBottom(root);
  void localizeSettingsRows(root).catch(error => {
    console.warn("Adventurer HUD | settings translation failed", error);
  });
});

const refreshControls = () => void ui.controls?.render({ force: true });

const reopenHud = () => {
  clearTimeout(settingsRefreshTimer);
  settingsRefreshTimer = setTimeout(() => {
    settingsRefreshTimer = null;
    const state = globalThis.__adventurerHud;
    if (state?.app?.rendered) void openRollsHud(state.actor ?? null);
  }, 50);
};

Hooks.on("adventurerHudSettingChanged", (key, value) => {
  applyHudSettingChange({
    app: getOpenApp(),
    key,
    value,
    strategy: settingRefreshStrategy(key),
    refreshControls,
    reopen: reopenHud
  });
});

Hooks.on("adventurerHudSettingsChanged", changes => {
  applyHudSettingChanges({
    app: getOpenApp(),
    changes,
    refreshControls,
    reopen: reopenHud,
    strategyFor: settingRefreshStrategy
  });
});
