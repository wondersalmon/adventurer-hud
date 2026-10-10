import {
  getSettingDefinitions,
  getSettingsViewDefinitions,
  SETTINGS
} from "./settings-schema.js";

export function prepareSettingsGroups({ groups, readValue, t }) {
  const definitions = getSettingsViewDefinitions();
  const valueFor = key =>
    key === "gmCardDetails"
      ? readValue(SETTINGS.gmShowItemDetails)
        ? "full"
        : readValue(SETTINGS.gmShowAttackDetails)
          ? "attack"
          : "compact"
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
  return Object.entries(groups)
    .map(([id, keys]) => ({
      label: t(`Settings.Groups.${id}`),
      settings: keys.map(key => {
        const value = valueFor(key);
        const choices = definitions[key]?.choices;
        const parentKey = [
          SETTINGS.showCompanionEffects,
          SETTINGS.companionVisionPan,
          SETTINGS.companionAutoFocus,
          SETTINGS.familiarVision2024
        ].includes(key)
          ? SETTINGS.showCompanions
          : key !== SETTINGS.gmEnabled &&
              key !== SETTINGS.scInitiative &&
              (definitions[key]?.gmOnly ||
                ["gmSelectionMode", "gmActionDisplay"].includes(key))
            ? SETTINGS.gmEnabled
            : null;
        return {
          key,
          name: t(`Settings.${key}.Name`),
          hint: t(`Settings.${key}.Hint`),
          value,
          parentKey,
          disabled: Boolean(parentKey && !readValue(parentKey)),
          disabledAttribute:
            parentKey && !readValue(parentKey) ? "disabled" : "",
          choices: choices
            ? Object.entries(choices).map(([choice, label]) => ({
                value: choice,
                label: t(label.replace("ADVENTURER_HUD.", "")),
                selected: choice === value
              }))
            : null,
          range: definitions[key]?.range,
          numeric: definitions[key]?.type === Number
        };
      })
    }))
    .filter(group => group.settings.length);
}

export function booleanSettingsEntries(groups, submitted) {
  return Object.values(groups)
    .flat()
    .flatMap(key => {
      if (!Object.hasOwn(submitted, key)) return [];
      const value = submitted[key];
      const definition = getSettingDefinitions()[key];
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
      if (key === "gmCardDetails") {
        if (!["compact", "attack", "full"].includes(value))
          throw new Error("Invalid GM card details");
        return [
          [SETTINGS.gmShowItemDetails, value === "full"],
          [SETTINGS.gmShowAttackDetails, value !== "compact"]
        ];
      }
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
