export const SETTINGS = Object.freeze({
  autoOpenHud: "autoOpenHud",
  hudActorSelection: "hudActorSelection",
  hudPreferredActor: "hudPreferredActor",
  lastHudActor: "lastHudActor",
  hudClosed: "hudClosed",
  autoUpdateActor: "autoUpdateActor",
  pinWindow: "pinWindow",
  gmPinWindow: "gmPinWindow",
  closeOnEscape: "closeOnEscape",
  slidePanel: "slidePanel",
  openPlayerOnCombat: "openPlayerOnCombat",
  separateModeSizes: "separateModeSizes",
  perCharacterLayout: "perCharacterLayout",
  windowModeSizes: "windowModeSizes",
  debugWindowSize: "debugWindowSize",
  twoColumnWidth: "twoColumnWidth",
  twoColumnMode: "twoColumnMode",
  playerFooter: "playerFooter",
  playerColumnRatio: "playerColumnRatio",
  gmRosterColumnRatio: "gmRosterColumnRatio",
  gmInfoColumnRatio: "gmInfoColumnRatio",
  playerExtraColumnRatio: "playerExtraColumnRatio",
  gmExtraColumnRatio: "gmExtraColumnRatio",
  autoScrollExpanded: "autoScrollExpanded",
  gmWindowGeometry: "gmWindowGeometry",
  showTokenControl: "showTokenControl",
  fontSize: "fontSize",
  fontSizePx: "fontSizePx",
  fontFamily: "fontFamily",
  fontStyle: "fontStyle",
  cardDetails: "cardDetails",
  cardDetailFields: "cardDetailFields",
  gmCardDetails: "gmCardDetails",
  gmCardDetailFields: "gmCardDetailFields",
  changelogSeenVersion: "changelogSeenVersion",
  language: "language",
  theme: "theme",
  accentPreset: "accentPreset",
  accentColor: "accentColor",
  customThemeAccent: "customThemeAccent",
  customThemeBackground: "customThemeBackground",
  customThemeText: "customThemeText",
  customThemeInitialized: "customThemeInitialized",
  hpAnimation: "hpAnimation",
  turnAnimation: "turnAnimation",
  statusFilter: "statusFilter",
  hiddenEffects: "hiddenEffects",
  showVisualEffects: "showVisualEffects",
  showItemDetails: "showItemDetails",
  showSpellPreparation: "showSpellPreparation",
  showActionTypes: "showActionTypes",
  showCombatSkills: "showCombatSkills",
  showArmorClass: "showArmorClass",
  showInitiative: "showInitiative",
  showSpeed: "showSpeed",
  showActorLevel: "showActorLevel",
  showActorClasses: "showActorClasses",
  showModeNavigation: "showModeNavigation",
  showShortcuts: "showShortcuts",
  showSearch: "showSearch",
  showInventorySummary: "showInventorySummary",
  showActivityPicker: "showActivityPicker",
  showItemDescriptions: "showItemDescriptions",
  hideItemOpenButton: "hideItemOpenButton",
  gmHideItemOpenButton: "gmHideItemOpenButton",
  showFavorites: "showFavorites",
  showCompanions: "showCompanions",
  showCompanionEffects: "showCompanionEffects",
  companionVisionPan: "companionVisionPan",
  companionVisionAnyTurn: "companionVisionAnyTurn",
  familiarVision2024: "familiarVision2024",
  companionAutoFocus: "companionAutoFocus",
  companionCameraPan: "companionCameraPan",
  gmEnabled: "gmEnabled",
  gmFollowTurn: "gmFollowTurn",
  gmAutoAdvance: "gmAutoAdvance",
  gmIncludePlayerNpcs: "gmIncludePlayerNpcs",
  gmActorDrop: "gmActorDrop",
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
  extraLarge: "ADVENTURER_HUD.Settings.fontSize.ExtraLarge",
  custom: "ADVENTURER_HUD.Settings.fontSize.Custom"
});

export const HUD_TEXT_PIXELS = Object.freeze({
  small: 10,
  medium: 11.5,
  large: 13,
  extraLarge: 15
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
    gmOnly = false,
    scope = "user",
    color = false,
    range
  } = {}
) =>
  Object.freeze({
    group,
    placement,
    refresh,
    type,
    default: defaultValue,
    gmOnly,
    scope,
    color,
    ...(range ? { range } : {}),
    ...(choices ? { choices } : {})
  });

export const HUD_ACCENT_DEFAULTS = Object.freeze({
  light: "#79551c",
  dark: "#c19a58"
});

/** @param {unknown} value */
export const normalizeHudTheme = value =>
  value === "modern" || value === "immersive" ? "dark" : value;

export const HUD_ACCENT_PRESETS = Object.freeze({
  standard: HUD_ACCENT_DEFAULTS,
  foundry: Object.freeze({ ...HUD_ACCENT_DEFAULTS }),
  teal: Object.freeze({ light: "#0c6861", dark: "#5eead4" }),
  blue: Object.freeze({ light: "#1d4ed8", dark: "#93c5fd" }),
  violet: Object.freeze({ light: "#6d28d9", dark: "#c4b5fd" }),
  rose: Object.freeze({ light: "#a91552", dark: "#f9a8d4" }),
  amber: Object.freeze({ light: "#8d3e04", dark: "#fcd34d" })
});

export const HUD_FONT_FAMILIES = Object.freeze({
  arial: "Arial, Helvetica, sans-serif",
  system: "system-ui, 'Segoe UI', Arial, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  monospace: "Consolas, 'Courier New', monospace"
});

export const CARD_DETAIL_GROUPS = Object.freeze({
  roll: ["activation", "attack"],
  damage: ["damage", "damageType", "charges"],
  properties: ["range", "mastery"],
  spells: ["components", "concentration", "ritual"]
});
export const CARD_DETAIL_FIELDS = Object.freeze(
  Object.values(CARD_DETAIL_GROUPS).flat()
);
export const CARD_DETAIL_PRESETS = Object.freeze({
  off: [],
  basic: [...CARD_DETAIL_GROUPS.roll, ...CARD_DETAIL_GROUPS.damage],
  all: CARD_DETAIL_FIELDS
});
export const validCardDetailFields = value =>
  Array.isArray(value) &&
  value.length <= CARD_DETAIL_FIELDS.length &&
  value.every(key => CARD_DETAIL_FIELDS.includes(key));
export const cardDetailFields = (mode, fields) =>
  mode === "custom"
    ? validCardDetailFields(fields)
      ? fields
      : []
    : (CARD_DETAIL_PRESETS[mode] ?? CARD_DETAIL_PRESETS.all);
const cardDetailChoices = Object.fromEntries(
  ["off", "basic", "all", "custom"].map(mode => [
    mode,
    `ADVENTURER_HUD.Settings.cardDetails.${mode}`
  ])
);

export const HIDDEN_EFFECT_LIMIT = 200;
export const validHiddenEffects = value =>
  Array.isArray(value) &&
  value.length <= HIDDEN_EFFECT_LIMIT &&
  value.every(
    key => typeof key === "string" && /^(status|effect):.{1,512}$/su.test(key)
  );

export const SETTING_DEFINITIONS = Object.freeze({
  ...Object.fromEntries(
    Object.entries({
      customThemeAccent: "#c19a58",
      customThemeBackground: "#1a1a1a",
      customThemeText: "#eeeeee"
    }).map(([key, defaultValue]) => [
      key,
      defineSetting("appearance", {
        defaultValue,
        type: String,
        color: true,
        refresh: "runtime"
      })
    ])
  ),
  [SETTINGS.customThemeInitialized]: defineSetting("appearance", {
    defaultValue: false,
    placement: "internal",
    refresh: "none"
  }),
  ...Object.fromEntries(
    Object.entries({
      hpAnimation: { defaultValue: "full", values: ["off", "bar", "full"] },
      turnAnimation: { defaultValue: "full", values: ["off", "soft", "full"] }
    }).map(([key, { defaultValue, values }]) => [
      key,
      defineSetting("appearance", {
        defaultValue,
        type: String,
        refresh: "runtime",
        choices: Object.fromEntries(
          values.map(value => [
            value,
            `ADVENTURER_HUD.Settings.${key}.${value}`
          ])
        )
      })
    ])
  ),
  [SETTINGS.changelogSeenVersion]: defineSetting("appearance", {
    placement: "internal",
    type: String,
    defaultValue: "",
    refresh: "none"
  }),
  [SETTINGS.accentPreset]: defineSetting("appearance", {
    defaultValue: "standard",
    type: String,
    choices: Object.fromEntries(
      [...Object.keys(HUD_ACCENT_PRESETS), "custom"].map(preset => [
        preset,
        `ADVENTURER_HUD.Settings.accentPreset.${preset}`
      ])
    ),
    refresh: "runtime"
  }),
  [SETTINGS.accentColor]: defineSetting("appearance", {
    defaultValue: "#0f766e",
    type: String,
    color: true,
    refresh: "runtime"
  }),
  [SETTINGS.statusFilter]: defineSetting("quickAccess", {
    defaultValue: "all",
    type: String,
    choices: {
      all: "ADVENTURER_HUD.Settings.statusFilter.All",
      conditions: "ADVENTURER_HUD.Settings.statusFilter.Conditions",
      custom: "ADVENTURER_HUD.Settings.statusFilter.Custom"
    }
  }),
  [SETTINGS.hiddenEffects]: defineSetting("quickAccess", {
    defaultValue: [],
    type: Array
  }),
  [SETTINGS.language]: defineSetting("appearance", {
    choices: LANGUAGE_CHOICES,
    defaultValue: "en",
    placement: "basic",
    refresh: "reopen",
    type: String
  }),
  [SETTINGS.theme]: defineSetting("appearance", {
    placement: "basic",
    choices: {
      auto: "ADVENTURER_HUD.Settings.theme.Auto",
      light: "ADVENTURER_HUD.Settings.theme.Light",
      dark: "ADVENTURER_HUD.Settings.theme.Dark",
      graphite: "ADVENTURER_HUD.Settings.theme.Graphite",
      pearl: "ADVENTURER_HUD.Settings.theme.Pearl",
      custom: "ADVENTURER_HUD.Settings.theme.Custom"
    },
    defaultValue: "auto",
    refresh: "runtime",
    type: String
  }),
  [SETTINGS.fontSize]: defineSetting("appearance", {
    choices: FONT_SIZE_CHOICES,
    defaultValue: "large",
    placement: "basic",
    refresh: "runtime",
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
    gmOnly: true,
    defaultValue: false,
    placement: "internal",
    refresh: "runtime"
  }),
  [SETTINGS.closeOnEscape]: defineSetting("behavior", {
    defaultValue: false,
    refresh: "runtime"
  }),
  [SETTINGS.slidePanel]: defineSetting("behavior", {
    defaultValue: true,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.openPlayerOnCombat]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.separateModeSizes]: defineSetting("interface", {
    defaultValue: false,
    placement: "advanced"
  }),
  [SETTINGS.debugWindowSize]: defineSetting("interface", {
    defaultValue: false,
    placement: "advanced",
    refresh: "runtime"
  }),
  [SETTINGS.twoColumnWidth]: defineSetting("interface", {
    defaultValue: 450,
    placement: "advanced",
    refresh: "runtime",
    type: Number,
    range: { min: 450, max: 1200, step: 10 }
  }),
  [SETTINGS.playerFooter]: defineSetting("interface"),
  [SETTINGS.playerColumnRatio]: defineSetting("interface", {
    defaultValue: 0.48,
    placement: "internal",
    refresh: "runtime",
    type: Number
  }),
  [SETTINGS.gmRosterColumnRatio]: defineSetting("interface", {
    defaultValue: 0,
    placement: "internal",
    refresh: "runtime",
    type: Number,
    gmOnly: true,
    range: { min: 0, max: 0.85, step: 0.01 }
  }),
  [SETTINGS.gmInfoColumnRatio]: defineSetting("interface", {
    defaultValue: 0,
    placement: "internal",
    refresh: "runtime",
    type: Number,
    gmOnly: true,
    range: { min: 0, max: 0.7, step: 0.01 }
  }),
  [SETTINGS.playerExtraColumnRatio]: defineSetting("interface", {
    defaultValue: 0.5,
    placement: "internal",
    refresh: "runtime",
    type: Number,
    range: { min: 0.25, max: 0.7, step: 0.01 }
  }),
  [SETTINGS.gmExtraColumnRatio]: defineSetting("interface", {
    defaultValue: 0.5,
    placement: "internal",
    refresh: "runtime",
    type: Number,
    gmOnly: true,
    range: { min: 0.25, max: 0.7, step: 0.01 }
  }),
  [SETTINGS.autoScrollExpanded]: defineSetting("interface", {
    placement: "advanced",
    refresh: "none"
  }),
  [SETTINGS.showTokenControl]: defineSetting("interface", {
    refresh: "controls"
  }),
  [SETTINGS.autoOpenHud]: defineSetting("behavior", {
    defaultValue: false,
    placement: "basic",
    refresh: "none"
  }),
  [SETTINGS.autoUpdateActor]: defineSetting("behavior", {
    placement: "advanced",
    refresh: "none"
  }),
  [SETTINGS.showActivityPicker]: defineSetting("itemUse"),
  [SETTINGS.showItemDescriptions]: defineSetting("itemUse", {
    refresh: "runtime"
  }),
  [SETTINGS.hideItemOpenButton]: defineSetting("itemUse"),
  [SETTINGS.gmHideItemOpenButton]: defineSetting("gm", { gmOnly: true }),
  [SETTINGS.showItemDetails]: defineSetting("itemUse", {
    placement: "internal"
  }),
  [SETTINGS.showActionTypes]: defineSetting("itemUse"),
  [SETTINGS.showCombatSkills]: defineSetting("quickAccess"),
  [SETTINGS.showArmorClass]: defineSetting("quickAccess"),
  [SETTINGS.showInitiative]: defineSetting("quickAccess"),
  [SETTINGS.showSpeed]: defineSetting("quickAccess"),
  [SETTINGS.showActorLevel]: defineSetting("quickAccess"),
  [SETTINGS.showActorClasses]: defineSetting("quickAccess"),
  [SETTINGS.showModeNavigation]: defineSetting("interface", {
    defaultValue: false,
    placement: "internal"
  }),
  [SETTINGS.showShortcuts]: defineSetting("interface"),
  [SETTINGS.showSearch]: defineSetting("quickAccess"),
  [SETTINGS.showInventorySummary]: defineSetting("quickAccess"),
  [SETTINGS.showFavorites]: defineSetting("quickAccess"),
  [SETTINGS.showCompanions]: defineSetting("companions", {
    placement: "companions"
  }),
  [SETTINGS.showCompanionEffects]: defineSetting("companions", {
    placement: "companions"
  }),
  [SETTINGS.companionVisionAnyTurn]: defineSetting("companions", {
    defaultValue: false,
    placement: "companions"
  }),
  [SETTINGS.companionVisionPan]: defineSetting("companions", {
    defaultValue: false,
    placement: "companions",
    refresh: "none"
  }),
  [SETTINGS.companionAutoFocus]: defineSetting("companions", {
    placement: "companions",
    refresh: "none"
  }),
  [SETTINGS.companionCameraPan]: defineSetting("companions", {
    defaultValue: true,
    placement: "companions",
    refresh: "none"
  }),
  [SETTINGS.familiarVision2024]: defineSetting("companions", {
    defaultValue: false,
    placement: "companions"
  }),
  [SETTINGS.gmEnabled]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: false,
    refresh: "reopen"
  }),
  [SETTINGS.gmActorDrop]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    refresh: "runtime"
  }),
  [SETTINGS.gmFollowTurn]: defineSetting("gm", {
    defaultValue: false,
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
    defaultValue: false,
    placement: "gm",
    gmOnly: true
  }),
  [SETTINGS.gmFilterActions]: defineSetting("gm", {
    placement: "internal",
    gmOnly: true,
    defaultValue: true
  }),
  [SETTINGS.gmActionTypesOnly]: defineSetting("gm", {
    defaultValue: false,
    placement: "internal",
    gmOnly: true
  }),
  [SETTINGS.gmHighlightDead]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: true
  }),
  [SETTINGS.gmOpenOnCombat]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: true,
    refresh: "none"
  }),
  [SETTINGS.gmCloseAfterCombat]: defineSetting("gm", {
    placement: "gm",
    gmOnly: true,
    defaultValue: true,
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
  }),
  [SETTINGS.hudActorSelection]: defineSetting("behavior", {
    type: String,
    defaultValue: "assigned",
    choices: {
      assigned: "ADVENTURER_HUD.Settings.hudActorSelection.Assigned",
      prompt: "ADVENTURER_HUD.Settings.hudActorSelection.Prompt",
      last: "ADVENTURER_HUD.Settings.hudActorSelection.Last",
      specific: "ADVENTURER_HUD.Settings.hudActorSelection.Specific"
    }
  }),
  [SETTINGS.hudPreferredActor]: defineSetting("behavior", {
    type: String,
    defaultValue: "",
    placement: "internal"
  }),
  [SETTINGS.lastHudActor]: defineSetting("internal", {
    type: String,
    defaultValue: "",
    placement: "internal"
  }),
  [SETTINGS.perCharacterLayout]: defineSetting("interface", {
    defaultValue: false,
    refresh: "reopen"
  }),
  [SETTINGS.showSpellPreparation]: defineSetting("quickAccess"),
  [SETTINGS.twoColumnMode]: defineSetting("interface", {
    defaultValue: "auto",
    type: String,
    refresh: "runtime",
    choices: {
      auto: "ADVENTURER_HUD.Settings.twoColumnMode.Auto",
      manual: "ADVENTURER_HUD.Settings.twoColumnMode.Manual"
    }
  }),
  [SETTINGS.fontSizePx]: defineSetting("appearance", {
    type: Number,
    defaultValue: 13,
    range: { min: 10, max: 18, step: 0.25 },
    refresh: "runtime"
  }),
  [SETTINGS.fontFamily]: defineSetting("appearance", {
    defaultValue: "arial",
    type: String,
    refresh: "runtime",
    choices: Object.fromEntries(
      Object.keys(HUD_FONT_FAMILIES).map(key => [
        key,
        `ADVENTURER_HUD.Settings.fontFamily.${key}`
      ])
    )
  }),
  [SETTINGS.fontStyle]: defineSetting("appearance", {
    defaultValue: "normal",
    type: String,
    refresh: "runtime",
    choices: Object.fromEntries(
      ["normal", "bold", "italic", "boldItalic"].map(key => [
        key,
        `ADVENTURER_HUD.Settings.fontStyle.${key}`
      ])
    )
  }),
  [SETTINGS.cardDetails]: defineSetting("itemUse", {
    defaultValue: "all",
    type: String,
    choices: cardDetailChoices
  }),
  [SETTINGS.cardDetailFields]: defineSetting("itemUse", {
    defaultValue: CARD_DETAIL_FIELDS,
    type: Array
  }),
  [SETTINGS.gmCardDetails]: defineSetting("gm", {
    gmOnly: true,
    placement: "gm",
    defaultValue: "off",
    type: String,
    choices: cardDetailChoices
  }),
  [SETTINGS.gmCardDetailFields]: defineSetting("gm", {
    gmOnly: true,
    placement: "gm",
    defaultValue: CARD_DETAIL_FIELDS,
    type: Array
  })
});

export const getSettingDefinitions = () => SETTING_DEFINITIONS;
export const getGmSettingGroups = () => ({
  gmWindow: [
    SETTINGS.gmEnabled,
    SETTINGS.gmOpenOnCombat,
    SETTINGS.gmCloseAfterCombat,
    SETTINGS.gmActorDrop
  ],
  gmSelection: [
    "gmSelectionMode",
    SETTINGS.gmIncludePlayerNpcs,
    SETTINGS.gmHighlightDead
  ],
  gmActions: ["gmActionDisplay", SETTINGS.gmHideSearch]
});

export const getConfigureSettingGroups = (isGM = false) => {
  const advanced = getAdvancedSettingGroups();
  const gm = getGmSettingGroups();
  const groups = {
    behavior: [
      SETTINGS.language,
      SETTINGS.autoOpenHud,
      SETTINGS.showTokenControl,
      SETTINGS.hudActorSelection,
      SETTINGS.openPlayerOnCombat,
      SETTINGS.autoUpdateActor,
      SETTINGS.slidePanel,
      SETTINGS.closeOnEscape,
      SETTINGS.autoScrollExpanded
    ],
    windowLayout: [
      SETTINGS.separateModeSizes,
      SETTINGS.perCharacterLayout,
      SETTINGS.twoColumnMode,
      SETTINGS.twoColumnWidth,
      SETTINGS.debugWindowSize,
      SETTINGS.playerFooter
    ],
    appearance: [],
    appearanceTheme: [
      SETTINGS.theme,
      SETTINGS.accentPreset,
      SETTINGS.accentColor,
      SETTINGS.customThemeAccent,
      SETTINGS.customThemeBackground,
      SETTINGS.customThemeText,
      SETTINGS.fontSize,
      SETTINGS.fontSizePx,
      SETTINGS.fontFamily,
      SETTINGS.fontStyle
    ],
    appearanceAnimations: [
      SETTINGS.showVisualEffects,
      SETTINGS.hpAnimation,
      SETTINGS.turnAnimation
    ],
    quickAccess: [],
    panelSections: [
      ...advanced.quickAccess.filter(
        key => ![SETTINGS.statusFilter, SETTINGS.hiddenEffects].includes(key)
      ),
      SETTINGS.showSpellPreparation,
      SETTINGS.showShortcuts
    ],
    panelItems: [
      ...advanced.itemUse.filter(
        key => ![SETTINGS.cardDetails, SETTINGS.cardDetailFields].includes(key)
      )
    ],
    effects: [SETTINGS.statusFilter, SETTINGS.hiddenEffects],
    cardDetails: [SETTINGS.cardDetails, SETTINGS.cardDetailFields],
    companions: [
      SETTINGS.showCompanions,
      SETTINGS.showCompanionEffects,
      SETTINGS.companionAutoFocus,
      SETTINGS.companionCameraPan,
      SETTINGS.familiarVision2024,
      SETTINGS.companionVisionAnyTurn,
      SETTINGS.companionVisionPan
    ],
    ...(isGM
      ? {
          gm: [],
          gmWindow: gm.gmWindow,
          gmSelection: gm.gmSelection,
          gmActions: gm.gmActions,
          gmCards: [
            SETTINGS.gmCardDetails,
            SETTINGS.gmCardDetailFields,
            SETTINGS.gmHideItemOpenButton
          ]
        }
      : {})
  };
  // Scope is a storage contract: GM-only personal preferences are not world rules.
  const world = Object.entries(SETTING_DEFINITIONS)
    .filter(
      ([, definition]) =>
        definition.scope === "world" && definition.placement !== "internal"
    )
    .map(([key]) => key);
  return {
    ...Object.fromEntries(
      Object.entries(groups).map(([id, keys]) => [
        id,
        keys.filter(key => !world.includes(key))
      ])
    ),
    ...(isGM && world.length ? { world } : {})
  };
};

export const CONFIGURE_SECTION_LABELS = Object.freeze({
  [SETTINGS.language]: "Settings.Sections.Display",
  [SETTINGS.accentPreset]: "Settings.Sections.Accent",
  [SETTINGS.showVisualEffects]: "Settings.Sections.Feedback",
  [SETTINGS.autoOpenHud]: "Settings.Sections.Opening",
  [SETTINGS.autoUpdateActor]: "Settings.Sections.Actor",
  [SETTINGS.slidePanel]: "Settings.Sections.Closing",
  [SETTINGS.autoScrollExpanded]: "Settings.Sections.Navigation",
  [SETTINGS.separateModeSizes]: "Settings.Sections.Dimensions",
  [SETTINGS.showSearch]: "Settings.Sections.QuickAccess",
  [SETTINGS.showActivityPicker]: "Settings.Groups.itemUse.Name",
  [SETTINGS.playerFooter]: "Settings.Sections.Controls",
  [SETTINGS.statusFilter]: "Settings.Sections.Effects",
  [SETTINGS.showCompanions]: "Settings.Sections.Companions",
  [SETTINGS.familiarVision2024]: "Settings.Sections.Senses",
  [SETTINGS.companionAutoFocus]: "Settings.Sections.Focus",
  [SETTINGS.gmEnabled]: "Settings.Groups.gmWindow.Name",
  gmSelectionMode: "Settings.Groups.gmSelection.Name",
  gmActionDisplay: "Settings.Groups.gmActions.Name"
});

export const getSettingsViewDefinitions = () => ({
  ...SETTING_DEFINITIONS,
  gmSelectionMode: {
    gmOnly: true,
    type: String,
    choices: {
      manual: "ADVENTURER_HUD.Settings.gmSelectionMode.Manual",
      turn: "ADVENTURER_HUD.Settings.gmSelectionMode.Turn"
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

export const getAdvancedSettingGroups = () => ({
  behavior: [SETTINGS.autoUpdateActor, SETTINGS.closeOnEscape],
  windowLayout: [
    SETTINGS.debugWindowSize,
    SETTINGS.separateModeSizes,
    SETTINGS.twoColumnWidth,
    SETTINGS.autoScrollExpanded,
    SETTINGS.playerFooter
  ],
  quickAccess: [
    SETTINGS.statusFilter,
    SETTINGS.hiddenEffects,
    SETTINGS.showSearch,
    SETTINGS.showInventorySummary,
    SETTINGS.showFavorites,
    SETTINGS.showCombatSkills,
    SETTINGS.showArmorClass,
    SETTINGS.showInitiative,
    SETTINGS.showSpeed,
    SETTINGS.showActorLevel,
    SETTINGS.showActorClasses,
    SETTINGS.showActionTypes
  ],
  itemUse: [
    SETTINGS.showActivityPicker,
    SETTINGS.showItemDescriptions,
    SETTINGS.hideItemOpenButton,
    SETTINGS.cardDetails,
    SETTINGS.cardDetailFields
  ],
  interface: [
    SETTINGS.showVisualEffects,
    SETTINGS.showTokenControl,
    SETTINGS.showShortcuts
  ]
});

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
