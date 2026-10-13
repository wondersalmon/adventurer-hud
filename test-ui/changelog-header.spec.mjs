import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { loadHudModules } from "./module-fixture.mjs";

const template = Handlebars.compile(
  await readFile(new URL("../templates/settings.hbs", import.meta.url), "utf8")
);
const css = await readFile(
  new URL("../styles/dialogs.css", import.meta.url),
  "utf8"
);

for (const language of ["en", "ru"]) {
  const strings = JSON.parse(
    await readFile(new URL(`../lang/${language}.json`, import.meta.url), "utf8")
  );
  test(`${language} changelog header keeps compact language selector beside title at narrow and wide sizes`, async ({
    page
  }) => {
    const label = strings["ADVENTURER_HUD.Settings.Changelog.Name"];
    const languageLabel = strings["ADVENTURER_HUD.Settings.Changelog.Language"];
    for (const theme of ["dark", "light"])
      for (const width of [360, 820]) {
        await page.setViewportSize({ width: width + 30, height: 760 });
        await page.setContent(
          `<style>body{font:14px Arial;margin:10px}*{box-sizing:border-box}${css}</style><section class="adventurer-hud-settings" style="width:${width}px;height:680px"><div class="window-content">${template({ groups: [], changelogLabel: label, changelogLanguageLabel: languageLabel, theme, idPrefix: "test" })}</div></section>`
        );
        await page
          .locator('[data-settings-panel="changelog"]')
          .evaluate(node => (node.hidden = false));
        await loadHudModules(page, {
          "hud/theme.js": ["synchronizeHudPalette"]
        });
        await page.evaluate(
          theme =>
            window.synchronizeHudPalette(
              document.querySelector(".adventurer-hud-settings"),
              { theme }
            ),
          theme
        );
        const selector = page.getByRole("combobox", {
          name: languageLabel,
          exact: true
        });
        await expect(selector).toBeVisible();
        await expect(
          page.locator(".ws-settings-changelog-header h2")
        ).toHaveText(label);
        const geometry = await page
          .locator(".ws-settings-changelog-header")
          .evaluate(node => {
            const header = node.getBoundingClientRect();
            const title = node.querySelector("h2").getBoundingClientRect();
            const select = node.querySelector("select").getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(node.querySelector("h2"));
            return {
              lines: range.getClientRects().length,
              headerWidth: header.width,
              selectWidth: select.width,
              selectHeight: select.height,
              rightDifference: Math.abs(header.right - select.right),
              overlap: title.right > select.left,
              aligned: Math.abs(
                (title.top + title.bottom) / 2 -
                  (select.top + select.bottom) / 2
              ),
              overflow: node.scrollWidth > node.clientWidth
            };
          });
        expect(geometry.lines).toBe(1);
        expect(geometry.selectWidth).toBeLessThan(110);
        expect(geometry.selectWidth).toBeLessThan(geometry.headerWidth / 2);
        expect(geometry.selectHeight).toBeLessThanOrEqual(32);
        expect(geometry.rightDifference).toBeLessThan(1);
        expect(geometry.overlap).toBe(false);
        expect(geometry.aligned).toBeLessThan(1);
        expect(geometry.overflow).toBe(false);
        await selector.focus();
        await expect(selector).toBeFocused();
        await selector.selectOption(language === "en" ? "ru" : "en");
        await expect(selector).toHaveValue(language === "en" ? "ru" : "en");
      }
  });
}
