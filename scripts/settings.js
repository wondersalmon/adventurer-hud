import { MODULE_ID } from "./module-id.js";

export const SETTINGS = Object.freeze({
  adaptiveLayout: "adaptiveLayout",
  automaticCombatMode: "automaticCombatMode",
  autoUpdateActor: "autoUpdateActor",
  keepOpen: "keepOpen",
  hudLayout: "hudLayout",
  fontSize: "fontSize",
  showAbilityChecks: "showAbilityChecks",
  showDeathSaves: "showDeathSaves",
  showInitiative: "showInitiative",
  showItemDetails: "showItemDetails",
  showModeNavigation: "showModeNavigation",
  showCombatResources: "showCombatResources",
  showCombatWeapons: "showCombatWeapons",
  showCombatSpells: "showCombatSpells",
  showCombatActions: "showCombatActions",
  showCombatBonusActions: "showCombatBonusActions",
  showCombatReactions: "showCombatReactions",
  showCombatSpecial: "showCombatSpecial",
  showSavingThrows: "showSavingThrows",
  showShortcuts: "showShortcuts",
  showSkills: "showSkills",
  showSpells: "showSpells",
  showTools: "showTools",
  windowGeometry: "windowGeometry",
  migrationVersion: "migrationVersion"
});

export const SETTING_GROUPS = Object.freeze({
  behavior: Object.freeze([
    SETTINGS.keepOpen,
    SETTINGS.autoUpdateActor,
    SETTINGS.automaticCombatMode
  ]),
  appearance: Object.freeze([SETTINGS.adaptiveLayout, SETTINGS.fontSize]),
  regular: Object.freeze([
    SETTINGS.showAbilityChecks,
    SETTINGS.showSavingThrows,
    SETTINGS.showSkills,
    SETTINGS.showTools,
    SETTINGS.showSpells,
    SETTINGS.showDeathSaves,
    SETTINGS.showShortcuts
  ]),
  combat: Object.freeze([
    SETTINGS.showInitiative,
    SETTINGS.showItemDetails,
    SETTINGS.showCombatResources,
    SETTINGS.showCombatWeapons,
    SETTINGS.showCombatActions,
    SETTINGS.showCombatBonusActions,
    SETTINGS.showCombatReactions,
    SETTINGS.showCombatSpecial
  ]),
  advanced: Object.freeze([SETTINGS.showModeNavigation])
});

let SettingsApplication = null;

const notifyChange = key => value =>
  Hooks.callAll("adventurerHudSettingChanged", key, value);

const registerBoolean = (key, defaultValue = true) => {
  game.settings.register(MODULE_ID, key, {
    name: `ADVENTURER_HUD.Settings.${key}.Name`,
    hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
    scope: "user",
    config: false,
    type: Boolean,
    default: defaultValue,
    onChange: notifyChange(key)
  });
};

const registerChoice = (key, choices, defaultValue) => {
  game.settings.register(MODULE_ID, key, {
    name: `ADVENTURER_HUD.Settings.${key}.Name`,
    hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
    scope: "user",
    config: false,
    type: String,
    choices,
    default: defaultValue,
    onChange: notifyChange(key)
  });
};

export function registerSettings() {
  registerBoolean(SETTINGS.adaptiveLayout, true);
  registerChoice(
    SETTINGS.fontSize,
    {
      small: "ADVENTURER_HUD.Settings.fontSize.Small",
      normal: "ADVENTURER_HUD.Settings.fontSize.Normal",
      large: "ADVENTURER_HUD.Settings.fontSize.Large",
      extraLarge: "ADVENTURER_HUD.Settings.fontSize.ExtraLarge"
    },
    "large"
  );
  registerBoolean(SETTINGS.keepOpen, false);
  registerBoolean(SETTINGS.autoUpdateActor, true);
  registerBoolean(SETTINGS.automaticCombatMode, true);
  registerBoolean(SETTINGS.showInitiative);
  registerBoolean(SETTINGS.showItemDetails);
  registerBoolean(SETTINGS.showModeNavigation, false);
  registerBoolean(SETTINGS.showCombatResources);
  registerBoolean(SETTINGS.showCombatWeapons);
  registerBoolean(SETTINGS.showSpells);
  registerBoolean(SETTINGS.showCombatActions);
  registerBoolean(SETTINGS.showCombatBonusActions);
  registerBoolean(SETTINGS.showCombatReactions);
  registerBoolean(SETTINGS.showCombatSpecial);
  registerBoolean(SETTINGS.showAbilityChecks);
  registerBoolean(SETTINGS.showSavingThrows);
  registerBoolean(SETTINGS.showSkills);
  registerBoolean(SETTINGS.showTools);
  registerBoolean(SETTINGS.showDeathSaves);
  registerBoolean(SETTINGS.showShortcuts);

  game.settings.register(MODULE_ID, SETTINGS.showCombatSpells, {
    name: "Legacy spell visibility",
    hint: "",
    scope: "user",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.windowGeometry, {
    name: "Adventurer HUD window geometry",
    hint: "",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.hudLayout, {
    name: "Adventurer HUD layout",
    hint: "",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.migrationVersion, {
    name: "Adventurer HUD migration version",
    hint: "",
    scope: "user",
    config: false,
    type: Number,
    default: 0
  });

  registerSettingsMenu();
}

function registerSettingsMenu() {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;

  SettingsApplication = class AdventurerHudSettings extends (
    HandlebarsApplicationMixin(ApplicationV2)
  ) {
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-settings",
      tag: "form",
      classes: ["adventurer-hud-settings"],
      window: {
        icon: "fa-solid fa-dice-d20",
        title: "ADVENTURER_HUD.Settings.Open"
      },
      position: { width: 620, height: "auto" },
      form: {
        closeOnSubmit: true,
        handler: this.#onSubmit
      }
    };

    static PARTS = {
      form: {
        template: "modules/adventurer-hud/templates/settings.hbs"
      }
    };

    async _prepareContext() {
      return {
        groups: Object.entries(SETTING_GROUPS).map(([id, keys]) => ({
          id,
          label: game.i18n.localize(`ADVENTURER_HUD.Settings.Groups.${id}`),
          settings: keys.map(key => {
            const definition = game.settings.settings.get(
              `${MODULE_ID}.${key}`
            );
            const value = getSetting(key);
            const choices = definition?.choices
              ? Object.entries(definition.choices).map(
                  ([choiceValue, label]) => ({
                    label: game.i18n.localize(label),
                    selected: choiceValue === value,
                    value: choiceValue
                  })
                )
              : [];

            return {
              choices,
              hint: game.i18n.localize(definition.hint),
              key,
              name: game.i18n.localize(definition.name),
              type: definition.type === Boolean ? "boolean" : "choice",
              value
            };
          })
        }))
      };
    }

    static async #onSubmit(_event, _form, formData) {
      const values = formData.object;
      for (const keys of Object.values(SETTING_GROUPS)) {
        for (const key of keys) {
          const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
          const value =
            definition.type === Boolean ? Boolean(values[key]) : values[key];
          await setSetting(key, value);
        }
      }
    }
  };

  game.settings.registerMenu(MODULE_ID, "configure", {
    name: "ADVENTURER_HUD.Settings.Open",
    hint: "ADVENTURER_HUD.Settings.MenuHint",
    label: "ADVENTURER_HUD.Settings.Open",
    icon: "fa-solid fa-dice-d20",
    type: SettingsApplication,
    restricted: false
  });
}

export function openSettings() {
  return new SettingsApplication().render({ force: true });
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

export async function migrateLegacySettings() {
  const version = getSetting(SETTINGS.migrationVersion);

  if (version >= 3) {
    return;
  }

  if (version < 1) {
    const suffix = [game.world?.id ?? "world", game.user.id].join(":");

    try {
      const rawGeometry = localStorage.getItem(
        `ws-rolls-hud-position:${suffix}`
      );

      if (rawGeometry) {
        await setSetting(SETTINGS.windowGeometry, JSON.parse(rawGeometry));
      }

      const rawKeepOpen = localStorage.getItem(
        `ws-rolls-hud-keep-open:${suffix}`
      );

      if (rawKeepOpen !== null) {
        await setSetting(SETTINGS.keepOpen, rawKeepOpen === "true");
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to migrate legacy settings`, error);
    }
  }

  if (version < 3) {
    await setSetting(
      SETTINGS.showSpells,
      Boolean(getSetting(SETTINGS.showCombatSpells))
    );
  }

  await setSetting(SETTINGS.migrationVersion, 3);
}
