import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { measureTextContrast } from "./contrast.mjs";

const fixture = await layoutFixture("en");
for (const theme of ["dark", "light", "graphite", "pearl", "custom"]) {
  test(`${theme} uses one opaque palette for player, GM, companion effects and headings`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    for (const scenario of [
      "player-combat",
      "player-companions-all",
      "gm-actions"
    ]) {
      await page.setContent(
        `<style>${fixture.baseline}${fixture.css}</style><main class="theme-light"><section class="ws-rolls-dialog ws-font-medium" style="width:300px"><header class="window-header"><b class="window-title">Adventurer HUD</b></header><div class="window-content"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section><aside class="adventurer-hud-settings" style="width:300px"><div class="ws-settings-changelog"><h1>Version</h1><h2>Player</h2><h3>Effects</h3><h4>Colors</h4><h5>Details</h5><h6>Result</h6><p>Readable text <a href="#">Guide</a></p></div></aside></main>`
      );
      await loadHudModules(page, {
        "hud/theme.js": ["synchronizeHudPalette"]
      });
      await page.evaluate(theme => {
        for (const root of document.querySelectorAll(
          ".ws-rolls-dialog, .adventurer-hud-settings"
        )) {
          window.synchronizeHudPalette(root, {
            theme,
            preset: "standard",
            customBackground: "#202c39",
            customText: "#f1f5fa",
            customAccent: "#9bc9dc"
          });
        }
      }, theme);
      const root = page.locator("section.ws-rolls-dialog");
      expect(
        await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
      for (const selector of [
        ".window-title",
        ".ws-settings-changelog h1",
        ".ws-settings-changelog h2",
        ".ws-settings-changelog h3",
        ".ws-settings-changelog h4",
        ".ws-settings-changelog h5",
        ".ws-settings-changelog h6",
        ".ws-settings-changelog p",
        ".ws-settings-changelog a"
      ])
        expect(
          (await measureTextContrast(page.locator(selector))).ratio,
          selector
        ).toBeGreaterThanOrEqual(4.5);
      for (const node of await root
        .locator(".ws-status-extra, .ws-companion-effects-extra")
        .all()) {
        const background = await node.evaluate(
          element => getComputedStyle(element).backgroundColor
        );
        expect(background).toMatch(/^rgb\(/);
      }
      for (const icon of await root
        .locator(".ws-status, .ws-companion-effects img")
        .all())
        await expect(icon).toHaveCSS("background-color", "rgb(70, 83, 101)");
    }
  });
}

test("light HP warnings stay readable and use colors independent of the meter", async ({
  page
}) => {
  const { renderHealthBar } = await import("../scripts/hud/health-bar.js");
  for (const theme of ["light", "pearl"])
    for (const value of [50, 10, 0]) {
      const health = renderHealthBar({
        hp: { value, max: 100 },
        canEdit: true,
        formatMod: String,
        t: key => key
      });
      await page.setContent(
        `<style>${fixture.baseline}${fixture.css}</style><section class="ws-rolls-dialog ws-font-medium" style="width:300px"><div class="ws-shell"><div class="ws-view">${health}</div></div></section>`
      );
      await loadHudModules(page, { "hud/theme.js": ["synchronizeHudPalette"] });
      await page.evaluate(
        theme =>
          window.synchronizeHudPalette(document.querySelector("section"), {
            theme
          }),
        theme
      );
      expect(
        (await measureTextContrast(page.locator(".ws-health-condition"))).ratio
      ).toBeGreaterThanOrEqual(4.5);
      if (value > 0) {
        const warning = await page
          .locator(".ws-health-condition")
          .evaluate(node => getComputedStyle(node).color);
        const bar = await page
          .locator(".ws-health-fill")
          .evaluate(node => getComputedStyle(node).backgroundColor);
        expect(bar).not.toBe(warning);
      }
    }
});
