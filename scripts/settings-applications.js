import { createIntegrityApplication } from "./integrity-ui.js";
import { MODULE_ID } from "./module-id.js";
import { createModuleTranslator } from "./localization.js";
import {
  booleanSettingsEntries,
  prepareSettingsGroups
} from "./settings-form.js";
import {
  getAdvancedSettingGroups,
  getCompanionSettingGroups,
  getGmSettingGroups
} from "./settings-schema.js";
import {
  getSetting,
  getSettingDefinitions,
  saveChangedSettings,
  resetSettings,
  SETTINGS
} from "./settings-access.js";
import { flushWindowGeometry } from "./window-geometry.js";
let SettingsApplication = null;
let ResetSettingsApplication = null;
let IntegrityApplication = null;
let GmSettingsApplication = null;

export function registerSettingsMenus() {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;

  IntegrityApplication = createIntegrityApplication({
    openResetSettings: gmOnly => {
      const confirmation = new ResetSettingsApplication();
      confirmation.settingsApp = { constructor: { gmOnly } };
      return confirmation.render({ force: true });
    },
    resetWindowPositions: async (mode = "all") => {
      await flushWindowGeometry();
      await saveChangedSettings([
        ...(mode !== "gm"
          ? [
              [SETTINGS.pinWindow, false],
              [SETTINGS.windowGeometry, {}],
              [SETTINGS.windowModeSizes, {}],
              [
                SETTINGS.playerColumnRatio,
                getSettingDefinitions()[SETTINGS.playerColumnRatio].default
              ]
            ]
          : []),
        ...(mode !== "player" && game.user?.isGM
          ? [
              [SETTINGS.gmPinWindow, false],
              [SETTINGS.gmWindowGeometry, {}]
            ]
          : [])
      ]);
      const app = globalThis.__adventurerHud?.app;
      const isGm = Boolean(app?.hudGmActive);
      if (app?.rendered && (mode === "all" || isGm === (mode === "gm"))) {
        if (app.hudStowed) await app.close({ hudForce: true });
        else await app.hudActions?.resetwindow?.call(app);
      }
    }
  });
  game.settings.registerMenu(MODULE_ID, "troubleshooting", {
    name: "ADVENTURER_HUD.Settings.Troubleshooting.Name",
    hint: "ADVENTURER_HUD.Settings.Troubleshooting.Hint",
    label: "ADVENTURER_HUD.Settings.Troubleshooting.Label",
    icon: "fa-solid fa-wrench",
    type: IntegrityApplication,
    restricted: false
  });

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
      form: { closeOnSubmit: true, handler: this.#onSubmit },
      actions: {}
    };

    static PARTS = {
      form: { template: "modules/adventurer-hud/templates/settings.hbs" }
    };

    static settingsGroups = getAdvancedSettingGroups;
    static settingsTitle = "Settings.Advanced.Name";

    async render(...args) {
      if (this.constructor.gmOnly && !game.user?.isGM) return this;
      return super.render(...args);
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      this.dependencyElement?.removeEventListener(
        "change",
        this.dependencyListener
      );
      this.dependencyElement?.removeEventListener(
        "input",
        this.dependencyListener
      );
      this.dependencyElement = this.element;
      this.dependencyListener = event => {
        const target = event.target;
        if (target?.type === "range") {
          const output = target
            .closest(".ws-settings-range")
            ?.querySelector("output");
          if (output) output.textContent = target.value;
          return;
        }
        if (
          ![SETTINGS.showCompanions, SETTINGS.gmEnabled].includes(target?.name)
        )
          return;
        for (const control of this.element.querySelectorAll(
          `[data-parent-key="${target.name}"]`
        ))
          control.disabled = !target.checked;
      };
      this.element?.addEventListener("change", this.dependencyListener);
      this.element?.addEventListener("input", this.dependencyListener);
      for (const target of this.element?.querySelectorAll?.(
        'input[type="range"]'
      ) ?? [])
        this.dependencyListener({ target });
    }

    async _prepareContext() {
      const gmOnly = Boolean(this.constructor.gmOnly);
      if (gmOnly && !game.user?.isGM) throw new Error("GM only");
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      if (this.options?.window) {
        this.options.window.title = t(this.constructor.settingsTitle);
      }
      return {
        saveLabel: t("Settings.Save"),
        resetLabel: t("Settings.Reset.Label"),
        groups: prepareSettingsGroups({
          groups: this.constructor.settingsGroups(),
          readValue: getSetting,
          t
        })
      };
    }

    static async #onSubmit(_event, _form, formData) {
      const gmOnly = Boolean(this?.constructor?.gmOnly);
      if (gmOnly && !game.user?.isGM) return;
      await saveChangedSettings(
        booleanSettingsEntries(
          (this?.constructor?.settingsGroups ?? getAdvancedSettingGroups)(),
          formData.object
        )
      );
    }
  };

  GmSettingsApplication = class extends SettingsApplication {
    static gmOnly = true;
    static settingsGroups = getGmSettingGroups;
    static settingsTitle = "Settings.GM.Name";
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-gm-settings",
      window: { title: "ADVENTURER_HUD.Settings.GM.Name" }
    };
  };
  game.settings.registerMenu(MODULE_ID, "gm", {
    name: "ADVENTURER_HUD.Settings.GM.Name",
    hint: "ADVENTURER_HUD.Settings.GM.Hint",
    label: "ADVENTURER_HUD.Settings.GM.Label",
    icon: "fa-solid fa-dragon",
    type: GmSettingsApplication,
    restricted: true
  });

  const CompanionSettingsApplication = class extends SettingsApplication {
    static settingsGroups = getCompanionSettingGroups;
    static settingsTitle = "Settings.Companions.Name";
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-companion-settings",
      window: {
        title: "ADVENTURER_HUD.Settings.Companions.Name",
        icon: "fa-solid fa-paw"
      }
    };
  };
  game.settings.registerMenu(MODULE_ID, "companions", {
    name: "ADVENTURER_HUD.Settings.Companions.Name",
    hint: "ADVENTURER_HUD.Settings.Companions.Hint",
    label: "ADVENTURER_HUD.Settings.Companions.Label",
    icon: "fa-solid fa-paw",
    type: CompanionSettingsApplication,
    restricted: false
  });

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
      },
      actions: {
        cancel: function () {
          return this.close();
        }
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
        cancelLabel: t("Settings.Cancel"),
        resetLabel: t("Settings.Reset.Label")
      };
    }

    static async #onSubmit() {
      await resetSettings({
        gmOnly: Boolean(this?.settingsApp?.constructor?.gmOnly)
      });
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      ui.notifications.info(t("Settings.Reset.Done"));
      if (this.settingsApp?.rendered) {
        await this.settingsApp.render({ force: true });
      }
    }
  };
}

export function moveSettingsMenusToBottom(root) {
  const element = root?.querySelector ? root : root?.[0];
  if (!element) {
    return;
  }

  for (const key of ["configure", "companions", "gm", "troubleshooting"]) {
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

  const definitions = getSettingDefinitions();
  for (const key of Object.keys(definitions)) {
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
      definitions[key].choices ?? {}
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
    ["companions", "Companions"],
    ["gm", "GM"],
    ["troubleshooting", "Troubleshooting"]
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

export function openGmSettings() {
  if (!game.user?.isGM || !GmSettingsApplication) return;
  return new GmSettingsApplication().render({ force: true });
}

export function openTroubleshooting() {
  return IntegrityApplication
    ? new IntegrityApplication().render({ force: true })
    : undefined;
}
