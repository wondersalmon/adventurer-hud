import { SettingsDraftController } from "./settings-draft.js";
import { ChangelogSettingsController } from "./settings-changelog.js";
import { SettingsSearchController } from "./settings-search.js";
import {
  updateCardPreviews,
  updateMechanicsPreviews
} from "./settings-card-preview.js";
import { AppearanceSettingsController } from "./settings-appearance.js";
import { createIntegrityApplication } from "./integrity-ui.js";
import { MODULE_ID } from "./module-id.js";
import { createModuleTranslator } from "./localization.js";
import {
  booleanSettingsEntries,
  prepareSettingsGroups
} from "./settings-form.js";
import {
  getConfigureSettingGroups,
  CARD_DETAIL_PRESETS,
  HUD_TEXT_PIXELS,
  HIDDEN_EFFECT_LIMIT
} from "./settings-schema.js";
import {
  hiddenEffectChoices,
  EffectSettingsController
} from "./settings-effects.js";
import { reportFailure } from "./diagnostics.js";
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
    openResetSettings: (gmOnly, integrityApp) => {
      const confirmation = new ResetSettingsApplication();
      confirmation.settingsApp = { constructor: { gmOnly } };
      confirmation.settingsChanged = () => integrityApp?.settingsChanged?.();
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

  SettingsApplication = class AdventurerHudSettings extends (
    HandlebarsApplicationMixin(ApplicationV2)
  ) {
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-settings",
      tag: "form",
      classes: ["adventurer-hud-settings"],
      window: {
        icon: "fa-solid fa-dice-d20",
        title: "ADVENTURER_HUD.Settings.Advanced.Name",
        resizable: true
      },
      position: { width: 820, height: 680 },
      form: { closeOnSubmit: false, handler: this.#onSubmit },
      actions: {
        showalleffects: function () {
          if (this.effectsController) this.effectsController.clear();
          else {
            for (const input of this.element?.querySelectorAll(
              '[name="hiddenEffects"]'
            ) ?? [])
              input.checked = false;
            const filter = this.element?.querySelector('[name="statusFilter"]');
            if (filter) filter.value = "all";
            this.validateEffectSelection();
          }
          this.draftController?.change();
        },
        cancel: function () {
          return this.close();
        }
      }
    };

    static PARTS = {
      form: { template: "modules/adventurer-hud/templates/settings.hbs" }
    };

    static settingsGroups = () =>
      getConfigureSettingGroups(Boolean(game.user?.isGM));
    static settingsTitle = "Settings.Advanced.Name";

    async render(...args) {
      if (this.constructor.gmOnly && !game.user?.isGM) return this;
      const { t } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      this.settingsWindowTitle = t(this.constructor.settingsTitle);
      return super.render(...args);
    }

    get title() {
      return this.settingsWindowTitle ?? super.title;
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      this.draftController = null;
      this.dependencyElement?.removeEventListener(
        "change",
        this.dependencyListener
      );
      this.dependencyElement?.removeEventListener(
        "input",
        this.dependencyListener
      );
      this.dependencyElement = this.element;
      this.searchController?.dispose();
      this.effectsController?.dispose();
      this.effectsController = new EffectSettingsController(this.element, {
        selected: getSetting(SETTINGS.hiddenEffects),
        savedFilter: getSetting(SETTINGS.statusFilter),
        t:
          this.settingsTranslator ??
          (key => game.i18n.localize(`ADVENTURER_HUD.${key}`)),
        onError: error =>
          reportFailure("settings.effects", error, { notify: false })
      });
      this.changelogController?.dispose();
      this.changelogController = new ChangelogSettingsController(this.element, {
        version: game.modules?.get(MODULE_ID)?.version,
        language: this.settingsLanguage,
        t:
          this.settingsTranslator ??
          (key => game.i18n.localize(`ADVENTURER_HUD.${key}`)),
        onError: error =>
          reportFailure("settings.changelog", error, { notify: false })
      });
      const previewCards = () => {
        updateCardPreviews(
          this.element,
          this.settingsTranslator ??
            (key => game.i18n.localize(`ADVENTURER_HUD.${key}`))
        );
        updateMechanicsPreviews(
          this.element,
          this.settingsTranslator ??
            (key => game.i18n.localize(`ADVENTURER_HUD.${key}`))
        );
      };
      previewCards();
      const previewMechanics = () =>
        updateMechanicsPreviews(
          this.element,
          this.settingsTranslator ??
            (key => game.i18n.localize(`ADVENTURER_HUD.${key}`))
        );
      previewMechanics();
      this.appearanceController?.dispose();
      this.appearanceController = new AppearanceSettingsController(
        this.element
      );
      const handleDependencies = event => {
        const target = event.target;
        if (target?.name === SETTINGS.language) {
          const language =
            target.value === "auto" ? game.i18n.lang : target.value;
          for (const link of this.element.querySelectorAll(
            '[data-guide-file]:not([data-guide-file=""])'
          ))
            link.href = `https://github.com/wondersalmon/adventurer-hud/blob/main/docs/${link.dataset.guideFile}${language === "ru" ? ".ru" : ""}.md`;
          return;
        }
        if (target?.matches?.("[data-font-size-number]")) {
          if (target.checkValidity?.() === false) return;
          const slider = this.element.querySelector('[name="fontSizePx"]');
          slider.value = target.value;
          this.dependencyListener({ target: slider });
          return;
        }
        if (
          target?.name === SETTINGS.hiddenEffects ||
          target?.name === SETTINGS.statusFilter ||
          target?.matches?.("[data-effect-search]")
        ) {
          this.effectsController.change(target);
          return;
        }
        if (
          [SETTINGS.cardDetailFields, SETTINGS.gmCardDetailFields].includes(
            target?.name
          )
        ) {
          const selected = [
            ...this.element.querySelectorAll(`[name="${target.name}"]`)
          ]
            .filter(input => input.checked)
            .map(input => input.value);
          const preset = Object.entries(CARD_DETAIL_PRESETS).find(
            ([, fields]) =>
              fields.length === selected.length &&
              fields.every(field => selected.includes(field))
          )?.[0];
          this.element.querySelector(
            `[name="${target.name === SETTINGS.cardDetailFields ? SETTINGS.cardDetails : SETTINGS.gmCardDetails}"]`
          ).value = preset ?? "custom";
          previewCards();
          return;
        }
        if (
          [SETTINGS.cardDetails, SETTINGS.gmCardDetails].includes(target?.name)
        ) {
          if (target.value !== "custom")
            for (const input of this.element.querySelectorAll(
              `[name="${target.name === SETTINGS.cardDetails ? SETTINGS.cardDetailFields : SETTINGS.gmCardDetailFields}"]`
            ))
              input.checked = CARD_DETAIL_PRESETS[target.value].includes(
                input.value
              );
          previewCards();
          return;
        }
        if ([SETTINGS.fontFamily, SETTINGS.fontStyle].includes(target?.name)) {
          previewCards();
          return;
        }
        if (target?.type === "color") {
          const output = target
            .closest(".ws-settings-color")
            ?.querySelector("output");
          if (output) output.textContent = target.value.toUpperCase();
          return;
        }
        if (target?.name === SETTINGS.fontSize) {
          const slider = this.element.querySelector('[name="fontSizePx"]');
          if (HUD_TEXT_PIXELS[target.value] !== undefined) {
            slider.value = HUD_TEXT_PIXELS[target.value];
            this.dependencyListener({ target: slider, preset: true });
          }
        }
        if (target?.type === "range") {
          const output = target
            .closest(".ws-settings-range")
            ?.querySelector("output");
          if (output) output.textContent = target.value;
          if (target.name === SETTINGS.fontSizePx && !event.preset)
            this.element.querySelector('[name="fontSize"]').value = "custom";
          const min = Number(target.min),
            max = Number(target.max);
          const progress =
            max > min
              ? Math.max(
                  0,
                  Math.min(1, (Number(target.value) - min) / (max - min))
                )
              : 0;
          target.style.setProperty(
            "--ws-settings-progress",
            `${progress * 100}%`
          );
          if (target.name === SETTINGS.fontSizePx) {
            const number = this.element.querySelector(
              "[data-font-size-number]"
            );
            if (number) number.value = target.value;
            previewCards();
          }
          return;
        }
        if (target?.name === SETTINGS.theme) {
          const form = this.element.querySelector(".ws-settings-form");
          if (form) form.dataset.settingsTheme = target.value;
          previewCards();
          return;
        }
        if (
          ![
            SETTINGS.showCompanions,
            SETTINGS.playerFooter,
            SETTINGS.gmEnabled,
            SETTINGS.accentPreset,
            SETTINGS.twoColumnMode
          ].includes(target?.name)
        )
          return;
        for (const control of this.element.querySelectorAll(
          `[data-parent-key="${target.name}"]`
        ))
          control.disabled =
            target.name === SETTINGS.twoColumnMode
              ? target.value !== "manual"
              : target.name === SETTINGS.accentPreset
                ? target.value !== "custom"
                : !target.checked;
      };
      this.dependencyListener = event => {
        handleDependencies(event);
        if (event.target?.name === "gmActionDisplay") previewMechanics();
        if (
          [
            SETTINGS.theme,
            SETTINGS.accentPreset,
            SETTINGS.accentColor,
            SETTINGS.customThemeAccent,
            SETTINGS.customThemeBackground,
            SETTINGS.customThemeText,
            SETTINGS.showVisualEffects,
            SETTINGS.hpAnimation,
            SETTINGS.turnAnimation,
            SETTINGS.fontSize,
            SETTINGS.fontSizePx,
            SETTINGS.fontFamily,
            SETTINGS.fontStyle
          ].includes(event.target?.name)
        )
          this.appearanceController.update();
        this.draftController?.change();
      };
      this.element?.addEventListener("change", this.dependencyListener);
      this.element?.addEventListener("input", this.dependencyListener);
      for (const target of this.element?.querySelectorAll?.(
        'input[type="range"]'
      ) ?? [])
        this.dependencyListener({ target, preset: true });
      this.tabElement?.removeEventListener("click", this.tabListener);
      this.tabElement?.removeEventListener("keydown", this.tabListener);
      this.tabElement = this.element;
      const tabs = [...(this.element?.querySelectorAll('[role="tab"]') ?? [])];
      const activate = tab => {
        if (!tab) return;
        if (tab.dataset.settingsDefaultChild)
          tab =
            tabs.find(
              button =>
                button.dataset.settingsTab === tab.dataset.settingsDefaultChild
            ) ?? tab;
        this.activeSettingsTab = tab.dataset.settingsTab;
        const parent = tab.dataset.settingsParent || this.activeSettingsTab;
        for (const button of tabs) {
          if (button.dataset.settingsParent)
            button.hidden = button.dataset.settingsParent !== parent;
          if (button.dataset.settingsChildren === "true")
            button.setAttribute(
              "aria-expanded",
              String(button.dataset.settingsTab === parent)
            );
          const selected = button === tab;
          button.setAttribute("aria-selected", String(selected));
          button.tabIndex = selected ? 0 : -1;
        }
        for (const panel of this.element.querySelectorAll('[role="tabpanel"]'))
          panel.hidden = panel.dataset.settingsPanel !== this.activeSettingsTab;

        if (this.activeSettingsTab === "changelog")
          void this.changelogController.load();
        if (this.activeSettingsTab === "changelog") {
          if (this.changelogNotice && this.changelogVersion)
            void saveChangedSettings([
              [SETTINGS.changelogSeenVersion, this.changelogVersion]
            ]).catch(error =>
              reportFailure("settings.changelog.seen", error, { notify: false })
            );
          this.changelogNotice = false;
          tab.classList.remove("ws-settings-changelog-new");
        }
        if (this.activeSettingsTab === "effects") {
          const effects = this.effectsController;
          const draft = this.draftController;
          const revision = draft.revision;
          void effects
            .load()
            .then(() => {
              if (
                this.effectsController === effects &&
                this.draftController === draft
              )
                draft.reconcileEffects(revision);
            })
            .catch(() => {});
        }
        if (this.activeSettingsTab === "troubleshooting") {
          this.integrityApp ??= new IntegrityApplication();
          this.integrityApp.settingsChanged = async () => {
            if (!this.rendered) return;
            this.integrityApp.readDiagnosticInput();
            await this.render({ force: true });
          };
          const host = this.element.querySelector("[data-integrity-host]");
          if (host) {
            if (this.integrityRenderHost !== host) {
              this.integrityRenderHost = host;
              this.integrityRenderReady = this.integrityApp
                .attach(host)
                .catch(error =>
                  reportFailure("integrity.ui", error, { notify: false })
                );
            }
            return this.integrityRenderReady;
          }
        }
      };
      this.tabListener = event => {
        if (
          event.type === "click" &&
          event.target?.closest?.("[data-copy-custom-theme]")
        )
          this.draftController?.change();
        const tab = event.target?.closest?.('[role="tab"]');
        if (!tabs.includes(tab)) return;
        if (event.type === "click") return activate(tab);
        const visibleTabs = tabs.filter(
          button =>
            !button.hidden &&
            button.dataset.settingsDefaultChild !== this.activeSettingsTab
        );
        const index = visibleTabs.indexOf(tab);
        const next = {
          ArrowDown: (index + 1) % visibleTabs.length,
          ArrowRight: (index + 1) % visibleTabs.length,
          ArrowUp: (index + visibleTabs.length - 1) % visibleTabs.length,
          ArrowLeft: (index + visibleTabs.length - 1) % visibleTabs.length,
          Home: 0,
          End: visibleTabs.length - 1
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        activate(visibleTabs[next]);
        tabs
          .find(button => button.dataset.settingsTab === this.activeSettingsTab)
          ?.focus();
      };
      this.element?.addEventListener("click", this.tabListener);
      this.element?.addEventListener("keydown", this.tabListener);
      this.selectSettingsTab = id =>
        activate(tabs.find(tab => tab.dataset.settingsTab === id));
      this.searchController = new SettingsSearchController(this.element, {
        activate: this.selectSettingsTab,
        translations: this.settingsSearchTranslators ?? [],
        t:
          this.settingsTranslator ??
          (key => game.i18n.localize(`ADVENTURER_HUD.${key}`))
      });
      this.validateEffectSelection();
      this.draftController = new SettingsDraftController(this.element, {
        effects: this.effectsController,
        t:
          this.settingsTranslator ??
          (key => game.i18n.localize("ADVENTURER_HUD." + key))
      });
      activate(
        tabs.find(
          tab =>
            tab.dataset.settingsTab ===
            (this.activeSettingsTab ?? this.constructor.defaultSettingsTab)
        ) ?? tabs[0]
      );
      if (!this.searchFocused) {
        this.searchFocused = true;
        this.element
          ?.querySelector("[data-settings-search]")
          ?.focus({ preventScroll: true });
      }
    }

    validateEffectSelection() {
      if (this.effectsController) return this.effectsController.update();
      const filter = this.element?.querySelector('[name="statusFilter"]');
      const count =
        this.element?.querySelectorAll('[name="hiddenEffects"]:checked')
          .length ?? 0;
      filter?.setCustomValidity?.(
        filter.value === "custom" && count > HIDDEN_EFFECT_LIMIT
          ? (this.effectLimitMessage ?? "")
          : ""
      );
    }

    async close(options = {}) {
      if (this.closeRequest) return this.closeRequest;
      this.closeRequest = this.closeWithDraft(options);
      try {
        return await this.closeRequest;
      } finally {
        this.closeRequest = null;
      }
    }

    async closeWithDraft(options) {
      if (this.saving) return this;
      if (this.draftController?.dirty) {
        const t =
          this.settingsTranslator ??
          (key => game.i18n.localize("ADVENTURER_HUD." + key));
        const root = this.element;
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title: t("Settings.Draft.Title") },
          content:
            "<p>" +
            foundry.utils.escapeHTML(t("Settings.Draft.Question")) +
            "</p>",
          buttons: [
            {
              action: "save",
              label: t("Settings.SaveClose"),
              callback: () => "save"
            },
            {
              action: "discard",
              label: t("Settings.Draft.Discard"),
              callback: () => "discard"
            },
            {
              action: "stay",
              label: t("Settings.Draft.Stay"),
              default: true,
              callback: () => "stay"
            }
          ],
          rejectClose: false
        });
        if (this.element !== root || !choice || choice === "stay") return this;
        if (choice === "save") {
          if (this.element.reportValidity?.() === false) return this;
          await this.saveDraft();
          if (this.draftController?.dirty) return this;
        }
      }
      return super.close(options);
    }

    saveDraft() {
      return this.constructor.DEFAULT_OPTIONS.form.handler.call(
        this,
        null,
        this.element,
        { object: this.draftController.values() }
      );
    }

    _onClose(options) {
      this.appearanceController?.dispose();
      this.searchController?.dispose();
      this.changelogController?.dispose();
      this.effectsController?.dispose();
      if (this.integrityApp) this.integrityApp.settingsChanged = null;
      this.integrityApp?.detach();
      this.dependencyElement?.removeEventListener(
        "change",
        this.dependencyListener
      );
      this.dependencyElement?.removeEventListener(
        "input",
        this.dependencyListener
      );
      this.tabElement?.removeEventListener("click", this.tabListener);
      this.tabElement?.removeEventListener("keydown", this.tabListener);
      this.dependencyElement = this.tabElement = null;
      return super._onClose?.(options);
    }

    async _prepareContext() {
      const gmOnly = Boolean(this.constructor.gmOnly);
      if (gmOnly && !game.user?.isGM) throw new Error("GM only");
      const { t, language } = await createModuleTranslator({
        language: getSetting(SETTINGS.language),
        i18n: game.i18n
      });
      this.settingsSearchTranslators = (
        await Promise.all(
          ["en", "ru"].map(language =>
            createModuleTranslator({ language, i18n: game.i18n })
          )
        )
      ).map(translator => translator.t);
      this.settingsTranslator = t;
      this.settingsLanguage = language;
      this.changelogVersion = game.modules?.get(MODULE_ID)?.version ?? "";
      this.changelogNotice ??= Boolean(
        this.changelogVersion &&
        getSetting(SETTINGS.changelogSeenVersion) !== this.changelogVersion
      );
      this.effectLimitMessage = t("Settings.hiddenEffects.Limit").replace(
        "{count}",
        String(HIDDEN_EFFECT_LIMIT)
      );
      if (this.options?.window) {
        this.options.window.title = t(this.constructor.settingsTitle);
      }
      const groups = prepareSettingsGroups({
        groups: this.constructor.settingsGroups(),
        hiddenEffectChoices: hiddenEffectChoices({
          selected: getSetting(SETTINGS.hiddenEffects),
          includeActors: false,
          t
        }),
        idPrefix: this.id ?? this.constructor.DEFAULT_OPTIONS.id,
        readValue: getSetting,
        t,
        language
      });
      return {
        savedLabel: t("Settings.Draft.Saved"),
        applyLabel: t("Settings.Apply"),
        saveCloseLabel: t("Settings.SaveClose"),
        idPrefix: this.id ?? this.constructor.DEFAULT_OPTIONS.id,
        troubleshootingLabel: t("Settings.Troubleshooting.Name"),
        theme: getSetting(SETTINGS.theme),
        navigationLabel: t("Settings.Navigation"),
        changelogLabel: t("Settings.Changelog.Name"),
        searchLabel: t("Settings.Search.Name"),
        searchPlaceholder: t("Settings.Search.Placeholder"),
        searchClear: t("Settings.Search.Clear"),
        changelogNew: this.changelogNotice,
        changelogNoticeClass: this.changelogNotice
          ? "ws-settings-changelog-new"
          : "",
        changelogNewLabel: t("Settings.Changelog.New"),
        changelogLoading: t("Settings.Changelog.Loading"),
        changelogLanguageLabel: t("Settings.Changelog.Language"),
        helpLabel: t("Settings.Help.Name"),
        helpHint: t("Settings.Help.Hint"),
        closeLabel: t("Settings.Close"),
        helpSections: [
          {
            label: t("Settings.Help.Guides"),
            links: [
              ["player-guide", "Player", "fa-user"],
              ["companions-guide", "Companions", "fa-paw"],
              ["layout-guide", "Layout", "fa-table-columns"],
              ...(game.user?.isGM ? [["gm-guide", "GM", "fa-dragon"]] : [])
            ].map(([file, key, icon]) => ({
              label: t(`Settings.Help.${key}`),
              hint: t(`Settings.Help.${key}Hint`),
              icon,
              guideFile: file,
              url: `https://github.com/wondersalmon/adventurer-hud/blob/main/docs/${file}${language === "ru" ? ".ru" : ""}.md`
            }))
          },
          {
            label: t("Settings.Help.Project"),
            links: [
              ["", "Repository", "fa-code"],
              ["/issues", "Issues", "fa-bug"],
              [
                "https://www.reddit.com/message/compose/?to=Outrageous_Cash1694&subject=Adventurer%20HUD%20Feedback",
                "Reddit",
                "fa-envelope"
              ]
            ].map(([path, key, icon]) => ({
              label: t(`Settings.Help.${key}`),
              hint: t(`Settings.Help.${key}Hint`),
              icon,
              url: path.startsWith("https://")
                ? path
                : `https://github.com/wondersalmon/adventurer-hud${path}`
            }))
          }
        ],
        saveLabel: t("Settings.Save"),
        resetLabel: t("Settings.Reset.Label"),
        groups
      };
    }

    static async #onSubmit(_event, _form, formData) {
      if (this?.saving) return;
      const gmOnly = Boolean(this?.constructor?.gmOnly);
      if (gmOnly && !game.user?.isGM) return;
      const submitted = { ...formData.object };
      // Hidden refinement controls retain their draft values, even in native
      // form serializers that omit unchecked or hidden controls.
      for (const key of [
        SETTINGS.customThemeInitialized,
        SETTINGS.hpAnimation,
        SETTINGS.turnAnimation
      ]) {
        const input = this?.element?.querySelector?.(`[name="${key}"]`);
        if (input)
          submitted[key] =
            input.type === "checkbox" ? input.checked : input.value;
      }
      const list = this?.element?.querySelector?.("[data-hidden-effects-list]");
      if (
        submitted[SETTINGS.statusFilter] === "custom" &&
        this?.effectsController?.implicitConditions
      )
        await this.effectsController.load();
      for (const key of [
        SETTINGS.cardDetailFields,
        SETTINGS.gmCardDetailFields
      ]) {
        const fields = this?.element?.querySelectorAll?.(`[name="${key}"]`);
        if (fields?.length)
          submitted[key] = [...fields]
            .filter(input => input.checked)
            .map(input => input.value);
      }
      if (list)
        submitted[SETTINGS.hiddenEffects] =
          submitted[SETTINGS.statusFilter] === "custom"
            ? this.effectsController
              ? [...this.effectsController.selected].sort()
              : [...list.querySelectorAll("input:checked")].map(
                  input => input.value
                )
            : [];
      if (this?.saving) return;
      if (this) this.saving = true;
      const saveRoot = this?.element;
      const revision = this?.draftController?.revision;
      const previousLanguage = getSetting(SETTINGS.language);
      try {
        await saveChangedSettings(
          [
            ...booleanSettingsEntries(
              (
                this?.constructor?.settingsGroups ??
                (() => getConfigureSettingGroups(Boolean(game.user?.isGM)))
              )(),
              submitted
            ),
            ...(Object.hasOwn(submitted, SETTINGS.customThemeInitialized)
              ? [
                  [
                    SETTINGS.customThemeInitialized,
                    Boolean(submitted[SETTINGS.customThemeInitialized])
                  ]
                ]
              : [])
          ],
          { rollbackOnError: true }
        );
        if (
          this?.element === saveRoot &&
          this?.draftController?.revision === revision
        )
          this?.draftController?.commit();
      } finally {
        if (this) this.saving = false;
      }
      if (
        _event?.submitter?.matches?.("[data-settings-save-close]") &&
        !this.draftController?.dirty
      )
        await this.close();
      else if (
        previousLanguage !== getSetting(SETTINGS.language) &&
        this.element === saveRoot &&
        !this.draftController?.dirty
      ) {
        this.integrityApp?.readDiagnosticInput();
        await this.render({ force: true });
      }
    }
  };

  GmSettingsApplication = class extends SettingsApplication {
    static gmOnly = true;
    static defaultSettingsTab = "gm";
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-gm-settings",
      window: { title: "ADVENTURER_HUD.Settings.GM.Name" }
    };
  };
  game.settings.registerMenu(MODULE_ID, "configure", {
    name: "ADVENTURER_HUD.Settings.Advanced.Name",
    hint: "ADVENTURER_HUD.Settings.Advanced.Hint",
    label: "ADVENTURER_HUD.Settings.Advanced.Label",
    icon: "fa-solid fa-sliders",
    type: SettingsApplication,
    restricted: false
  });
  game.settings.registerMenu(MODULE_ID, "troubleshooting", {
    name: "ADVENTURER_HUD.Settings.Troubleshooting.Name",
    hint: "ADVENTURER_HUD.Settings.Troubleshooting.Hint",
    label: "ADVENTURER_HUD.Settings.Troubleshooting.Label",
    icon: "fa-solid fa-wrench",
    type: class extends SettingsApplication {
      static defaultSettingsTab = "troubleshooting";
    },
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
      await this.settingsChanged?.();
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

export function openConfigureSettings(tab) {
  if (!SettingsApplication) return;
  const current = [...(foundry.applications.instances?.values?.() ?? [])].find(
    app => app instanceof SettingsApplication && app.rendered
  );
  if (current) {
    if (tab) current.selectSettingsTab?.(tab);
    current.bringToFront?.();
    return current;
  }
  const app = new SettingsApplication();
  if (tab) app.activeSettingsTab = tab;
  return app.render({ force: true });
}

export function openTroubleshooting() {
  return openConfigureSettings("troubleshooting");
}

export function createTroubleshootingController() {
  return new IntegrityApplication();
}
