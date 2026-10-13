import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

const fixture = await layoutFixture("ru");

for (const theme of ["dark", "light"]) {
  test(`${theme} supports narrow player/GM panels, readable text and visible editing controls`, async ({
    page
  }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const scenario of [
      "player-combat",
      "player-companions-all",
      "gm-actions"
    ])
      for (const width of [270, 480]) {
        await page.setViewportSize({ width: width + 50, height: 760 });
        await page.setContent(
          `<style>${fixture.baseline}${fixture.css}</style><main class="theme-light"><section class="ws-rolls-dialog ws-font-medium" style="width:${width}px;height:680px;display:flex;flex-direction:column"><header class="window-header"><b class="window-title">Adventurer HUD</b><button class="header-control" data-action="toggleControls" aria-label="Меню">⋮</button><button class="header-control" data-action="close" aria-label="Закрыть">×</button></header><div class="window-content" style="flex:1;padding:0"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section></main>`
        );
        await loadHudModules(page, {
          "hud/theme.js": [
            "synchronizeHudTheme",
            "synchronizeHudAccents",
            "watchHudTheme"
          ],
          "hud/window/window-controls.js": [
            "syncPinControl",
            "syncHeaderEditControl"
          ]
        });
        await page.evaluate(theme => {
          const root = document.querySelector("section");
          window.selectedTheme = theme;
          window.synchronizeHudTheme(root, theme);
          window.synchronizeHudAccents(root, {
            preset: "teal",
            color: "#336699"
          });
          window.stopThemeWatch = window.watchHudTheme(
            root,
            () => window.selectedTheme
          );
          const header = root.querySelector(".window-header");
          window.syncPinControl({
            document,
            header,
            label: "Открепить окно",
            pinned: true
          });
          window.setEditing = editing =>
            window.syncHeaderEditControl({
              document,
              header,
              enabled: true,
              editing,
              besidePin: true,
              label: editing
                ? "Завершить редактирование HUD"
                : "Настроить компоновку HUD"
            });
          window.setEditing(false);
        }, theme);
        const root = page.locator("section.ws-rolls-dialog");
        await expect(root).toHaveCSS("color-scheme", theme);
        await expect(root).toHaveCSS(
          "background-color",
          theme === "dark" ? "rgb(25, 24, 31)" : "rgb(245, 241, 232)"
        );
        await expect(page.locator(".ws-shell")).toHaveCSS(
          "color",
          theme === "dark" ? "rgb(230, 230, 223)" : "rgb(41, 39, 34)"
        );
        expect(
          await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        const edit = page.locator('[data-action="togglehudedit"]');
        await expect(edit).toHaveAttribute("aria-pressed", "false");
        const inactiveBackground = await edit.evaluate(
          node => getComputedStyle(node).backgroundColor
        );
        await page.evaluate(() => window.setEditing(true));
        await expect(edit).toHaveAttribute("aria-pressed", "true");
        await expect(edit).toHaveAccessibleName("Завершить редактирование HUD");
        expect(
          await edit.evaluate(node => getComputedStyle(node).backgroundColor)
        ).not.toBe(inactiveBackground);
        expect(
          await edit.evaluate(node => getComputedStyle(node, "::after").content)
        ).not.toBe("none");
        await expect(edit).toHaveCSS(
          "border-top-color",
          theme === "dark" ? "rgb(94, 234, 212)" : "rgb(12, 104, 97)"
        );
        await edit.focus();
        await expect(edit).toHaveCSS(
          "outline-color",
          theme === "dark" ? "rgb(94, 234, 212)" : "rgb(12, 104, 97)"
        );
        await expect(edit).toHaveCSS("outline-width", "2px");
        await page
          .locator("main")
          .evaluate(node => (node.className = "theme-dark"));
        await expect(root).toHaveClass(new RegExp(`ws-theme-${theme}`));
        if (width === 480 && scenario === "player-combat") {
          await page.evaluate(() =>
            window.synchronizeHudAccents(document.querySelector("section"), {
              preset: "teal",
              color: "#336699"
            })
          );
          await root.screenshot({
            path: `dev/test-results/hud-${theme}-preview.png`
          });
        }
        await page.evaluate(theme => {
          window.setEditing(false);
          window.stopThemeWatch();
          window.synchronizeHudTheme(
            document.querySelector("section"),
            theme === "light" ? "dark" : "light"
          );
        }, theme);
        await expect(edit).toHaveAttribute("aria-pressed", "false");
        await expect(root).not.toHaveClass(new RegExp(`ws-theme-${theme}`));
      }
    expect(errors).toEqual([]);
  });
}

test("HP bars animate damage and healing and respect reduced motion", async ({
  page
}) => {
  const { renderHealthBar } = await import("../scripts/hud/health-bar.js");
  const html = renderHealthBar({
    hp: { value: 5, max: 20, temp: 2 },
    canEdit: true,
    formatMod: n => String(n),
    t: key => key
  });
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:270px;--ws-hp-old-normal:50%;--ws-hp-new-normal:25%;--ws-hp-old-temp:25%;--ws-hp-new-temp:10%;--ws-hp-delta:'−8'">${html}</section>`
  );
  const root = page.locator(".ws-rolls-dialog");
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "none"
  );
  await root.evaluate(node => {
    node.dataset.hpFeedback = "damage";
    node.classList.add("ws-hp-feedback");
  });
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "ws-health-normal-change"
  );
  const trail = await page
    .locator(".ws-health-track")
    .evaluate(node => getComputedStyle(node, "::before").animationName);
  expect(trail).toBe("ws-health-damage-trail");
  await root.evaluate(node => {
    node.dataset.hpFeedback = "heal";
  });
  const colors = await root.evaluate(node => {
    const probe = document.createElement("span");
    probe.style.color = "var(--success)";
    node.append(probe);
    const success = getComputedStyle(probe).color;
    probe.remove();
    return {
      feedback: getComputedStyle(
        node.querySelector(".ws-health-button"),
        "::after"
      ).color,
      success
    };
  });
  expect(colors.feedback).toBe(colors.success);
  const fractions = await page.locator(".ws-health-track").evaluate(node => {
    const fills = [
      ...node.querySelectorAll(".ws-health-fill, .ws-health-temp-fill")
    ];
    for (const fill of fills)
      for (const animation of fill.getAnimations()) {
        animation.pause();
        animation.currentTime = 650;
      }
    const width = node.getBoundingClientRect().width;
    return fills.map(fill => fill.getBoundingClientRect().width / width);
  });
  expect(fractions[0]).toBeCloseTo(0.25, 2);
  expect(fractions[1]).toBeCloseTo(0.1, 2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "none"
  );
  const reducedTrail = await page
    .locator(".ws-health-track")
    .evaluate(node => getComputedStyle(node, "::before").display);
  expect(reducedTrail).toBe("none");
});
