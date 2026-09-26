export const SETTINGS = Object.freeze({
  autoOpenHud: "autoOpenHud",
  autoUpdateActor: "autoUpdateActor",
  pinWindow: "pinWindow",
  showTokenControl: "showTokenControl",
  fontSize: "fontSize",
  language: "language",
  showVisualEffects: "showVisualEffects",
  showItemDetails: "showItemDetails",
  showActionTypes: "showActionTypes",
  showCombatSkills: "showCombatSkills",
  showModeNavigation: "showModeNavigation",
  showSearch: "showSearch",
  showActivityPicker: "showActivityPicker",
  showFavorites: "showFavorites",
  repairBackup: "repairBackup",
  panelStates: "panelStates",
  proficientSkillsOnly: "proficientSkillsOnly",
  windowGeometry: "windowGeometry"
});

const FONT_SIZE_CHOICES = Object.freeze({
  small: "ADVENTURER_HUD.Settings.fontSize.Small",
  medium: "ADVENTURER_HUD.Settings.fontSize.Medium",
  large: "ADVENTURER_HUD.Settings.fontSize.Large",
  extraLarge: "ADVENTURER_HUD.Settings.fontSize.ExtraLarge"
});

const LANGUAGE_CHOICES = Object.freeze({
  auto: "ADVENTURER_HUD.Settings.language.Auto",
  en: "English",
  ru: "Русский"
});

const defineSetting = (
  group,
  {
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
    ...(choices ? { choices } : {})
  });

export const SETTING_DEFINITIONS = Object.freeze({
  [SETTINGS.language]: defineSetting("appearance", {
    choices: LANGUAGE_CHOICES,
    defaultValue: "auto",
    placement: "basic",
    refresh: "reopen",
    type: String
  }),
  [SETTINGS.fontSize]: defineSetting("appearance", {
    choices: FONT_SIZE_CHOICES,
    defaultValue: "medium",
    placement: "basic",
    refresh: "reopen",
    type: String
  }),
  [SETTINGS.showVisualEffects]: defineSetting("interface", {
    refresh: "runtime"
  }),
  [SETTINGS.pinWindow]: defineSetting("interface", {
    defaultValue: false,
    placement: "internal",
    refresh: "runtime"
  }),
  [SETTINGS.showTokenControl]: defineSetting("interface", {
    defaultValue: false,
    refresh: "controls"
  }),
  [SETTINGS.autoOpenHud]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.autoUpdateActor]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.showActivityPicker]: defineSetting("itemUse"),
  [SETTINGS.showItemDetails]: defineSetting("itemUse"),
  [SETTINGS.showActionTypes]: defineSetting("itemUse"),
  [SETTINGS.showCombatSkills]: defineSetting("quickAccess"),
  [SETTINGS.showModeNavigation]: defineSetting("interface", {
    defaultValue: false
  }),
  [SETTINGS.showSearch]: defineSetting("quickAccess"),
  [SETTINGS.showFavorites]: defineSetting("quickAccess")
});

export const getSettingDefinitions = () => SETTING_DEFINITIONS;

const definitionsBy = (definitions, predicate) =>
  Object.entries(definitions)
    .filter(([, definition]) => predicate(definition))
    .map(([key]) => key);

export const getAdvancedSettingGroups = () =>
  Object.freeze(
    Object.fromEntries(
      ["behavior", "appearance", "quickAccess", "itemUse", "interface"]
        .map(group => [
          group,
          Object.freeze(
            definitionsBy(
              getSettingDefinitions(),
              definition =>
                definition.group === group &&
                definition.placement === "advanced"
            )
          )
        ])
        .filter(([, keys]) => keys.length)
    )
  );

export const SETTING_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(SETTING_DEFINITIONS).map(([key, definition]) => [
      key,
      definition.default
    ])
  )
);

export const getSettingDefaults = () =>
  Object.fromEntries(
    Object.entries(getSettingDefinitions()).map(([key, definition]) => [
      key,
      definition.default
    ])
  );
