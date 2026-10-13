import { createTroubleshootingController } from "../scripts/settings-applications.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { installSettings } from "../tests/helpers/foundry.mjs";
import {
  clearDiagnostics,
  startDiagnosticRecording,
  stopDiagnosticRecording,
  recordDiagnostic
} from "../scripts/diagnostics.js";
const template = Handlebars.compile(
  await readFile(new URL("../templates/integrity.hbs", import.meta.url), "utf8")
);
const css = await readFile(
  new URL("../styles/dialogs.css", import.meta.url),
  "utf8"
);

test("integrity checks display green, yellow and red indicators with text", async ({
  page
}) => {
  installSettings({ isGM: true, values: { language: "auto" } });
  const app = new (createTroubleshootingController().constructor)();
  app.report = {
    issues: [
      {
        code: "SavedData",
        key: "showSearch",
        detail: "showSearch",
        repairable: true
      },
      { code: "File", detail: "lang/ru.json", repairable: false }
    ]
  };
  await page.setContent(
    `<style>${css}</style>${template(await app._prepareContext())}`
  );
  for (const [status, color] of [
    ["success", "rgb(105, 173, 119)"],
    ["warning", "rgb(229, 182, 79)"],
    ["error", "rgb(228, 120, 120)"]
  ]) {
    const result = page.locator(`[data-integrity-status="${status}"]`).first();
    await expect(result).toBeVisible();
    expect(await result.textContent()).not.toBe("");
    expect(
      await result.evaluate(
        node => getComputedStyle(node, "::before").backgroundColor
      )
    ).toBe(color);
  }
  await expect(
    page.locator('[role="status"][data-integrity-status="error"]')
  ).toBeVisible();
});

for (const language of ["en", "ru"])
  test(
    "diagnostic recording and preview remain readable at narrow widths: " +
      language,
    async ({ page }) => {
      clearDiagnostics();
      installSettings({ values: { language: "auto" } });
      const strings = JSON.parse(
        await readFile(
          new URL("../lang/" + language + ".json", import.meta.url),
          "utf8"
        )
      );
      game.i18n = {
        lang: language,
        localize: key => strings[key] ?? key,
        format: (key, data) =>
          (strings[key] ?? key).replace(
            /\{([^{}]+)\}/g,
            (match, name) => data[name] ?? match
          )
      };
      const app = new (createTroubleshootingController().constructor)();
      startDiagnosticRecording();
      recordDiagnostic(
        "hud.vision.availability",
        { missing: ["Token.initializeVisionSource"] },
        { outcome: "unavailable", reason: "vision-unsupported" }
      );
      app.showPreview = true;
      app.diagnosticComment = "<script>private note</script>";
      const context = await app._prepareContext();
      context.repairBackupDate = "2026-10-10";
      for (const { width, theme } of [320, 520].flatMap(width =>
        ["dark", "light"].map(theme => ({ width, theme }))
      )) {
        await page.setViewportSize({ width: width + 20, height: 1000 });
        await page.setContent(
          `<style>body{margin:10px;background:${theme === "dark" ? "#202024" : "#f4f1e9"};color:${theme === "dark" ? "#eee" : "#242424"};font:14px Arial;--color-border-light-tertiary:#888}*{box-sizing:border-box}section{width:${width}px}fieldset{min-width:0}button,textarea,input{font:inherit}button{padding:8px;white-space:normal}label{display:block;margin:8px 0}legend{max-width:100%;overflow-wrap:anywhere}${css}</style><section class="adventurer-hud-settings">${template(context)}</section>`
        );
        await expect(page.locator('[data-action="mark"]')).toBeVisible();
        const report = page.locator('[data-troubleshooting-section="report"]');
        await expect(report).toHaveAttribute("open", "");
        await expect(report.locator('[data-action="mark"]')).toBeVisible();
        for (const [section, action] of [["backup", "backupsettings"]]) {
          const details = page.locator(
            `[data-troubleshooting-section="${section}"]`
          );
          await expect(page.locator(`[data-action="${action}"]`)).toBeHidden();
          await details.locator("summary").focus();
          await page.keyboard.press("Enter");
          await expect(page.locator(`[data-action="${action}"]`)).toBeVisible();
        }
        await expect(page.locator('[data-action="check"]')).toBeVisible();
        await expect(
          page.locator('[data-troubleshooting-section="saved"] summary')
        ).toHaveCount(0);
        expect(
          await page
            .locator(".ws-troubleshooting > :first-child")
            .getAttribute("data-troubleshooting-section")
        ).toBe("saved");
        expect(
          await page
            .locator('[data-troubleshooting-section="recording"]')
            .evaluate(node => node.parentElement.dataset.troubleshootingSection)
        ).toBe("report");
        const backup = await page
          .locator('[data-action="backuprepair"]')
          .boundingBox();
        expect(backup).not.toBeNull();
        await expect(
          page.locator(
            '[data-troubleshooting-section="saved"] [data-action="backuprepair"]'
          )
        ).toHaveCount(0);
        await expect(
          page.locator(
            '[data-troubleshooting-section="backup"] [data-action="backuprepair"]'
          )
        ).toBeVisible();
        // Refreshing the native application retains the user's expanded sections.
        app.element = {
          querySelectorAll: () =>
            ["report", "saved", "backup"].map(key => ({
              dataset: { troubleshootingSection: key },
              open: true
            }))
        };
        const refreshed = await app._prepareContext();
        expect(refreshed.expandedSections).toEqual({
          report: true,
          saved: true,
          backup: true
        });
        app.element = null;
        app.expandedSections = {};
        context.expandedSections = {};
        context.expandedSectionAttributes = { report: "open" };
        await expect(page.locator('[data-action="close"]')).toBeVisible();
        await expect(page.locator("[data-debug-window-size]")).toHaveCount(0);
        await expect(
          page.locator('[data-action="resetplayerwindow"]')
        ).toBeHidden();
        await page.locator(".ws-troubleshooting-resets summary").click();
        await expect(
          page.locator('[data-action="resetplayerwindow"]')
        ).toBeVisible();
        await expect(page.locator("script")).toHaveCount(0);
        await page.locator(".ws-diagnostic-preview").focus();
        await expect(page.locator(".ws-diagnostic-preview")).toBeFocused();
        expect(
          await page
            .locator("section")
            .evaluate(e => e.scrollWidth <= e.clientWidth + 1)
        ).toBe(true);
      }
      stopDiagnosticRecording({ mark: true });
      const stopped = await app._prepareContext();
      await page.setContent(template(stopped));
      await page
        .locator('[data-troubleshooting-section="report"] summary')
        .click();
      await expect(page.locator('[data-action="record"]')).toBeVisible();
      await expect(page.locator('[data-action="mark"]')).toHaveCount(0);
      clearDiagnostics();
    }
  );
