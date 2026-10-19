import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

for (const language of ["en", "ru"]) {
  test(`${language} memory header stays within narrow/wide themed HUD and preserves ping modifiers`, async ({
    page
  }) => {
    const f = await layoutFixture(language);
    const strings = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    await page.setViewportSize({ width: 900, height: 750 });
    await page.setContent(
      `<style>${f.baseline}\n${f.css}</style><section class="ws-rolls-dialog" style="position:absolute;left:0px;top:10px;width:650px;height:500px"><header class="window-header"><span class="window-title">Adventurer HUD</span><button data-action="toggleControls">⋮</button></header><div class="window-content"><div class="ws-shell">${f.bodies["player-combat-footer"]}</div></div></section>`
    );
    await loadHudModules(page, {
      "hud/rat-memory.js": ["bindRatMemory"],
      "hud/theme.js": ["synchronizeHudPalette"],
      "hud/window/window-controls.js": ["syncHeaderEditControl"]
    });
    await page.evaluate(strings => {
      const listeners = new Set();
      window.memoryCalls = [];
      window.memoryEnabled = true;
      window.records = [
        {
          id: "one",
          name: "<img onerror=alert(1)>",
          label: "RAT.RoundsSinceLoss"
        }
      ];
      const api = {
        version: 1,
        list: () => window.records,
        subscribe: fn => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        ping: (_id, event) =>
          window.memoryCalls.push({ shift: event.shiftKey, alt: event.altKey }),
        center: () => {},
        forget: () => {
          window.records = [];
          listeners.forEach(fn => fn());
        }
      };
      window.game = {
        modules: new Map([
          ["probably-just-a-rat", { active: true, api: { memory: api } }]
        ]),
        settings: {
          get: () => window.memoryEnabled,
          sheet: {
            render: async options =>
              window.memoryCalls.push({ render: options }),
            search: query => window.memoryCalls.push({ search: query }),
            changeTab: (tab, group) => window.memoryCalls.push({ tab, group }),
            bringToFront: () => window.memoryCalls.push({ front: true })
          }
        }
      };
      window.memoryRoot = document.querySelector(".ws-rolls-dialog");
      window.memoryApp = Object.assign(new EventTarget(), {
        element: window.memoryRoot,
        rendered: true
      });
      window.editControl = window.syncHeaderEditControl({
        document,
        header: window.memoryRoot.querySelector("header"),
        enabled: true,
        editing: false,
        label: "Edit"
      });
      window.memoryBinding = window.bindRatMemory({
        app: window.memoryApp,
        t: key => strings["ADVENTURER_HUD." + key] || key
      });
    }, strings);
    for (const width of [270, 650])
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          ({ width, theme }) => {
            window.memoryRoot.style.width = width + "px";
            window.memoryRoot.style.top = "10px";
            window.synchronizeHudPalette(window.memoryRoot, { theme });
          },
          { width, theme }
        );
        await page.locator("[data-rat-memory-toggle]").click();
        await expect(page.locator("[data-rat-memory-toggle]")).toHaveText("");
        await expect(page.locator("[data-rat-memory-toggle]")).toHaveClass(
          /fa-mouse-field/
        );
        await expect(page.locator('[data-action="togglehudedit"]')).toHaveClass(
          /fa-pen-to-square/
        );
        const panel = page.locator(".ws-rat-memory");
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("data-placement", "below");
        await expect(panel.locator("img")).toHaveCount(0);
        await expect(panel.locator('[data-memory-action="close"]')).toHaveCount(
          0
        );
        await expect(
          panel.locator('[data-memory-action="forget"]')
        ).toHaveClass(/fa-eraser/);
        const root = await page.locator(".ws-rolls-dialog").boundingBox(),
          box = await panel.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(root.x);
        expect(box.x + box.width).toBeLessThanOrEqual(root.x + root.width + 1);
        expect(box.width).toBeCloseTo(root.width, 0);
        expect(box.x).toBeCloseTo(root.x, 0);
        await expect(panel).not.toContainText("RAT.");
        await expect(panel).toContainText(
          strings["ADVENTURER_HUD.Memory.LastPosition"]
        );
        for (const action of [
          "ping",
          "center",
          "forget",
          "clear",
          "settings"
        ]) {
          const control = panel.locator(`[data-memory-action="${action}"]`);
          await expect(control).toHaveAttribute("data-tooltip", /.+/);
          await expect(control).toHaveAttribute("title", /.+/);
        }
        expect(
          await page
            .locator("[data-rat-memory-toggle]")
            .evaluate(node => node.getBoundingClientRect().width)
        ).toBe(28);
        expect(
          await page
            .locator('[data-action="togglehudedit"]')
            .evaluate(node => node.getBoundingClientRect().width)
        ).toBe(28);
        expect(
          await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        expect(
          await panel.evaluate(node => getComputedStyle(node).backgroundColor)
        ).not.toBe("rgba(0, 0, 0, 0)");
        await panel
          .locator('[data-memory-action="ping"]')
          .click({ modifiers: ["Shift", "Alt"] });
        expect(await page.evaluate(() => window.memoryCalls.at(-1))).toEqual({
          shift: true,
          alt: true
        });
        await page.evaluate(() => {
          window.memoryRoot.style.top = "300px";
          window.memoryApp.dispatchEvent(new Event("position"));
        });
        await expect(panel).toHaveAttribute("data-placement", "above");
        const aboveBox = await panel.boundingBox();
        const headerBox = await page.locator(".window-header").boundingBox();
        expect(aboveBox.y + aboveBox.height).toBeCloseTo(headerBox.y, 0);
        expect(aboveBox.x).toBeCloseTo(root.x, 0);
        expect(aboveBox.width).toBeCloseTo(root.width, 0);
        expect(aboveBox.y).toBeGreaterThanOrEqual(8);
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
      }
    await page.locator("[data-rat-memory-toggle]").click();
    await page.locator('[data-memory-action="settings"]').click();
    expect(await page.evaluate(() => window.memoryCalls.slice(-4))).toEqual([
      { render: { force: true } },
      { search: "" },
      { tab: "probably-just-a-rat", group: "categories" },
      { front: true }
    ]);
    await expect(page.locator(".ws-rat-memory")).toHaveCount(0);
    await page.locator("[data-rat-memory-toggle]").click();
    await page.locator("[data-rat-memory-toggle]").click();
    await expect(page.locator(".ws-rat-memory")).toHaveCount(0);
    await page.locator("[data-rat-memory-toggle]").click();
    await page.locator('[data-memory-action="clear"]').click();
    await expect(page.locator('[data-memory-action="clear"]')).toBeDisabled();
    await expect(page.locator(".ws-rat-memory")).toContainText(
      strings["ADVENTURER_HUD.Memory.Empty"]
    );
    await page.evaluate(() => {
      window.memoryEnabled = false;
      window.memoryBinding.sync();
    });
    await expect(page.locator("[data-rat-memory-toggle]")).toHaveCount(0);
    await expect(page.locator(".ws-rat-memory")).toHaveCount(0);
  });
}
