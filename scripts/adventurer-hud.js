import { openRollsHud } from "./rolls-hud.js";
import { registerGmLifecycle } from "./hud/gm-lifecycle.js";
import { MODULE_ID } from "./module-id.js";
import { actorContextChanged } from "./runtime-helpers.js";
import {
  applyHudSettingChange,
  applyHudSettingChanges
} from "./hud/settings-refresh.js";
import {
  getSetting,
  setSetting,
  localizeSettingsRows,
  moveSettingsMenusToBottom,
  registerSettings,
  settingRefreshStrategy,
  SETTINGS
} from "./settings.js";

let selectionTimer = null;
let settingsRefreshTimer = null;

const isDnd5e = () => game.system.id === "dnd5e";

const getOpenApp = () => globalThis.__adventurerHud?.app ?? null;

const toggleHud = () => {
  const app = getOpenApp();

  if (app?.rendered) {
    return app.close();
  }

  return openRollsHud();
};

const scheduleActorRefresh = () => {
  if (!isDnd5e()) return;
  if (globalThis.__adventurerHud?.preset === "gm") return;
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
  if (module) module.api = Object.freeze({ open: openRollsHud });
  if (!isDnd5e()) return;
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
  for (const [name, action] of [
    ["gmPreviousTurn", "gmprevious"],
    ["gmNextTurn", "gmnext"],
    ["gmEndTurn", "endturn"]
  ]) {
    game.keybindings.register(MODULE_ID, name, {
      name: `ADVENTURER_HUD.Keybindings.${name}.Name`,
      hint: "ADVENTURER_HUD.Keybindings.GM.Hint",
      editable: [],
      restricted: true,
      repeat: false,
      onDown: () => {
        const state = globalThis.__adventurerHud;
        if (
          !game.user?.isGM ||
          state?.preset !== "gm" ||
          !state.app?.rendered ||
          !state.app.hudActions?.[action]
        )
          return false;
        void state.app.hudActions[action]();
        return true;
      }
    });
  }
});

Hooks.once("ready", () => {
  if (!isDnd5e()) return;
  registerGmLifecycle({ openHud: openRollsHud });
  const module = game.modules.get(MODULE_ID);

  Hooks.callAll("adventurerHudReady", module?.api);
  if (getSetting(SETTINGS.autoOpenHud) && !getOpenApp()?.rendered) {
    void openRollsHud(game.user.character ?? null);
  }
});

Hooks.on("getSceneControlButtons", controls => {
  if (!isDnd5e()) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools || !getSetting(SETTINGS.showTokenControl)) {
    return;
  }

  const gm = Boolean(game.user?.isGM);
  const name = gm ? "adventurerGmHud" : "adventurerHud";
  tokenControls.tools[name] = {
    name,
    title: getOpenApp()?.rendered
      ? gm
        ? "ADVENTURER_HUD.GM.Controls.Hide"
        : "ADVENTURER_HUD.Controls.Hide"
      : gm
        ? "ADVENTURER_HUD.GM.Controls.Show"
        : "ADVENTURER_HUD.Controls.Show",
    icon: gm ? "fa-solid fa-dragon" : "fa-solid fa-dice-d20",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    active: Boolean(getOpenApp()?.rendered),
    visible: true,
    onChange: async () => {
      if (gm && !getSetting(SETTINGS.gmEnabled))
        await setSetting(SETTINGS.gmEnabled, true);
      await toggleHud();
    }
  };
});

Hooks.on("controlToken", scheduleActorRefresh);
Hooks.on("canvasReady", scheduleActorRefresh);

Hooks.on("renderSettingsConfig", (app, html) => {
  if (!isDnd5e()) return;
  const root = html ?? app.element;
  moveSettingsMenusToBottom(root);
  void localizeSettingsRows(root).catch(error => {
    console.warn("Adventurer HUD | settings translation failed", error);
  });
});

const refreshControls = () =>
  void ui.controls?.render({ force: true, reset: true });
Hooks.on("adventurerHudVisibilityChanged", refreshControls);

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
