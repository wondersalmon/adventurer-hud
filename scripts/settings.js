import { MODULE_ID } from "./module-id.js";
import { getSystemAdapter } from "./systems/index.js";

export const SETTINGS = Object.freeze({
  autoUpdateActor: "autoUpdateActor",
  closeAfterRoll: "closeAfterRoll",
  pinWindow: "pinWindow",
  showTokenControl: "showTokenControl",
  fontSize: "fontSize",
  showDeathSaves: "showDeathSaves",
  showItemDetails: "showItemDetails",
  showModeNavigation: "showModeNavigation",
  windowGeometry: "windowGeometry"
});

const FONT_SIZE_CHOICES = Object.freeze({
  small: "ADVENTURER_HUD.Settings.fontSize.Small",
  medium: "ADVENTURER_HUD.Settings.fontSize.Medium",
  large: "ADVENTURER_HUD.Settings.fontSize.Large",
  extraLarge: "ADVENTURER_HUD.Settings.fontSize.ExtraLarge"
});

const defineSetting = (
  group,
  {
    capability,
    choices,
    defaultValue = true,
    placement = "advanced",
    refresh = "content",
    type = Boolean
  } = {}
) =>
  Object.freeze({
    group,
    placement,
    refresh,
    type,
    default: defaultValue,
    ...(capability ? { capability } : {}),
    ...(choices ? { choices } : {})
  });

export const SETTING_DEFINITIONS = Object.freeze({
  [SETTINGS.fontSize]: defineSetting("appearance", {
    choices: FONT_SIZE_CHOICES,
    defaultValue: "medium",
    placement: "basic",
    refresh: "reopen",
    type: String
  }),
  [SETTINGS.closeAfterRoll]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "runtime"
  }),
  [SETTINGS.pinWindow]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "runtime"
  }),
  [SETTINGS.showTokenControl]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "controls"
  }),
  [SETTINGS.autoUpdateActor]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.showItemDetails]: defineSetting("combat", {
    placement: "basic"
  }),
  [SETTINGS.showDeathSaves]: defineSetting("regular", {
    capability: "deathSaves",
    placement: "basic"
  }),
  [SETTINGS.showModeNavigation]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic"
  })
});

const definitionsBy = predicate =>
  Object.entries(SETTING_DEFINITIONS)
    .filter(([, definition]) => predicate(definition))
    .map(([key]) => key);

const groupDefinitions = placement =>
  Object.freeze(
    Object.fromEntries(
      ["behavior", "appearance", "regular", "combat", "advanced"]
        .map(group => [
          group,
          Object.freeze(
            definitionsBy(
              definition =>
                definition.group === group &&
                (!placement || definition.placement === placement)
            )
          )
        ])
        .filter(([, keys]) => keys.length)
    )
  );

export const SETTING_GROUPS = groupDefinitions();
export const BASIC_SETTINGS = Object.freeze(
  definitionsBy(definition => definition.placement === "basic")
);
export const SETTING_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(SETTING_DEFINITIONS).map(([key, definition]) => [
      key,
      definition.default
    ])
  )
);

let ResetSettingsApplication = null;

const notifyChange = key => value =>
  Hooks.callAll("adventurerHudSettingChanged", key, value);

export function isSettingSupported(key, systemId = game.system?.id) {
  const capability = SETTING_DEFINITIONS[key]?.capability;
  if (!capability) return true;
  return Boolean(getSystemAdapter(systemId)?.capabilities?.[capability]);
}

export const settingRefreshStrategy = key =>
  SETTING_DEFINITIONS[key]?.refresh ?? "none";

export function registerSettings() {
  for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
    game.settings.register(MODULE_ID, key, {
      name: `ADVENTURER_HUD.Settings.${key}.Name`,
      hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
      scope: "user",
      config: definition.placement === "basic" && isSettingSupported(key),
      type: definition.type,
      ...(definition.choices ? { choices: definition.choices } : {}),
      default: definition.default,
      onChange: notifyChange(key)
    });
  }

  game.settings.register(MODULE_ID, SETTINGS.windowGeometry, {
    name: "Adventurer HUD window geometry",
    hint: "",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  registerResetSettingsMenu();
}

function registerResetSettingsMenu() {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;

  ResetSettingsApplication = class AdventurerHudResetSettings extends (
    HandlebarsApplicationMixin(ApplicationV2)
  ) {
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-reset-settings",
      tag: "form",
      window: {
        icon: "fa-solid fa-arrow-rotate-left",
        title: "ADVENTURER_HUD.Settings.Reset.Name"
      },
      position: { width: 420, height: "auto" },
      form: {
        closeOnSubmit: true,
        handler: this.#onSubmit
      }
    };

    static PARTS = {
      form: {
        template: "modules/adventurer-hud/templates/reset-settings.hbs"
      }
    };

    static async #onSubmit() {
      await resetSettings();
      ui.notifications.info(
        game.i18n.localize("ADVENTURER_HUD.Settings.Reset.Done")
      );
    }
  };

  game.settings.registerMenu(MODULE_ID, "reset", {
    name: "ADVENTURER_HUD.Settings.Reset.Name",
    hint: "ADVENTURER_HUD.Settings.Reset.Hint",
    label: "ADVENTURER_HUD.Settings.Reset.Label",
    icon: "fa-solid fa-arrow-rotate-left",
    type: ResetSettingsApplication,
    restricted: false
  });
}

export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({ force: true });

  const category = sheet.element?.querySelector(
    `[data-category="${MODULE_ID}"], [data-tab="${MODULE_ID}"]`
  );
  if (category) {
    category.click();
  } else {
    sheet.search?.(game.i18n.localize("ADVENTURER_HUD.Title"));
  }
  return sheet;
}

export function moveResetSettingsMenuToBottom(root) {
  const element = root?.querySelector ? root : root?.[0];
  if (!element) {
    return;
  }

  const settingId = `${MODULE_ID}.reset`;
  const control = element.querySelector(
    `[data-key="${settingId}"], [data-setting-id="${settingId}"], [name="${settingId}"]`
  );
  const row = control?.closest?.(".form-group");
  row?.parentElement?.append(row);
}

export async function resetSettings() {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await setSetting(key, value);
  }
}

export const getSetting = key => game.settings.get(MODULE_ID, key);

export const setSetting = (key, value) =>
  game.settings.set(MODULE_ID, key, value);

export const getWindowGeometry = () =>
  getSetting(SETTINGS.windowGeometry) ?? {};

let geometryTimer = null;
let pendingGeometry = null;

export function saveWindowGeometry(geometry, { immediate = false } = {}) {
  pendingGeometry = geometry;

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  if (immediate) {
    const value = pendingGeometry;
    pendingGeometry = null;
    return setSetting(SETTINGS.windowGeometry, value);
  }

  geometryTimer = setTimeout(() => {
    geometryTimer = null;
    const value = pendingGeometry;
    pendingGeometry = null;
    void setSetting(SETTINGS.windowGeometry, value);
  }, 150);
}

export async function flushWindowGeometry() {
  if (!pendingGeometry) {
    return;
  }

  if (geometryTimer) {
    clearTimeout(geometryTimer);
    geometryTimer = null;
  }

  const value = pendingGeometry;
  pendingGeometry = null;
  await setSetting(SETTINGS.windowGeometry, value);
}
