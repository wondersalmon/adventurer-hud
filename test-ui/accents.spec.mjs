import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

test("Foundry gold overrides Graphite's standard accent without changing its surfaces", async ({
  page
}) => {
  const { css, baseline } = await layoutFixture("en");
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog"><div class="ws-shell"><button class="ws-button ws-inspiration ws-active">Inspiration</button></div></section>`
  );
  await loadHudModules(page, { "hud/theme.js": ["synchronizeHudPalette"] });
  await page.evaluate(() =>
    window.synchronizeHudPalette(document.querySelector("section"), {
      theme: "graphite",
      preset: "standard"
    })
  );
  const root = page.locator("section");
  const background = await root.evaluate(
    node => getComputedStyle(node).backgroundColor
  );
  const standard = await page
    .locator(".ws-inspiration")
    .evaluate(node => getComputedStyle(node).color);
  await page.evaluate(() =>
    window.synchronizeHudPalette(document.querySelector("section"), {
      theme: "graphite",
      preset: "foundry"
    })
  );
  await expect(page.locator(".ws-inspiration")).toHaveCSS(
    "color",
    "rgb(193, 154, 88)"
  );
  expect(standard).not.toBe("rgb(193, 154, 88)");
  await expect(root).toHaveCSS("background-color", background);
});

test("Foundry Dark with Standard restores the original HUD palette after another theme and accent", async ({
  page
}) => {
  const { css, baseline } = await layoutFixture("en");
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog"><div class="window-content"><div class="ws-shell"><button class="ws-button ws-inspiration ws-active">Inspiration</button></div></div></section>`
  );
  await loadHudModules(page, {
    "hud/theme.js": ["synchronizeHudTheme", "synchronizeHudAccents"]
  });
  await page.evaluate(() => {
    const root = document.querySelector("section");
    window.synchronizeHudTheme(root, "light");
    window.synchronizeHudAccents(root, { preset: "custom", color: "#336699" });
    window.synchronizeHudTheme(root, "dark");
    window.synchronizeHudAccents(root, {
      preset: "standard",
      color: "#336699"
    });
  });
  await expect(page.locator("section")).toHaveCSS(
    "background-color",
    "rgb(25, 24, 31)"
  );
  await expect(page.locator(".window-content")).toHaveCSS(
    "background-color",
    "rgb(25, 24, 31)"
  );
  await expect(page.locator(".ws-shell")).toHaveCSS(
    "color",
    "rgb(230, 230, 223)"
  );
  await expect(page.locator(".ws-inspiration")).toHaveCSS(
    "color",
    "rgb(193, 154, 88)"
  );
  const colors = await page.locator(".ws-inspiration").evaluate(node => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    return ["backgroundColor", "borderTopColor"].map(property => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(node)[property];
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    });
  });
  for (const [index, alpha] of [0.12, 0.65].entries()) {
    for (const [channel, value] of [193, 154, 88].entries())
      expect(Math.abs(colors[index][channel] - value)).toBeLessThanOrEqual(4);
    expect(
      Math.abs(colors[index][3] - Math.round(alpha * 255))
    ).toBeLessThanOrEqual(1);
  }
});

test("one HUD accent preset follows manual and automatic themes, with a shared custom color", async ({
  page
}) => {
  const { css, baseline } = await layoutFixture("en");
  await page.setContent(
    `<style>${baseline}${css}</style><main class="theme-dark"><section class="ws-rolls-dialog"><div class="ws-shell"><button class="ws-button ws-inspiration ws-active">Inspiration</button></div><div class="ws-dice-tray"><button class="ws-button">Roll</button></div></section></main>`
  );
  await loadHudModules(page, {
    "hud/theme.js": [
      "synchronizeHudTheme",
      "synchronizeHudAccents",
      "watchHudTheme"
    ]
  });
  await page.evaluate(() => {
    const root = document.querySelector("section");
    window.synchronizeHudAccents(root, { preset: "teal", color: "#336699" });
    window.synchronizeHudTheme(root, "auto");
    window.selectedAccentTheme = "auto";
    window.stopAccentTheme = window.watchHudTheme(
      root,
      () => window.selectedAccentTheme
    );
  });
  const active = page.locator(".ws-inspiration");
  const scrollbar = page.locator(".ws-shell");
  await expect(active).toHaveCSS("color", "rgb(94, 234, 212)");
  await expect(scrollbar).toHaveCSS(
    "scrollbar-color",
    "rgb(94, 234, 212) rgba(0, 0, 0, 0)"
  );
  const tray = page.locator(".ws-dice-tray .ws-button");
  await tray.focus();
  await expect(tray).toHaveCSS("outline-color", "rgb(94, 234, 212)");
  await page.locator("main").evaluate(node => (node.className = "theme-light"));
  await expect(active).toHaveCSS("color", "rgb(12, 104, 97)");
  await expect(scrollbar).toHaveCSS(
    "scrollbar-color",
    "rgb(12, 104, 97) rgba(0, 0, 0, 0)"
  );
  await expect(tray).toHaveCSS("outline-color", "rgb(12, 104, 97)");
  await page.evaluate(() => {
    window.selectedAccentTheme = "dark";
    window.synchronizeHudTheme(document.querySelector("section"), "dark");
  });
  await expect(active).toHaveCSS("color", "rgb(94, 234, 212)");
  await page.evaluate(() => {
    window.stopAccentTheme();
    window.synchronizeHudAccents(document.querySelector("section"), {
      preset: "custom",
      color: "#336699"
    });
  });
  await expect(active).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(scrollbar).toHaveCSS(
    "scrollbar-color",
    "rgb(51, 102, 153) rgba(0, 0, 0, 0)"
  );
  await expect(tray).toHaveCSS("outline-color", "rgb(51, 102, 153)");
  await page.evaluate(() => {
    window.synchronizeHudTheme(document.querySelector("section"), "light");
  });
  await expect(active).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(tray).toHaveCSS("outline-color", "rgb(51, 102, 153)");
  await page.evaluate(() => {
    window.synchronizeHudAccents(document.querySelector("section"), {
      preset: "standard",
      color: "#336699"
    });
  });
  await expect(active).toHaveCSS("color", "rgb(121, 85, 28)");
});
