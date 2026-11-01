import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { fixture, combatFor } from "../tests/helpers/companions.mjs";
import { installSc, configureCombat, SC } from "../tests/helpers/venaerys.mjs";
import { itemCollection } from "../tests/helpers/rendering.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { waitFor } from "../tests/helpers/hud.mjs";

async function markup(
  language,
  gm,
  half,
  application = false,
  mode = "combat",
  enhanced = false
) {
  const f = await fixture({
    isGM: gm,
    values: {
      language,
      gmEnabled: gm,
      scInitiative: true,
      playerFooter: application,
      showModeNavigation: application
    }
  });
  installSc();
  const hero = f.token(f.actor, "hero", true);
  const summon = f.token(f.npc(), "summon");
  canvas.tokens.controlled = [f.placeables.get(hero.id)];
  const { combat, entries } = combatFor(f, [hero, summon]);
  configureCombat(combat, entries, { split: "players" });
  for (const entry of entries) entry.initiative = null;
  if (half === "act") combat.flags[SC].actionsHalf = "2:fast";
  if (enhanced) {
    entries[0].flags[SC][half === "act" ? "done" : "moved"] = 2;
    for (const entry of entries) entry.flags[SC].extraTurnOf = "original";
  }
  combat.flags[SC].plan[0].name =
    language === "ru"
      ? "Быстрая фаза — защитники очень длинного названия северной границы"
      : "Fast phase — guardians of the unusually long northern border name";
  combat.scene = canvas.scene;
  game.combats = itemCollection([combat]);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  try {
    if (enhanced) await app.hudActions.togglecompanions();
    if (mode === "explore") {
      app.hudActions.normal();
      await waitFor(
        () =>
          !app.element.querySelector("#ws-combat") &&
          app.element.querySelector(".ws-player-layout")
      );
    }
    if (application) {
      const rendered = await app._renderHTML();
      rendered.querySelector(".ws-shell").innerHTML =
        app.element.querySelector(".ws-shell").innerHTML;
      return rendered.outerHTML;
    }
    return app.element.querySelector(".ws-shell").innerHTML;
  } finally {
    await app.close();
  }
}

test("ApplicationV2 player footer fills the window height in exploration and phased combat", async ({
  page
}) => {
  const { css, baseline } = await layoutFixture("en");
  for (const mode of ["explore", "combat"]) {
    const html = await markup("en", false, "move", true, mode);
    for (const width of [360, 638, 1000])
      for (const height of [450, 820]) {
        await page.setViewportSize({ width: width + 40, height: height + 40 });
        await page.setContent(
          `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:${width}px"><div class="window-content" style="height:${height}px">${html}</div></section>`
        );
        await loadHudModules(page, {
          "hud/window/responsive-layout.js": ["synchronizePlayerLayout"]
        });
        await page.evaluate(() =>
          window.synchronizePlayerLayout(document, 450)
        );
        const content = await page.locator(".window-content").boundingBox();
        const footer = await page
          .locator(".ws-player-footer:visible")
          .boundingBox();
        expect(footer.y + footer.height).toBeCloseTo(
          content.y + content.height,
          0
        );
        expect(footer.x).toBeCloseTo(content.x, 0);
        expect(footer.width).toBeCloseTo(content.width, 0);
      }
  }
});

test("SC undo, extra turn, owned progress and companion row controls fit narrow layouts in both languages", async ({
  page
}) => {
  for (const language of ["en", "ru"]) {
    const { css, baseline } = await layoutFixture(language);
    const html = await markup(language, false, "act", false, "combat", true);
    for (const theme of ["light", "dark"])
      for (const width of [270, 450]) {
        await page.setContent(
          `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px"><div class="ws-shell">${html}</div></section>`
        );
        await loadHudModules(page, {
          "hud/window/responsive-layout.js": ["synchronizePlayerLayout"]
        });
        await page.evaluate(() =>
          window.synchronizePlayerLayout(document, 450)
        );
        await page.locator(".ws-companion-card").scrollIntoViewIfNeeded();
        await expect(page.locator('[data-action="scundo"]')).toBeVisible();
        await expect(page.locator(".ws-sc-progress")).toContainText("1");
        await expect(page.locator(".ws-sc-phase .ws-sc-extra")).toBeVisible();
        await expect(
          page.locator(".ws-companion-copy .ws-sc-extra")
        ).toBeVisible();
        const button = page.locator('[data-action="companionscturn"]');
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
        expect(await button.getAttribute("aria-label")).toBeTruthy();
        for (const selector of [
          ".ws-sc-phase",
          ".ws-companion-card",
          ".ws-companion-sc-turn"
        ])
          expect(
            await page
              .locator(selector)
              .evaluate(n => n.scrollWidth <= n.clientWidth + 1)
          ).toBe(true);
      }
  }
});

test("SC phase labels and exact Done/Moved controls remain reachable in narrow windows", async ({
  page
}) => {
  const { css, baseline } = await layoutFixture("en");
  for (const language of ["en", "ru"])
    for (const gm of [false, true])
      for (const half of ["move", "act"]) {
        const body = await markup(language, gm, half);
        for (const theme of ["light", "dark"])
          for (const width of [270, 450]) {
            await page.setContent(
              `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px"><div class="ws-shell">${body}</div></section>`
            );
            const summary = page.locator(".ws-sc-phase");
            await expect(summary).toBeVisible();
            const tracker = summary.locator('[data-action="sctracker"]');
            await expect(tracker).toBeVisible();
            await expect(tracker).toBeEnabled();
            for (const roll of await page
              .locator(
                '[data-action="initiative"], [data-action="companioninitiative"], [data-action="gmrollinitiative"]'
              )
              .all())
              await expect(roll).toBeDisabled();
            expect(await tracker.getAttribute("aria-label")).toBeTruthy();
            expect(
              await summary.evaluate(
                node => node.scrollWidth <= node.clientWidth + 1
              )
            ).toBe(true);
            const complete = gm
              ? page.locator('[data-action="scdone"]').first()
              : page.locator('[data-action="endturn"]').first();
            await expect(complete).toBeVisible();
            await expect(complete).toBeEnabled();
            expect(await complete.getAttribute("aria-label")).toBeTruthy();
            const inside = await complete.evaluate(node => {
              const control = node.getBoundingClientRect(),
                root = node.closest(".ws-rolls-dialog").getBoundingClientRect();
              return (
                control.left >= root.left && control.right <= root.right + 1
              );
            });
            expect(inside).toBe(true);
            if (gm)
              await expect(
                page.locator('[data-action="gmnext"]')
              ).toHaveAttribute(
                "aria-label",
                language === "ru" ? "Следующая фаза" : "Next phase"
              );
            if (
              language === "ru" &&
              gm &&
              half === "act" &&
              theme === "light" &&
              width === 450
            )
              await summary.screenshot({
                path: "dev/test-results/sc-phase-preview.png"
              });
          }
      }
});
