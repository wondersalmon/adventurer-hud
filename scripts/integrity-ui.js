import { checkIntegrity, repairSavedData } from "./integrity.js";
import { createModuleTranslator } from "./localization.js";
import { MODULE_ID } from "./module-id.js";
import { SETTINGS, getSettingDefinitions } from "./settings-schema.js";
import {
  diagnosticReport,
  exportDiagnosticReport,
  reportFailure,
  startDiagnosticRecording,
  stopDiagnosticRecording,
  clearDiagnostics,
  subscribeDiagnostics
} from "./diagnostics.js";

export function createIntegrityApplication({
  openResetSettings,
  resetWindowPositions
} = {}) {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  return class AdventurerHudIntegrity extends HandlebarsApplicationMixin(
    ApplicationV2
  ) {
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-integrity",
      classes: ["adventurer-hud-settings"],
      window: {
        title: "ADVENTURER_HUD.Settings.Troubleshooting.Name",
        icon: "fa-solid fa-wrench"
      },
      position: { width: 520, height: "auto" },
      actions: {
        resetsettings: function () {
          return openResetSettings?.(false);
        },
        resetgm: function () {
          if (game.user?.isGM) return openResetSettings?.(true);
        },
        resetpositions: async function () {
          const accepted = await foundry.applications.api.DialogV2.confirm({
            window: { title: this.t("Troubleshooting.ResetPositions") },
            content: `<p>${this.t("Troubleshooting.ResetPositionsHint")}</p>`
          });
          if (accepted) await resetWindowPositions?.();
        },
        record: async function () {
          this.readDiagnosticInput();
          startDiagnosticRecording();
          await this.render({ force: true });
        },
        mark: async function () {
          this.readDiagnosticInput();
          stopDiagnosticRecording({ mark: true });
          await this.render({ force: true });
        },
        stoprecord: async function () {
          this.readDiagnosticInput();
          stopDiagnosticRecording();
          await this.render({ force: true });
        },
        cleardiagnostics: async function () {
          const comment = this.element?.querySelector?.(
            "[data-diagnostic-comment]"
          );
          const include = this.element?.querySelector?.(
            "[data-diagnostic-errors]"
          );
          if (comment) comment.value = "";
          if (include) include.checked = false;
          clearDiagnostics();
          this.diagnosticComment = "";
          this.includeErrorText = false;
          this.showPreview = false;
          await this.render({ force: true });
        },
        preview: async function () {
          this.readDiagnosticInput();
          this.showPreview = !this.showPreview;
          await this.render({ force: true });
        },
        export: async function () {
          try {
            this.readDiagnosticInput();
            const { filename, eventCount } = await exportDiagnosticReport({
              integrity: this.report ?? null,
              comment: this.diagnosticComment ?? "",
              includeErrorText: this.includeErrorText ?? false
            });
            const key = eventCount
              ? "Diagnostics.DownloadRequested"
              : "Diagnostics.DownloadRequestedEmpty";
            const message =
              this.t?.(key) ?? game.i18n.localize(`ADVENTURER_HUD.${key}`);
            ui.notifications.info(`${message} ${filename}`);
          } catch (error) {
            reportFailure("diagnostics.export", error, { t: this.t });
          }
        },
        check: async function () {
          return this.runCheck();
        },
        repair: async function () {
          if (this.busy || !this.report?.issues.some(issue => issue.repairable))
            return;
          this.busy = true;
          this.failure = false;
          await this.render({ force: true });
          try {
            this.repaired = await repairSavedData();
            this.report = await checkIntegrity();
          } catch (error) {
            this.failure = true;
            reportFailure("integrity.repair", error, { t: this.t });
          } finally {
            this.busy = false;
            await this.render({ force: true });
          }
        },
        close: function () {
          return this.close();
        }
      }
    };
    static PARTS = {
      report: { template: "modules/adventurer-hud/templates/integrity.hbs" }
    };

    readDiagnosticInput() {
      const comment = this.element?.querySelector?.(
        "[data-diagnostic-comment]"
      );
      const include = this.element?.querySelector?.("[data-diagnostic-errors]");
      if (comment) this.diagnosticComment = comment.value.slice(0, 4000);
      if (include) this.includeErrorText = Boolean(include.checked);
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      if (this.unwatchDiagnostics) return;
      this.unwatchDiagnostics = subscribeDiagnostics(() => {
        if (this.rendered) {
          this.readDiagnosticInput();
          void this.render({ force: true }).catch(error =>
            reportFailure("diagnostics.ui", error, { notify: false })
          );
        }
      });
    }

    async close(options) {
      this.unwatchDiagnostics?.();
      this.unwatchDiagnostics = null;
      return super.close(options);
    }

    async runCheck() {
      if (this.busy) return;
      this.busy = true;
      this.failure = false;
      this.repaired = 0;
      await this.render({ force: true });
      try {
        this.report = await checkIntegrity();
      } catch (error) {
        this.failure = true;
        reportFailure("integrity.check", error, { t: this.t });
      } finally {
        this.busy = false;
        await this.render({ force: true });
      }
    }

    async _prepareContext() {
      const { t, tf } = await createModuleTranslator({
        language: game.settings.get(MODULE_ID, SETTINGS.language),
        i18n: game.i18n
      });
      this.t = t;
      if (this.options?.window)
        this.options.window.title = t("Settings.Troubleshooting.Name");
      const issues = this.report?.issues ?? [];
      this.readDiagnosticInput();
      const diagnostics = diagnosticReport({
        integrity: this.report ?? null,
        comment: this.diagnosticComment ?? "",
        includeErrorText: this.includeErrorText ?? false
      });
      const serialized = JSON.stringify(diagnostics, null, 2);
      return {
        intro: t("Integrity.Intro"),
        recording: diagnostics.summary.recording,
        recordLabel: t("Diagnostics.Record"),
        markLabel: t("Diagnostics.Mark"),
        stopRecordLabel: t("Diagnostics.Stop"),
        clearDiagnosticsLabel: t("Diagnostics.Clear"),
        previewLabel: t("Diagnostics.Preview"),
        commentLabel: t("Diagnostics.Comment"),
        includeErrorsLabel: t("Diagnostics.IncludeErrors"),
        privacyHint: t("Diagnostics.Privacy"),
        recordingLabel: t("Diagnostics.Recording"),
        sectionsLabel: t("Diagnostics.Sections"),
        recordingStatus: diagnostics.recording
          ? tf("Diagnostics.Period", {
              start: diagnostics.recording.startedAt,
              end: diagnostics.recording.endedAt ?? t("Diagnostics.Recording"),
              reason: diagnostics.recording.reason ?? "active"
            })
          : t("Diagnostics.NotRecording"),
        diagnosticSummary: tf("Diagnostics.Summary", {
          errors: diagnostics.summary.errors,
          refusals: diagnostics.summary.refusals,
          events: diagnostics.summary.history + diagnostics.summary.detail,
          size: Math.ceil(new TextEncoder().encode(serialized).length / 1024),
          dropped: Object.values(diagnostics.dropped).reduce((a, b) => a + b, 0)
        }),
        diagnosticComment: this.diagnosticComment ?? "",
        includeErrorText: this.includeErrorText ?? false,
        preview: this.showPreview ? serialized : "",
        resetSettingsLabel: t("Troubleshooting.ResetSettings"),
        resetGmLabel: t("Troubleshooting.ResetGm"),
        resetPositionsLabel: t("Troubleshooting.ResetPositions"),
        isGM: Boolean(game.user?.isGM),
        diagnosticsHint: tf("Diagnostics.Hint", {
          count: diagnosticReport().events.length
        }),
        exportLabel: t("Diagnostics.Export"),
        checkLabel: t(this.report ? "Integrity.CheckAgain" : "Integrity.Check"),
        repairLabel: t("Integrity.Repair"),
        closeLabel: t("Settings.Cancel"),
        busy: this.busy,
        canRepair: !this.busy && issues.some(issue => issue.repairable),
        summary: t(
          this.busy
            ? "Integrity.Checking"
            : this.failure
              ? "Integrity.Failed"
              : !this.report
                ? "Integrity.NotChecked"
                : issues.length
                  ? "Integrity.Found"
                  : "Integrity.Healthy"
        ),
        repaired: this.repaired
          ? tf("Integrity.Repaired", { count: this.repaired })
          : "",
        manualHint: issues.some(issue => !issue.repairable)
          ? t("Integrity.ManualHint")
          : "",
        issues: issues.map(issue => ({
          message: tf(`Integrity.${issue.code}`, {
            detail: Object.hasOwn(getSettingDefinitions(), issue.detail)
              ? t(`Settings.${issue.detail}.Name`)
              : [
                    SETTINGS.panelStates,
                    SETTINGS.windowGeometry,
                    SETTINGS.gmWindowGeometry,
                    SETTINGS.proficientSkillsOnly
                  ].includes(issue.detail)
                ? t(`Integrity.${issue.detail}`)
                : issue.detail
          }),
          action: t(
            issue.repairable ? "Integrity.Automatic" : "Integrity.Manual"
          )
        }))
      };
    }
  };
}
