import {
  getSettingDefinitions,
  getSettingsViewDefinitions,
  validHiddenEffects,
  SETTINGS,
  CARD_DETAIL_GROUPS,
  HUD_TEXT_PIXELS,
  cardDetailFields,
  validCardDetailFields
} from "./settings-schema.js";

export function prepareSettingsGroups({
  groups,
  readValue,
  t,
  language = "en",
  idPrefix = "adventurer-hud-settings",
  hiddenEffectChoices = []
}) {
  const definitions = getSettingsViewDefinitions();
  const savedFilter = readValue(SETTINGS.statusFilter);
  const savedHidden = readValue(SETTINGS.hiddenEffects);
  const hidden = new Set(Array.isArray(savedHidden) ? savedHidden : []);
  // Keep existing individual exclusions when opening settings from older betas.
  const filter =
    (savedFilter === "all" && hidden.size) ||
    (savedFilter === "conditions" &&
      hiddenEffectChoices.some(
        choice => choice.standard && hidden.has(choice.value)
      ))
      ? "custom"
      : savedFilter;
  const hiddenChoice = choice =>
    filter === "conditions" ||
    (filter === "custom" && savedFilter === "conditions")
      ? !choice.standard || hidden.has(choice.value)
      : filter === "custom" && hidden.has(choice.value);
  const valueFor = key =>
    key === SETTINGS.hudActorSelection && readValue(key) === "specific"
      ? readValue(SETTINGS.hudPreferredActor) || "specific"
      : key === SETTINGS.fontSizePx
        ? (HUD_TEXT_PIXELS[readValue(SETTINGS.fontSize)] ?? readValue(key))
        : key === SETTINGS.statusFilter
          ? filter
          : key === "gmActionDisplay"
            ? !readValue(SETTINGS.gmFilterActions)
              ? "all"
              : readValue(SETTINGS.gmActionTypesOnly)
                ? "types"
                : "items"
            : key === "gmSelectionMode"
              ? readValue(SETTINGS.gmFollowTurn)
                ? "turn"
                : "manual"
              : key === SETTINGS.gmHideSearch
                ? !readValue(key)
                : readValue(key);
  const headings = {
    language: "Display",
    autoOpenHud: "Opening",
    hudActorSelection: "Actor",
    slidePanel: "Closing",
    autoScrollExpanded: "Scrolling",
    theme: "Palette",
    fontSize: "Text",
    showSearch: "Blocks",
    showArmorClass: "Stats",
    showActionTypes: "Categories",
    showCompanions: "CompanionDisplay",
    companionAutoFocus: "CompanionFocus",
    familiarVision2024: "SharedSenses"
  };
  const parents = {
    appearanceTheme: "appearance",
    appearanceAnimations: "appearance",
    panelSections: "quickAccess",
    panelItems: "quickAccess",
    effects: "quickAccess",
    cardDetails: "quickAccess",
    gmWindow: "gm",
    gmCards: "gm",
    gmSelection: "gm",
    gmActions: "gm",
    world: "gm"
  };
  return Object.entries(groups)
    .map(([id, keys], index) => ({
      id,
      parentId: Object.hasOwn(groups, parents[id]) ? parents[id] : "",
      childHidden: Object.hasOwn(groups, parents[id]) ? "hidden" : "",
      hasChildren: Object.keys(groups).some(key => parents[key] === id),
      behaviorSummary: id === "behavior",
      editorHint: id === "panelSections" ? t("Settings.EditorHint") : "",
      editorGuideLabel: t("Settings.EditorGuide"),
      editorGuideUrl: `https://github.com/wondersalmon/adventurer-hud/blob/main/docs/layout-guide${language === "ru" ? ".ru" : ""}.md`,
      defaultChild: !keys.length
        ? Object.keys(groups).find(key => parents[key] === id)
        : "",
      idPrefix,
      selectedAttribute: String(index === 0),
      tabIndex: index === 0 ? 0 : -1,
      hiddenAttribute: index === 0 ? "" : "hidden",
      icon:
        {
          effects: "fa-filter",
          cardDetails: "fa-list-check",
          gmCards: "fa-list-check",
          gmSelection: "fa-crosshairs",
          gmActions: "fa-bolt",
          panelSections: "fa-list",
          gmWindow: "fa-window-maximize",
          panelItems: "fa-hand",
          appearance: "fa-palette",
          appearanceTheme: "fa-palette",
          appearanceAnimations: "fa-wand-magic-sparkles",
          behavior: "fa-sliders",
          windowLayout: "fa-window-maximize",
          quickAccess: "fa-star",
          companions: "fa-paw",
          world: "fa-globe",
          gm: "fa-dragon"
        }[id] ?? "fa-sliders",
      label: t(`Settings.Groups.${id}.Name`),
      description: t(`Settings.Groups.${id}.Hint`),
      scopeLabel: t(
        id === "world" ? "Settings.Scope.World" : "Settings.Scope.Personal"
      ),
      settings: keys
        .filter(key => key !== SETTINGS.hudPreferredActor)
        .map(key => {
          const value = valueFor(key);
          const choices =
            key === SETTINGS.hudActorSelection
              ? Object.fromEntries([
                  [
                    "assigned",
                    [
                      t("Settings.hudActorSelection.Assigned"),
                      globalThis.game?.user?.character?.name
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  ],
                  ["prompt", t("Settings.hudActorSelection.Prompt")],
                  ["last", t("Settings.hudActorSelection.Last")],
                  ...(
                    globalThis.game?.actors?.filter?.(
                      actor => actor.type === "character" && actor.isOwner
                    ) ?? []
                  ).map(actor => [actor.uuid, actor.name]),
                  ...(!["assigned", "prompt", "last"].includes(value) &&
                  !globalThis.game?.actors?.find?.(
                    actor =>
                      actor.uuid === value &&
                      actor.type === "character" &&
                      actor.isOwner
                  )
                    ? [[value, t("Settings.hudPreferredActor.Unavailable")]]
                    : [])
                ])
              : definitions[key]?.choices;
          const parentKey =
            key === SETTINGS.twoColumnWidth
              ? SETTINGS.twoColumnMode
              : key === SETTINGS.accentColor
                ? SETTINGS.accentPreset
                : [
                      SETTINGS.showCompanionEffects,
                      SETTINGS.companionVisionAnyTurn,
                      SETTINGS.companionVisionPan,
                      SETTINGS.companionAutoFocus,
                      SETTINGS.familiarVision2024
                    ].includes(key)
                  ? SETTINGS.showCompanions
                  : ![
                        SETTINGS.gmEnabled,
                        SETTINGS.gmCardDetails,
                        SETTINGS.gmCardDetailFields
                      ].includes(key) &&
                      ((definitions[key]?.gmOnly &&
                        definitions[key]?.scope !== "world") ||
                        ["gmSelectionMode", "gmActionDisplay"].includes(key))
                    ? SETTINGS.gmEnabled
                    : null;
          const disabled =
            parentKey === SETTINGS.twoColumnMode
              ? readValue(parentKey) !== "manual"
              : parentKey === SETTINGS.accentPreset
                ? readValue(parentKey) !== "custom"
                : Boolean(parentKey && !readValue(parentKey));
          return {
            idPrefix,
            key,
            sectionHeading: headings[key]
              ? t(`Settings.Sections.${headings[key]}`)
              : "",
            merged: key === SETTINGS.fontSizePx,
            animationDisabledHint: t("Settings.Animations.Disabled"),
            fieldsSummary: t("Settings.CardFields.Summary"),
            name: t(`Settings.${key}.Name`),
            hint: t(`Settings.${key}.Hint`),
            value,
            parentKey,
            disabled,
            disabledAttribute: disabled ? "disabled" : "",
            isSelect: Boolean(choices),
            effectList: key === SETTINGS.hiddenEffects,
            searchLabel: t("Settings.hiddenEffects.Search"),
            loadingLabel: t("Settings.hiddenEffects.Loading"),
            detailGroups: [
              SETTINGS.cardDetailFields,
              SETTINGS.gmCardDetailFields
            ].includes(key)
              ? Object.entries(CARD_DETAIL_GROUPS).map(([group, fields]) => ({
                  label: t(`Settings.cardDetailGroups.${group}`),
                  icon: {
                    roll: "fa-dice-d20",
                    damage: "fa-khanda",
                    properties: "fa-crosshairs",
                    spells: "fa-wand-magic-sparkles"
                  }[group],
                  fields: fields.map(field => ({
                    key,
                    value: field,
                    label: t(`Settings.cardDetailFields.${field}`),
                    selected: cardDetailFields(
                      readValue(
                        key === SETTINGS.cardDetailFields
                          ? SETTINGS.cardDetails
                          : SETTINGS.gmCardDetails
                      ),
                      value
                    ).includes(field)
                  }))
                }))
              : null,
            cardPreview: [
              SETTINGS.cardDetailFields,
              SETTINGS.gmCardDetailFields
            ].includes(key),
            cardPreviewLabel: t("Settings.CardPreview.Name"),
            cardPreviewHint: t("Settings.CardPreview.Hint"),
            mechanicsPreview: key === "gmActionDisplay",
            mechanicsPreviewLabel: t("Settings.MechanicsPreview.Name"),
            mechanicsPreviewHint: t("Settings.MechanicsPreview.Hint"),
            clearLabel:
              key === SETTINGS.hiddenEffects
                ? t("Settings.hiddenEffects.Clear")
                : "",
            emptyLabel:
              key === SETTINGS.hiddenEffects
                ? t("Settings.hiddenEffects.Empty")
                : "",
            choices:
              key === SETTINGS.hiddenEffects
                ? hiddenEffectChoices.map(choice => ({
                    ...choice,
                    selected: Boolean(hiddenChoice(choice))
                  }))
                : choices
                  ? Object.entries(choices).map(([choice, label]) => ({
                      value: choice,
                      label:
                        key !== SETTINGS.hudActorSelection &&
                        label.startsWith("ADVENTURER_HUD.")
                          ? t(label.replace("ADVENTURER_HUD.", ""))
                          : label,
                      selected: choice === value
                    }))
                  : null,
            range: definitions[key]?.range,
            numeric: definitions[key]?.type === Number,
            color: definitions[key]?.color
          };
        })
    }))
    .filter(group => group.settings.length || group.hasChildren)
    .map(group => {
      const previewLabels = {
        previewLabel: t("Settings.Appearance.Preview"),
        previewHint: t("Settings.Appearance.PreviewHint"),
        previewName: t("Settings.Appearance.Hero"),
        previewDamage: t("Settings.Appearance.Damage"),
        previewHeal: t("Settings.Appearance.Heal"),
        previewTurn: t("Settings.Appearance.Turn")
      };
      if (group.id === "appearanceAnimations")
        return {
          ...group,
          ...previewLabels,
          animationPreview: true,
          settings: group.settings.map(setting => ({
            ...setting,
            sizeControl:
              setting.key === SETTINGS.fontSize
                ? group.settings.find(row => row.key === SETTINGS.fontSizePx)
                : null,
            customColorAnchor: setting.key === SETTINGS.accentColor,
            animationDetail: [
              SETTINGS.hpAnimation,
              SETTINGS.turnAnimation
            ].includes(setting.key),
            animationDisabled: !readValue(SETTINGS.showVisualEffects),
            animationHintHidden: readValue(SETTINGS.showVisualEffects)
              ? "hidden"
              : "",
            appearanceHidden: ""
          }))
        };
      if (group.id !== "appearanceTheme") return group;
      const customKeys = [
        SETTINGS.customThemeAccent,
        SETTINGS.customThemeBackground,
        SETTINGS.customThemeText
      ];
      return {
        ...group,
        appearance: true,
        accentSourceLabel: t("Settings.Accent.SourceBuiltIn"),
        themePreviewLabel: t("Settings.Appearance.ThemePreview"),
        previewAC: t("Combat.AC"),
        previewSpeed: t("Combat.Speed"),
        previewFeet: t("Settings.CardPreview.Feet"),
        previewHP: t("Combat.HP"),
        previewLevel: t("Actor.Level").replace("{level}", "8"),
        previewProficiency: t("Combat.ProficiencyBonusShort"),
        previewFavorites: t("Quick.Favorites"),
        previewSpells: t("Combat.Spells"),
        previewSpell: t("Settings.CardPreview.Spell"),
        previewFire: t("Settings.CardPreview.Fire"),
        previewWeapon: t("Settings.CardPreview.Weapon"),
        previewSlashing: t("Settings.CardPreview.Slashing"),
        themeColorsLabel: t("Settings.Appearance.Colors"),
        copyThemeLabel: t("Settings.Appearance.Copy"),
        copyThemeSourceLabel: t("Settings.Appearance.Source"),
        customHidden: readValue(SETTINGS.theme) === "custom" ? "" : "hidden",
        customInitialized: Boolean(readValue(SETTINGS.customThemeInitialized)),
        themeColors: group.settings.filter(setting =>
          customKeys.includes(setting.key)
        ),
        builtInThemes: group.settings
          .find(setting => setting.key === SETTINGS.theme)
          .choices.filter(choice => choice.value !== "custom"),
        previewLabel: t("Settings.Appearance.Preview"),
        previewHint: t("Settings.Appearance.PreviewHint"),
        previewName: t("Settings.Appearance.Hero"),
        previewDamage: t("Settings.Appearance.Damage"),
        previewHeal: t("Settings.Appearance.Heal"),
        previewTurn: t("Settings.Appearance.Turn"),
        settings: group.settings
          .filter(
            setting =>
              ![...customKeys, SETTINGS.customThemeInitialized].includes(
                setting.key
              )
          )
          .map(setting => ({
            ...setting,
            sizeControl:
              setting.key === SETTINGS.fontSize
                ? group.settings.find(row => row.key === SETTINGS.fontSizePx)
                : null,
            customColorAnchor: setting.key === SETTINGS.accentColor,
            animationDetail: [
              SETTINGS.hpAnimation,
              SETTINGS.turnAnimation
            ].includes(setting.key),
            appearanceHidden:
              ([SETTINGS.hpAnimation, SETTINGS.turnAnimation].includes(
                setting.key
              ) &&
                !readValue(SETTINGS.showVisualEffects)) ||
              ([SETTINGS.accentPreset, SETTINGS.accentColor].includes(
                setting.key
              ) &&
                readValue(SETTINGS.theme) === "custom") ||
              (setting.key === SETTINGS.accentColor &&
                readValue(SETTINGS.accentPreset) !== "custom")
                ? "hidden"
                : ""
          }))
      };
    })
    .map(group => ({
      ...group,
      settings: group.settings.map(setting => ({
        ...setting,
        customPalette: setting.customColorAnchor ? group : null
      }))
    }));
}

export function booleanSettingsEntries(groups, submitted) {
  return Object.values(groups)
    .flat()
    .flatMap(key => {
      if (!Object.hasOwn(submitted, key)) return [];
      const value = submitted[key];
      const definition = getSettingDefinitions()[key];
      if (
        key === SETTINGS.hudActorSelection &&
        typeof value === "string" &&
        /^Actor\.[A-Za-z0-9_-]+$/.test(value)
      )
        return [
          [SETTINGS.hudActorSelection, "specific"],
          [SETTINGS.hudPreferredActor, value]
        ];
      if (key === SETTINGS.hiddenEffects) {
        if (!validHiddenEffects(value))
          throw new Error("Invalid hidden effects");
        return [[key, [...new Set(value)]]];
      }
      if (
        key === SETTINGS.statusFilter &&
        !Object.hasOwn(definition.choices, value)
      )
        throw new Error("Invalid status filter");
      if (
        key === SETTINGS.accentPreset &&
        !Object.hasOwn(definition.choices, value)
      )
        throw new Error("Invalid accent preset");
      if (
        definition?.color &&
        (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
      )
        throw new Error("Invalid accent color");
      if (definition?.type === Number) {
        const number = Number(value);
        if (
          !Number.isFinite(number) ||
          (definition.range &&
            (number < definition.range.min || number > definition.range.max))
        )
          throw new Error("Invalid numeric setting");
        return [[key, number]];
      }
      if (
        [SETTINGS.cardDetailFields, SETTINGS.gmCardDetailFields].includes(key)
      ) {
        if (!validCardDetailFields(value))
          throw new Error("Invalid card details");
        return [[key, [...new Set(value)]]];
      }
      if (definition?.choices && !Object.hasOwn(definition.choices, value))
        throw new Error("Invalid setting choice");
      if (key === "gmActionDisplay") {
        if (!["all", "types", "items"].includes(value))
          throw new Error("Invalid GM action display");
        return [
          [SETTINGS.gmFilterActions, value !== "all"],
          [SETTINGS.gmActionTypesOnly, value !== "items"]
        ];
      }
      if (key === "gmSelectionMode") {
        if (!["manual", "turn"].includes(value))
          throw new Error("Invalid GM selection mode");
        return [
          [SETTINGS.gmFollowTurn, value === "turn"],
          [SETTINGS.gmAutoAdvance, false]
        ];
      }
      return [
        [
          key,
          key === SETTINGS.gmHideSearch
            ? !Boolean(value)
            : getSettingDefinitions()[key]?.type === String
              ? value
              : Boolean(value)
        ]
      ];
    });
}
