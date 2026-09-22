import { MODULE_ID } from "./module-id.js";
import { getSystemAdapter } from "./systems/index.js";

export const SETTINGS = Object.freeze({
  adaptiveLayout: "adaptiveLayout",
  automaticCombatMode: "automaticCombatMode",
  autoUpdateActor: "autoUpdateActor",
  keepOpen: "keepOpen",
  fontSize: "fontSize",
  showAbilityChecks: "showAbilityChecks",
  showDeathSaves: "showDeathSaves",
  showInitiative: "showInitiative",
  showInventory: "showInventory",
  showItemDetails: "showItemDetails",
  showModeNavigation: "showModeNavigation",
  showModeHeadings: "showModeHeadings",
  showCombatResources: "showCombatResources",
  showCombatStats: "showCombatStats",
  showCombatWeapons: "showCombatWeapons",
  showConditions: "showConditions",
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
    SETTINGS.showInventory,
    SETTINGS.showDeathSaves,
    SETTINGS.showShortcuts
  ]),
  combat: Object.freeze([
    SETTINGS.showInitiative,
    SETTINGS.showItemDetails,
    SETTINGS.showCombatResources,
    SETTINGS.showCombatStats,
    SETTINGS.showConditions,
    SETTINGS.showCombatWeapons,
    SETTINGS.showCombatActions,
    SETTINGS.showCombatBonusActions,
    SETTINGS.showCombatReactions,
    SETTINGS.showCombatSpecial
  ]),
  advanced: Object.freeze([
    SETTINGS.showModeNavigation,
    SETTINGS.showModeHeadings
  ])
});

export const BASIC_SETTINGS = Object.freeze([
  SETTINGS.adaptiveLayout,
  SETTINGS.fontSize,
  SETTINGS.keepOpen,
  SETTINGS.autoUpdateActor,
  SETTINGS.automaticCombatMode,
  SETTINGS.showItemDetails,
  SETTINGS.showDeathSaves
]);

const ADVANCED_SETTING_GROUPS = Object.freeze({
  behavior: Object.freeze([SETTINGS.showShortcuts]),
  regular: Object.freeze([
    SETTINGS.showAbilityChecks,
    SETTINGS.showSavingThrows,
    SETTINGS.showSkills,
    SETTINGS.showTools,
    SETTINGS.showSpells,
    SETTINGS.showInventory
  ]),
  combat: Object.freeze([
    SETTINGS.showInitiative,
    SETTINGS.showCombatResources,
    SETTINGS.showCombatStats,
    SETTINGS.showConditions,
    SETTINGS.showCombatWeapons,
    SETTINGS.showCombatActions,
    SETTINGS.showCombatBonusActions,
    SETTINGS.showCombatReactions,
    SETTINGS.showCombatSpecial
  ]),
  advanced: Object.freeze([
    SETTINGS.showModeNavigation,
    SETTINGS.showModeHeadings
  ])
});

export const SETTING_DEFAULTS = Object.freeze({
  [SETTINGS.adaptiveLayout]: true,
  [SETTINGS.fontSize]: "large",
  [SETTINGS.keepOpen]: false,
  [SETTINGS.autoUpdateActor]: false,
  [SETTINGS.automaticCombatMode]: true,
  [SETTINGS.showInitiative]: true,
  [SETTINGS.showItemDetails]: true,
  [SETTINGS.showModeNavigation]: false,
  [SETTINGS.showModeHeadings]: true,
  [SETTINGS.showCombatResources]: true,
  [SETTINGS.showCombatStats]: true,
  [SETTINGS.showConditions]: true,
  [SETTINGS.showCombatWeapons]: true,
  [SETTINGS.showSpells]: true,
  [SETTINGS.showInventory]: true,
  [SETTINGS.showCombatActions]: true,
  [SETTINGS.showCombatBonusActions]: true,
  [SETTINGS.showCombatReactions]: true,
  [SETTINGS.showCombatSpecial]: true,
  [SETTINGS.showAbilityChecks]: true,
  [SETTINGS.showSavingThrows]: true,
  [SETTINGS.showSkills]: true,
  [SETTINGS.showTools]: true,
  [SETTINGS.showDeathSaves]: true,
  [SETTINGS.showShortcuts]: true
});

let SettingsApplication = null;
let ResetSettingsApplication = null;

const notifyChange = key => value =>
  Hooks.callAll("adventurerHudSettingChanged", key, value);

const SETTING_CAPABILITIES = Object.freeze({
  [SETTINGS.showAbilityChecks]: "abilityChecks",
  [SETTINGS.showCombatActions]: "actions",
  [SETTINGS.showCombatBonusActions]: "bonusActions",
  [SETTINGS.showCombatReactions]: "reactions",
  [SETTINGS.showCombatResources]: "resources",
  [SETTINGS.showCombatSpecial]: "specialActions",
  [SETTINGS.showCombatStats]: "combat",
  [SETTINGS.showCombatWeapons]: "weapons",
  [SETTINGS.showConditions]: "conditions",
  [SETTINGS.showDeathSaves]: "deathSaves",
  [SETTINGS.showInitiative]: "combat",
  [SETTINGS.showInventory]: "inventory",
  [SETTINGS.showSavingThrows]: "savingThrows",
  [SETTINGS.showSkills]: "skills",
  [SETTINGS.showSpells]: "spells",
  [SETTINGS.showTools]: "tools"
});

export function isSettingSupported(key, systemId = game.system?.id) {
  const capability = SETTING_CAPABILITIES[key];
  if (!capability) return true;
  return Boolean(getSystemAdapter(systemId)?.capabilities?.[capability]);
}

const registerBoolean = (key, defaultValue = true) => {
  game.settings.register(MODULE_ID, key, {
    name: `ADVENTURER_HUD.Settings.${key}.Name`,
    hint: `ADVENTURER_HUD.Settings.${key}.Hint`,
    scope: "user",
    config: BASIC_SETTINGS.includes(key) && isSettingSupported(key),
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
    config: BASIC_SETTINGS.includes(key) && isSettingSupported(key),
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
  registerBoolean(SETTINGS.autoUpdateActor, false);
  registerBoolean(SETTINGS.automaticCombatMode, true);
  registerBoolean(SETTINGS.showInitiative);
  registerBoolean(SETTINGS.showItemDetails);
  registerBoolean(SETTINGS.showModeNavigation, false);
  registerBoolean(SETTINGS.showModeHeadings);
  registerBoolean(SETTINGS.showCombatResources);
  registerBoolean(SETTINGS.showCombatStats);
  registerBoolean(SETTINGS.showConditions);
  registerBoolean(SETTINGS.showCombatWeapons);
  registerBoolean(SETTINGS.showSpells);
  registerBoolean(SETTINGS.showInventory);
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
      const groups = Object.entries(ADVANCED_SETTING_GROUPS)
        .map(([id, keys]) => ({
          id,
          label: game.i18n.localize(`ADVENTURER_HUD.Settings.Groups.${id}`),
          settings: keys
            .filter(key => isSettingSupported(key))
            .map(key => {
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
        .filter(group => group.settings.length);

      return { groups };
    }

    static async #onSubmit(_event, _form, formData) {
      const values = formData.object;
      for (const keys of Object.values(ADVANCED_SETTING_GROUPS)) {
        for (const key of keys.filter(key => isSettingSupported(key))) {
          const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
          const value =
            definition.type === Boolean ? Boolean(values[key]) : values[key];
          await setSetting(key, value);
        }
      }
    }
  };

  game.settings.registerMenu(MODULE_ID, "configure", {
    name: "ADVENTURER_HUD.Settings.Advanced.Name",
    hint: "ADVENTURER_HUD.Settings.Advanced.Hint",
    label: "ADVENTURER_HUD.Settings.Advanced.Label",
    icon: "fa-solid fa-dice-d20",
    type: SettingsApplication,
    restricted: false
  });

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

export function moveSettingsMenusToBottom(root) {
  const element = root?.querySelector ? root : root?.[0];
  if (!element) {
    return;
  }

  const rows = ["configure", "reset"]
    .map(key => {
      const settingId = `${MODULE_ID}.${key}`;
      const control = element.querySelector(
        `[data-key="${settingId}"], [data-setting-id="${settingId}"], [name="${settingId}"]`
      );
      return control?.closest?.(".form-group") ?? null;
    })
    .filter(Boolean);

  if (rows.length !== 2 || rows[0].parentElement !== rows[1].parentElement) {
    return;
  }

  const container = rows[0].parentElement;
  rows.forEach(row => container.append(row));
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
