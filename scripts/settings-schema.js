export const SETTINGS = Object.freeze({
  autoOpenHud: "autoOpenHud",
  hudClosed: "hudClosed",
  autoUpdateActor: "autoUpdateActor",
  pinWindow: "pinWindow",
  gmPinWindow: "gmPinWindow",
  closeOnEscape: "closeOnEscape",
  gmWindowGeometry: "gmWindowGeometry",
  showTokenControl: "showTokenControl",
  fontSize: "fontSize",
  language: "language",
  theme: "theme",
  showVisualEffects: "showVisualEffects",
  showItemDetails: "showItemDetails",
  showActionTypes: "showActionTypes",
  showCombatSkills: "showCombatSkills",
  showModeNavigation: "showModeNavigation",
  showShortcuts: "showShortcuts",
  showSearch: "showSearch",
  showActivityPicker: "showActivityPicker",
  showItemDescriptions: "showItemDescriptions",
  showFavorites: "showFavorites",
  showCompanions: "showCompanions",
  showCompanionEffects: "showCompanionEffects",
  companionVisionPan: "companionVisionPan",
  companionAutoFocus: "companionAutoFocus",
  gmEnabled: "gmEnabled",
  gmFollowTurn: "gmFollowTurn",
  gmAutoAdvance: "gmAutoAdvance",
  gmIncludePlayerNpcs: "gmIncludePlayerNpcs",
  gmShowItemDetails: "gmShowItemDetails",
  gmShowAttackDetails: "gmShowAttackDetails",
  gmHideSearch: "gmHideSearch",
  gmFilterActions: "gmFilterActions",
  gmActionTypesOnly: "gmActionTypesOnly",
  gmHighlightDead: "gmHighlightDead",
  gmOpenOnCombat: "gmOpenOnCombat",
  gmCloseAfterCombat: "gmCloseAfterCombat",
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
    type = Boolean,
    gmOnly = false
  } = {}
) =>
  Object.freeze({
    group,
    placement,
    refresh,
    type,
    default: defaultValue,
    gmOnly,
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
  [SETTINGS.theme]: defineSetting("appearance", {
    placement: "basic",
    choices: {
      auto: "ADVENTURER_HUD.Settings.theme.Auto",
      light: "ADVENTURER_HUD.Settings.theme.Light",
      dark: "ADVENTURER_HUD.Settings.theme.Dark"
    },
    defaultValue: "auto",
    refresh: "runtime",
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
  [SETTINGS.hudClosed]: defineSetting("interface", {
    defaultValue: false,
    placement: "internal",
    refresh: "none"
  }),
  [SETTINGS.gmPinWindow]: defineSetting("interface", {
    defaultValue: false,
    placement: "internal",
    refresh: "runtime"
  }),
  [SETTINGS.closeOnEscape]: defineSetting("behavior", {
    defaultValue: false,
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
  [SETTINGS.showItemDescriptions]: defineSetting("itemUse", {
    refresh: "runtime"
  }),
  [SETTINGS.showItemDetails]: defineSetting("itemUse"),
  [SETTINGS.showActionTypes]: defineSetting("itemUse"),
  [SETTINGS.showCombatSkills]: defineSetting("quickAccess"),
  [SETTINGS.showModeNavigation]: defineSetting("interface", {
    defaultValue: false,
    placement: "internal"
  }),
  [SETTINGS.showShortcuts]: defineSetting("interface"),
  [SETTINGS.showSearch]: defineSetting("quickAccess"),
  [SETTINGS.showFavorites]: defineSetting("quickAccess"),
  [SETTINGS.showCompanions]: defineSetting("companions", {
    placement: "companions"
  }),
  [SETTINGS.showCompanionEffects]: defineSetting("companions", {
    placement: "companions"
  }),
  [SETTINGS.companionVisionPan]: defineSetting("companions", {
    placement: "companions",
    refresh: "none"
  }),
  [SETTINGS.companionAutoFocus]: defineSetting("companions", {
    placement: "companions",
    refresh: "none"
  }),
  [SETTINGS.gmEnabled]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: true,
    refresh: "reopen"
  }),
  [SETTINGS.gmFollowTurn]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true
  }),
  [SETTINGS.gmShowItemDetails]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true
  }),
  [SETTINGS.gmShowAttackDetails]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true
  }),
  [SETTINGS.gmHideSearch]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true
  }),
  [SETTINGS.gmFilterActions]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true,
    defaultValue: true
  }),
  [SETTINGS.gmActionTypesOnly]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true
  }),
  [SETTINGS.gmHighlightDead]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: false
  }),
  [SETTINGS.gmOpenOnCombat]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: false,
    refresh: "none"
  }),
  [SETTINGS.gmCloseAfterCombat]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: false,
    refresh: "none"
  }),
  [SETTINGS.gmAutoAdvance]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true,
    defaultValue: false
  }),
  [SETTINGS.gmIncludePlayerNpcs]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: false,
    refresh: "reopen"
  })
});

export const getSettingDefinitions = () => SETTING_DEFINITIONS;
export const getGmSettingGroups = () => ({
  gmWindow: [
    SETTINGS.gmEnabled,
    SETTINGS.gmOpenOnCombat,
    SETTINGS.gmCloseAfterCombat
  ],
  gmSelection: [
    "gmSelectionMode",
    SETTINGS.gmIncludePlayerNpcs,
    SETTINGS.gmHighlightDead
  ],
  gmActions: ["gmActionDisplay", SETTINGS.gmHideSearch, "gmCardDetails"]
});

export const getSettingsViewDefinitions = () => ({
  ...SETTING_DEFINITIONS,
  gmCardDetails: {
    gmOnly: true,
    type: String,
    choices: {
      compact: "ADVENTURER_HUD.Settings.gmCardDetails.Compact",
      attack: "ADVENTURER_HUD.Settings.gmCardDetails.Attack",
      full: "ADVENTURER_HUD.Settings.gmCardDetails.Full"
    }
  },
  gmSelectionMode: {
    gmOnly: true,
    type: String,
    choices: {
      manual: "ADVENTURER_HUD.Settings.gmSelectionMode.Manual",
      turn: "ADVENTURER_HUD.Settings.gmSelectionMode.Turn",
      next: "ADVENTURER_HUD.Settings.gmSelectionMode.Next"
    }
  },
  gmActionDisplay: {
    gmOnly: true,
    type: String,
    choices: {
      all: "ADVENTURER_HUD.Settings.gmActionDisplay.All",
      types: "ADVENTURER_HUD.Settings.gmActionDisplay.Types",
      items: "ADVENTURER_HUD.Settings.gmActionDisplay.Items"
    }
  }
});

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

export const getCompanionSettingGroups = () => ({
  companions: definitionsBy(
    getSettingDefinitions(),
    definition => definition.placement === "companions"
  )
});
