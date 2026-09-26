export function prepareSettingsGroups({ groups, readValue, t }) {
  return Object.entries(groups)
    .map(([id, keys]) => ({
      label: t(`Settings.Groups.${id}`),
      settings: keys.map(key => ({
        hint: t(`Settings.${key}.Hint`),
        key,
        name: t(`Settings.${key}.Name`),
        value: readValue(key)
      }))
    }))
    .filter(group => group.settings.length);
}

export function booleanSettingsEntries(groups, submitted) {
  return Object.values(groups)
    .flat()
    .map(key => [key, Boolean(submitted[key])]);
}
