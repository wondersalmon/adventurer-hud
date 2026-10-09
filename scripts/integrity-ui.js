import {
  checkIntegrity,
  repairSavedData,
  canRepairIssue
} from "./integrity.js";
import { createModuleTranslator } from "./localization.js";
import { MODULE_ID } from "./module-id.js";
import { SETTINGS, getSettingDefinitions } from "./settings-schema.js";
import { SettingsSaveError } from "./settings-access.js";
import { settingsBackup, restoreSettingsBackup } from "./settings-backup.js";
import { flushWindowGeometry } from "./window-geometry.js";
import { replacePanelPreferences } from "./hud/panel-preferences.js";
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
        resetplayerwindow: async function () {
          if (
            await foundry.applications.api.DialogV2.confirm({
              window: { title: this.t("Troubleshooting.ResetPlayerWindow") },
              content: `<p>${this.t("Troubleshooting.ResetWindowHint")}</p>`
            })
          )
            await resetWindowPositions?.("player");
        },
        resetgmwindow: async function () {
          if (!game.user?.isGM) return;
          if (
            await foundry.applications.api.DialogV2.confirm({
              window: { title: this.t("Troubleshooting.ResetGmWindow") },
              content: `<p>${this.t("Troubleshooting.ResetWindowHint")}</p>`
            })
          )
            await resetWindowPositions?.("gm");
        },
        resetall: async function () {
          if (
            await foundry.applications.api.DialogV2.confirm({
              window: { title: this.t("Troubleshooting.ResetAll") },
              content: `<p>${this.t("Troubleshooting.ResetAllHint")}</p>`
            })
          ) {
            await flushWindowGeometry();
            await replacePanelPreferences(async () => {
              const { saveChangedSettings, getSettingDefaults } =
                await import("./settings-access.js");
              await saveChangedSettings(
                [
                  ...Object.entries(getSettingDefaults()),
                  [SETTINGS.proficientSkillsOnly, true],
                  [SETTINGS.panelStates, {}]
                ],
                { rollbackOnError: true }
              );
              await resetWindowPositions?.("all");
            });
          }
        },
        backupsettings: async function () {
          try {
            const backup = await settingsBackup();
            foundry.utils.saveDataToFile(
              JSON.stringify(backup, null, 2),
              "application/json",
              "adventurer-hud-settings.json"
            );
          } catch (error) {
            reportFailure("settings.backup", error, { t: this.t });
          }
        },
        backuprepair: async function () {
          try {
            const backup = game.settings.get(MODULE_ID, SETTINGS.repairBackup);
            if (!backup?.createdAt || !backup.values) return;
            foundry.utils.saveDataToFile(
              JSON.stringify(
                { module: MODULE_ID, format: 1, settings: backup.values },
                null,
                2
              ),
              "application/json",
              "adventurer-hud-before-repair.json"
            );
          } catch (error) {
            reportFailure("integrity.backup", error, { t: this.t });
          }
        },
        restoresettings: async function () {
          const text = await foundry.applications.api.DialogV2.prompt({
            window: { title: this.t("Troubleshooting.RestoreSettings") },
            content: `<p>${this.t("Troubleshooting.RestoreHint")}</p><input type="file" name="backup" accept=".json,application/json" aria-label="${this.t("Troubleshooting.BackupFile")}">`,
            ok: {
              label: this.t("Troubleshooting.RestoreSettings"),
              callback: async (_event, button) => {
                const file = button.form.elements.backup.files[0];
                if (!file || file.size > 2_000_000)
                  throw new Error("backup-invalid");
                return file.text();
              }
            },
            rejectClose: false
          }).catch(() => {
            ui.notifications.warn(this.t("Troubleshooting.BackupInvalid"));
          });
          if (typeof text !== "string") return;
          try {
            await restoreSettingsBackup(text);
            ui.notifications.info(this.t("Troubleshooting.BackupRestored"));
            await this.render({ force: true });
          } catch (error) {
            const key =
              error instanceof SettingsSaveError
                ? error.rollbackFailedKeys.length
                  ? "Troubleshooting.RestorePartial"
                  : "Troubleshooting.RestoreRolledBack"
                : "Troubleshooting.BackupInvalid";
            ui.notifications.warn(this.t(key));
            reportFailure("settings.restore", error, {
              level: "warn",
              notify: false
            });
          }
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
          if (this.busy || !this.report?.issues.some(canRepairIssue)) return;
          this.busy = true;
          this.failure = false;
          try {
            await this.render({ force: true });
            const repairs = this.report.issues.filter(canRepairIssue);
            const escape = foundry.utils.escapeHTML;
            const accepted = await foundry.applications.api.DialogV2.confirm({
              window: { title: this.t("Integrity.Repair") },
              content: `<p>${escape(this.t("Integrity.ConfirmRepair"))}</p><ul>${repairs
                .flatMap(issue =>
                  (issue.changes?.length
                    ? issue.changes
                    : [{ path: issue.key }]
                  ).map(
                    change =>
                      `<li>${escape(`${issue.key}: ${change.path}`)}</li>`
                  )
                )
                .join("")}</ul>`
            });
            if (!accepted) return;
            this.repaired = await repairSavedData(repairs);
            this.report = await checkIntegrity();
          } catch (error) {
            if (error?.message === "repair-plan-changed") {
              this.report = await checkIntegrity();
              ui.notifications.warn(this.t("Integrity.PlanChanged"));
              return;
            }
            this.failure = true;
            if (error instanceof SettingsSaveError) {
              ui.notifications.warn(
                this.t(
                  error.rollbackFailedKeys.length
                    ? "Integrity.RepairPartial"
                    : "Integrity.RepairRolledBack"
                )
              );
              reportFailure("integrity.repair", error, { notify: false });
            } else reportFailure("integrity.repair", error, { t: this.t });
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
      this.readDiagnosticInput();
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
      this.expandedSections ??= {};
      for (const section of this.element?.querySelectorAll?.(
        "[data-troubleshooting-section]"
      ) ?? [])
        this.expandedSections[section.dataset.troubleshootingSection] =
          section.open;

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
        expandedSections: this.expandedSections,
        expandedSectionAttributes: Object.fromEntries(
          Object.entries(this.expandedSections).map(([key, open]) => [
            key,
            open ? "open" : ""
          ])
        ),
        recordingSectionLabel: t("Troubleshooting.Recording"),
        reportSectionLabel: t("Troubleshooting.Report"),
        integritySectionLabel: t("Troubleshooting.Integrity"),
        resetsLabel: t("Troubleshooting.Resets"),
        reportHelpLabel: t("Troubleshooting.ReportHelp"),
        recordingHint: t("Troubleshooting.RecordingHint"),
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
        resetPlayerWindowLabel: t("Troubleshooting.ResetPlayerWindow"),
        resetGmWindowLabel: t("Troubleshooting.ResetGmWindow"),
        resetAllLabel: t("Troubleshooting.ResetAll"),
        backupLabel: t("Troubleshooting.BackupSettings"),
        restoreLabel: t("Troubleshooting.RestoreSettings"),
        backupSectionLabel: t("Troubleshooting.BackupSection"),
        backupHint: t("Troubleshooting.BackupHint"),
        repairBackupLabel: t("Integrity.DownloadRepairBackup"),
        repairBackupHint: t("Integrity.RepairBackupHint"),
        repairBackupDate:
          game.settings.get(MODULE_ID, SETTINGS.repairBackup)?.createdAt ?? "",
        isGM: Boolean(game.user?.isGM),
        diagnosticsHint: tf("Diagnostics.Hint", {
          count: diagnosticReport().events.length
        }),
        exportLabel: t("Diagnostics.Export"),
        checkLabel: t(this.report ? "Integrity.CheckAgain" : "Integrity.Check"),
        repairLabel: t("Integrity.Repair"),
        closeLabel: t("Window.Close"),
        busy: this.busy,
        canRepair: !this.busy && issues.some(canRepairIssue),
        layoutHint: issues.some(issue => issue.code === "Layout")
          ? t("Integrity.LayoutHint")
          : "",
        checks: this.report
          ? [
              ["Preferences", ["SavedData", "Registration"]],
              ["Layouts", ["Layout", SETTINGS.panelStates]],
              ["Files", ["File"]],
              ["Features", ["Api", "System"]]
            ].map(([name, codes]) => ({
              label: t(`Integrity.Check${name}`),
              status: t(
                issues.some(
                  issue =>
                    codes.includes(issue.code) || codes.includes(issue.key)
                )
                  ? "Integrity.CheckProblems"
                  : "Integrity.CheckPassed"
              )
            }))
          : [],
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
        manualHint: issues.some(issue =>
          ["File", "Api", "System", "Registration"].includes(issue.code)
        )
          ? t("Integrity.ManualHint")
          : "",
        issues: issues.map(issue => ({
          changes:
            issue.changes?.map(change => ({
              path: change.path,
              kind: t(
                change.legacy
                  ? "Integrity.LegacyCleanup"
                  : "Integrity.PreferenceRepair"
              ),
              before: JSON.stringify(change.before).slice(0, 120),
              after: JSON.stringify(change.after).slice(0, 120)
            })) ?? [],
          message: tf(`Integrity.${issue.code}`, {
            detail: Object.hasOwn(getSettingDefinitions(), issue.detail)
              ? t(`Settings.${issue.detail}.Name`)
              : [
                    SETTINGS.panelStates,
                    SETTINGS.windowGeometry,
                    SETTINGS.windowModeSizes,
                    SETTINGS.gmWindowGeometry,
                    SETTINGS.proficientSkillsOnly
                  ].includes(issue.detail)
                ? t(`Integrity.${issue.detail}`)
                : issue.detail
          }),
          action: t(
            issue.repairable
              ? canRepairIssue(issue)
                ? "Integrity.Automatic"
                : "Integrity.GmRequired"
              : issue.code === "Layout"
                ? "Integrity.ReviewLayout"
                : "Integrity.Manual"
          )
        }))
      };
    }
  };
}
