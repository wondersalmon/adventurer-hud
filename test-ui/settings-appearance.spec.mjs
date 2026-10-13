import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { installSettings } from "../tests/helpers/foundry.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { measureTextContrast } from "./contrast.mjs";

const engine = Handlebars.create();
engine.registerHelper("checked", value => (value ? "checked" : ""));
const template = engine.compile(
  await readFile(new URL("../templates/settings.hbs", import.meta.url), "utf8")
);
const css = (
  await Promise.all(
    [
      "dialogs",
      "adventurer-hud",
      "combat",
      "companions",
      "shared",
      "responsive"
    ].map(name =>
      readFile(new URL(`../styles/${name}.css`, import.meta.url), "utf8")
    )
  )
).join("\n");

for (const language of ["en", "ru"])
  test(`${language} Appearance draft previews Custom and motion at narrow widths`, async ({
    page
  }) => {
    const strings = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    const f = installSettings({
      values: { language: "auto", theme: "graphite" }
    });
    game.i18n.lang = language;
    game.i18n.localize = key => strings[key] ?? key;
    const context = await new (f.menus.get(
      "configure"
    ).type)()._prepareContext();
    await page.setViewportSize({ width: 440, height: 1000 });
    await page.setContent(
      `<base href="https://adventurer-hud.test/"><style>*{box-sizing:border-box}body{margin:10px;font:14px Arial}.adventurer-hud-settings{width:410px;height:900px;display:flex;flex-direction:column}.window-content{min-height:0;flex:1}button,input,select{font:inherit}${css}</style><form class="adventurer-hud-settings"><div class="window-content">${template(context)}</div></form>`
    );
    await page.evaluate(values => {
      window.game = { settings: { get: (_id, key) => values[key] } };
    }, Object.fromEntries(f.current));
    await loadHudModules(page, {
      "settings-appearance.js": ["AppearanceSettingsController"]
    });
    await page.evaluate(() => {
      const root = document.querySelector("form");
      window.appearance = new window.AppearanceSettingsController(root);
      root.addEventListener("change", () => window.appearance.update());
      for (const panel of root.querySelectorAll('[role="tabpanel"]'))
        panel.hidden = panel.dataset.settingsPanel !== "appearanceTheme";
    });
    expect(
      await page
        .locator("[data-appearance-demo]")
        .evaluateAll(nodes => nodes.map(node => node.dataset.appearanceDemo))
    ).toEqual(["damage", "heal", "turn"]);
    await expect(
      page.locator(
        "[data-appearance-preview] img, [data-appearance-preview] details"
      )
    ).toHaveCount(0);
    await page.locator("[data-theme-preview]").scrollIntoViewIfNeeded();
    expect(
      await page
        .locator("[data-theme-preview]")
        .evaluate(node => node.getBoundingClientRect().height)
    ).toBeLessThan(240);
    await expect(
      page.locator(
        "[data-theme-preview] [data-appearance-demo], [data-theme-preview] [data-preview-hp]"
      )
    ).toHaveCount(0);
    await expect(
      page.locator("[data-theme-preview] .ws-combat-item-card")
    ).toHaveCount(2);
    await expect(
      page.locator("[data-theme-preview] .ws-theme-sample-health")
    ).toContainText("30/52");
    expect(
      await page
        .locator("[data-theme-preview]")
        .evaluate(root => root.scrollWidth <= root.clientWidth + 1)
    ).toBe(true);

    const disclosure = await page
      .locator('[data-settings-tab="quickAccess"]')
      .evaluate(node => {
        node.setAttribute("aria-expanded", "true");
        node.setAttribute("aria-selected", "true");
        const backdrop = getComputedStyle(node, "::after");
        const arrow = getComputedStyle(node.querySelector("span"), "::after");
        return {
          backdropTransform: backdrop.transform,
          arrowWidth: arrow.width,
          arrowHeight: arrow.height
        };
      });
    expect(disclosure).toEqual({
      backdropTransform: "none",
      arrowWidth: "6px",
      arrowHeight: "6px"
    });
    const theme = page.locator('[name="theme"]');
    const accent = page.locator('[name="accentPreset"]');
    const customAccent = page.locator('[data-setting-key="accentColor"]');
    await expect(customAccent).toBeHidden();
    await accent.selectOption("custom");
    await expect(customAccent).toBeVisible();
    await page.locator('[name="accentColor"]').evaluate(node => {
      node.value = "#118899";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await accent.selectOption("foundry");
    await expect(customAccent).toBeHidden();
    await accent.selectOption("custom");
    await expect(page.locator('[name="accentColor"]')).toHaveValue("#118899");
    await accent.selectOption("standard");
    await theme.selectOption("custom");
    await expect(page.locator("[data-theme-colors]")).toBeVisible();
    for (const width of [410, 820]) {
      await page.setViewportSize({ width: width + 30, height: 1000 });
      await page
        .locator("form")
        .evaluate((root, width) => (root.style.width = `${width}px`), width);
      await expect(page.locator(".ws-theme-sample-identity strong")).toHaveText(
        strings["ADVENTURER_HUD.Settings.Appearance.Hero"]
      );
      expect(
        await page
          .locator(".ws-settings-theme-colors > label")
          .evaluateAll(labels =>
            labels.every(label => {
              const caption = label
                .querySelector("[data-setting-name]")
                .getBoundingClientRect();
              const picker = label
                .querySelector("input")
                .getBoundingClientRect();
              return (
                Math.abs(caption.left - picker.left) <= 1 &&
                caption.bottom <= picker.top + 1 &&
                label.scrollWidth <= label.clientWidth + 1
              );
            })
          )
      ).toBe(true);
      await page
        .locator(".ws-theme-sample-favorite > i")
        .evaluateAll(icons => icons.forEach(icon => (icon.textContent = "★")));
      expect(
        await page.locator(".ws-theme-sample-favorite").evaluateAll(stars =>
          stars.every(star => {
            const box = star.getBoundingClientRect(),
              icon = star.querySelector("i").getBoundingClientRect();
            return (
              Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) <= 1 &&
              Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2) <= 1
            );
          })
        )
      ).toBe(true);
    }
    await page.locator("form").evaluate(root => (root.style.width = "410px"));
    await page.setViewportSize({ width: 440, height: 1000 });

    await expect(page.locator('[name="customThemeBackground"]')).toHaveValue(
      "#303944"
    );
    await page.locator('[name="customThemeBackground"]').evaluate(node => {
      node.value = "#243544";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await theme.selectOption("pearl");
    await theme.selectOption("custom");
    await expect(page.locator('[name="customThemeBackground"]')).toHaveValue(
      "#243544"
    );
    await theme.selectOption("pearl");
    await page.evaluate(() => {
      const root = document.querySelector("form");
      for (const panel of root.querySelectorAll('[role="tabpanel"]'))
        panel.hidden = panel.dataset.settingsPanel !== "appearanceAnimations";
    });
    await page.locator('[name="hpAnimation"]').selectOption("bar");
    await page.locator('[data-appearance-demo="damage"]').click();
    await expect(page.locator("[data-preview-hp]")).toHaveText("20 / 40");
    expect(
      await page
        .locator("[data-appearance-preview]")
        .evaluate(node => node.classList.contains("ws-hp-feedback"))
    ).toBe(false);
    await page.locator('[name="showVisualEffects"]').uncheck();
    await expect(
      page.locator('[data-setting-key="hpAnimation"]')
    ).toBeVisible();
    await expect(page.locator('[name="hpAnimation"]')).toBeDisabled();
    await page.locator('[name="showVisualEffects"]').check();
    await expect(page.locator('[name="hpAnimation"]')).toHaveValue("bar");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('[data-appearance-demo="turn"]').click();
    expect(
      await page
        .locator("[data-appearance-preview]")
        .evaluate(node => node.classList.contains("ws-turn-arrival"))
    ).toBe(false);
    for (const node of await page
      .locator(".ws-appearance-card strong, [data-preview-hp]")
      .all())
      expect((await measureTextContrast(node)).ratio).toBeGreaterThanOrEqual(
        4.5
      );
    expect(
      await page
        .locator(".ws-settings-form")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
    ).toBe(true);
    if (language === "ru")
      await page
        .locator(".ws-settings-appearance-preview")
        .screenshot({ path: "dev/test-results/appearance-preview-ru.png" });
    await page.evaluate(() => window.appearance.dispose());
  });
