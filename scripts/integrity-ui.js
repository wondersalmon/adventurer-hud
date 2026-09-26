import { checkIntegrity, repairSavedData } from "./integrity.js";
import { createModuleTranslator } from "./localization.js";
import { MODULE_ID } from "./module-id.js";
import { SETTINGS, getSettingDefinitions } from "./settings-schema.js";

export function createIntegrityApplication() {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  return class AdventurerHudIntegrity extends HandlebarsApplicationMixin(
    ApplicationV2
  ) {
    static DEFAULT_OPTIONS = {
      id: "adventurer-hud-integrity",
      classes: ["adventurer-hud-settings"],
      window: {
        title: "ADVENTURER_HUD.Integrity.Title",
        icon: "fa-solid fa-wrench"
      },
      position: { width: 520, height: "auto" },
      actions: {
        check: async function () {
          return this.runCheck();
        },
        repair: async function () {
          if (this.busy || !this.report?.issues.some(issue => issue.repairable))
            return;
          this.busy = true;
          await this.render({ force: true });
          try {
            this.repaired = await repairSavedData();
            this.report = await checkIntegrity();
          } catch (error) {
            this.failure = true;
            console.error("Adventurer HUD | repair failed", error);
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
        console.error("Adventurer HUD | integrity check failed", error);
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
      if (this.options?.window)
        this.options.window.title = t("Integrity.Title");
      const issues = this.report?.issues ?? [];
      return {
        intro: t("Integrity.Intro"),
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
