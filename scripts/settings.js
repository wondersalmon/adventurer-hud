import { MODULE_ID } from "./module-id.js";
import { createModuleTranslator } from "./localization.js";
import { getSystemAdapter } from "./systems/index.js";
import {
  ADVANCED_SETTING_GROUPS,
  SETTINGS,
  SETTING_DEFAULTS,
  SETTING_DEFINITIONS
} from "./settings-schema.js";
export {
  SETTINGS,
  SETTING_DEFAULTS,
  SETTING_DEFINITIONS
} from "./settings-schema.js";

let SettingsApplication = null;
let ResetSettingsApplication = null;
let pendingSettingKeys = null;

const notifyChange = key => value => {
  if (pendingSettingKeys?.has(key)) return;
  Hooks.callAll("adventurerHudSettingChanged", key, value);
};

async function saveChangedSettings(entries) {
  const changes = new Map();
  pendingSettingKeys = new Set();
  try {
    for (const [key, value] of entries) {
      if (Object.is(getSetting(key), value)) continue;
      pendingSettingKeys.add(key);
      await setSetting(key, value);
      changes.set(key, value);
    }
  } finally {
    pendingSettingKeys = null;
    if (changes.size) {
      Hooks.callAll("adventurerHudSettingsChanged", changes);
    }
  }
}

export function isSettingSupported(key, systemId = game.system?.id) {
  const capability = SETTING_DEFINITIONS[key]?.capability;
  if (!capability) return true;
  return Boolean(getSystemAdapter(systemId)?.capabilities?.[capability]);
}

export const settingRefreshStrategy = key =>
  key === SETTINGS.proficientSkillsOnly
    ? "content"
    : (SETTING_DEFINITIONS[key]?.refresh ?? "none");

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

  game.settings.register(MODULE_ID, SETTINGS.favoriteEntries, {
    name: "Adventurer HUD favorites",
    hint: "",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.panelStates, {
    name: "Adventurer HUD panel states",
    hint: "",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.proficientSkillsOnly, {
    name: "Adventurer HUD trained skills filter",
    hint: "",
    scope: "user",
    config: false,
    type: Boolean,
    default: true,
    onChange: notifyChange(SETTINGS.proficientSkillsOnly)
  });

  registerSettingsMenus();
}

function registerSettingsMenus() {
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
        title: "ADVENTURER_HUD.Settings.Advanced.Name"
      },
      position: { width: 620, height: "auto" },
      form: { closeOnSubmit: true, handler: this.#onSubmit }
    };

    static PARTS = {
      form: { template: "modules/adventurer-hud/templates/settings.hbs" }
    };

    async _prepareContext() {
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      if (this.options?.window) {
        this.options.window.title = t("Settings.Advanced.Name");
      }
      return {
        saveLabel: t("Settings.Save"),
        groups: Object.entries(ADVANCED_SETTING_GROUPS)
          .map(([id, keys]) => ({
            label: t(`Settings.Groups.${id}`),
            settings: keys
              .filter(key => isSettingSupported(key))
              .map(key => {
                const definition = game.settings.settings.get(
                  `${MODULE_ID}.${key}`
                );
                return {
                  hint: t(definition.hint.replace("ADVENTURER_HUD.", "")),
                  key,
                  name: t(definition.name.replace("ADVENTURER_HUD.", "")),
                  value: getSetting(key)
                };
              })
          }))
          .filter(group => group.settings.length)
      };
    }

    static async #onSubmit(_event, _form, formData) {
      await saveChangedSettings(
        Object.values(ADVANCED_SETTING_GROUPS)
          .flat()
          .filter(key => isSettingSupported(key))
          .map(key => [key, Boolean(formData.object[key])])
      );
    }
  };

  game.settings.registerMenu(MODULE_ID, "configure", {
    name: "ADVENTURER_HUD.Settings.Advanced.Name",
    hint: "ADVENTURER_HUD.Settings.Advanced.Hint",
    label: "ADVENTURER_HUD.Settings.Advanced.Label",
    icon: "fa-solid fa-sliders",
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

    async _prepareContext() {
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      if (this.options?.window) {
        this.options.window.title = t("Settings.Reset.Name");
      }
      return {
        confirmLabel: t("Settings.Reset.Confirm"),
        resetLabel: t("Settings.Reset.Label")
      };
    }

    static async #onSubmit() {
      await resetSettings();
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      ui.notifications.info(t("Settings.Reset.Done"));
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

  for (const key of ["configure", "reset"]) {
    const settingId = `${MODULE_ID}.${key}`;
    const control = element.querySelector(
      `[data-key="${settingId}"], [data-setting-id="${settingId}"], [name="${settingId}"]`
    );
    const row = control?.closest?.(".form-group");
    row?.parentElement?.append(row);
  }
}

export async function localizeSettingsRows(root) {
  const element = root?.querySelector ? root : root?.[0];
  if (!element) return;

  const { t } = await createModuleTranslator({
    language: getSetting(SETTINGS.language),
    i18n: game.i18n
  });

  for (const key of Object.keys(SETTING_DEFINITIONS)) {
    const settingId = `${MODULE_ID}.${key}`;
    const control = element.querySelector(
      `[data-key="${settingId}"], [data-setting-id="${settingId}"], [name="${settingId}"]`
    );
    const row = control?.closest?.(".form-group");
    if (!row) continue;

    const label = row.querySelector("label");
    if (label) label.textContent = t(`Settings.${key}.Name`);
    const hint = row.querySelector(".hint");
    if (hint) hint.textContent = t(`Settings.${key}.Hint`);

    for (const [value, choice] of Object.entries(
      SETTING_DEFINITIONS[key].choices ?? {}
    )) {
      const option = row.querySelector(`option[value="${value}"]`);
      if (option) {
        option.textContent = choice.startsWith("ADVENTURER_HUD.")
          ? t(choice.slice("ADVENTURER_HUD.".length))
          : choice;
      }
    }
  }

  for (const [key, section] of [
    ["configure", "Advanced"],
    ["reset", "Reset"]
  ]) {
    const settingId = `${MODULE_ID}.${key}`;
    const control = element.querySelector(
      `[data-key="${settingId}"], [data-setting-id="${settingId}"], [name="${settingId}"]`
    );
    const row = control?.closest?.(".form-group");
    if (!row) continue;
    const label = row.querySelector("label, h4");
    if (label) label.textContent = t(`Settings.${section}.Name`);
    const hint = row.querySelector(".hint");
    if (hint) hint.textContent = t(`Settings.${section}.Hint`);
    const button = row.querySelector("button");
    if (button) {
      const textNodes = [];
      const visit = node => {
        if (node.nodeType === 3 && node.textContent.trim())
          textNodes.push(node);
        for (const child of node.childNodes ?? []) visit(child);
      };
      visit(button);
      const textNode = textNodes.at(-1);
      if (textNode) textNode.textContent = t(`Settings.${section}.Label`);
      else
        button.append(document.createTextNode(t(`Settings.${section}.Label`)));
    }
  }
}

export async function resetSettings() {
  await saveChangedSettings([
    ...Object.entries(SETTING_DEFAULTS),
    [SETTINGS.proficientSkillsOnly, true]
  ]);
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
