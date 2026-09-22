import { MODULE_ID } from "./module-id.js";
import { getSystemAdapter } from "./systems/index.js";

export const SETTINGS = Object.freeze({
  adaptiveLayout: "adaptiveLayout",
  automaticCombatMode: "automaticCombatMode",
  autoUpdateActor: "autoUpdateActor",
  keepOpen: "keepOpen",
  pinWindow: "pinWindow",
  showTokenControl: "showTokenControl",
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
  [SETTINGS.adaptiveLayout]: defineSetting("appearance", {
    placement: "basic",
    refresh: "reopen"
  }),
  [SETTINGS.fontSize]: defineSetting("appearance", {
    choices: FONT_SIZE_CHOICES,
    defaultValue: "medium",
    placement: "basic",
    refresh: "reopen",
    type: String
  }),
  [SETTINGS.keepOpen]: defineSetting("behavior", {
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
    placement: "basic",
    refresh: "controls"
  }),
  [SETTINGS.autoUpdateActor]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.automaticCombatMode]: defineSetting("behavior", {
    placement: "basic"
  }),
  [SETTINGS.showItemDetails]: defineSetting("combat", {
    placement: "basic"
  }),
  [SETTINGS.showDeathSaves]: defineSetting("regular", {
    capability: "deathSaves",
    placement: "basic"
  }),
  [SETTINGS.showShortcuts]: defineSetting("regular"),
  [SETTINGS.showAbilityChecks]: defineSetting("regular", {
    capability: "abilityChecks"
  }),
  [SETTINGS.showSavingThrows]: defineSetting("regular", {
    capability: "savingThrows"
  }),
  [SETTINGS.showSkills]: defineSetting("regular", { capability: "skills" }),
  [SETTINGS.showTools]: defineSetting("regular", { capability: "tools" }),
  [SETTINGS.showSpells]: defineSetting("regular", { capability: "spells" }),
  [SETTINGS.showInventory]: defineSetting("regular", {
    capability: "inventory"
  }),
  [SETTINGS.showInitiative]: defineSetting("combat", {
    capability: "combat"
  }),
  [SETTINGS.showCombatResources]: defineSetting("combat", {
    capability: "resources"
  }),
  [SETTINGS.showCombatStats]: defineSetting("combat", {
    capability: "combat"
  }),
  [SETTINGS.showConditions]: defineSetting("combat", {
    capability: "conditions"
  }),
  [SETTINGS.showCombatWeapons]: defineSetting("combat", {
    capability: "weapons"
  }),
  [SETTINGS.showCombatActions]: defineSetting("combat", {
    capability: "actions"
  }),
  [SETTINGS.showCombatBonusActions]: defineSetting("combat", {
    capability: "bonusActions"
  }),
  [SETTINGS.showCombatReactions]: defineSetting("combat", {
    capability: "reactions"
  }),
  [SETTINGS.showCombatSpecial]: defineSetting("combat", {
    capability: "specialActions"
  }),
  [SETTINGS.showModeNavigation]: defineSetting("advanced", {
    defaultValue: false
  }),
  [SETTINGS.showModeHeadings]: defineSetting("advanced")
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
const ADVANCED_SETTING_GROUPS = groupDefinitions("advanced");
export const SETTING_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(SETTING_DEFINITIONS).map(([key, definition]) => [
      key,
      definition.default
    ])
  )
);

let SettingsApplication = null;
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

  if (version >= 4) {
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

  if (version < 4) {
    const fontSize = getSetting(SETTINGS.fontSize);
    const migratedFontSize = {
      normal: "small",
      large: "medium"
    }[fontSize];

    if (migratedFontSize) {
      await setSetting(SETTINGS.fontSize, migratedFontSize);
    }
  }

  await setSetting(SETTINGS.migrationVersion, 4);
}
