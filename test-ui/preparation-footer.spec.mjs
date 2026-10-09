import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

for (const language of ["en", "ru"]) {
  for (const theme of ["dark", "light"]) {
    test(`Start combat stays inside the preparation viewport: ${language}/${theme}`, async ({
      page
    }) => {
      await page.setViewportSize({ width: 1600, height: 900 });
      const fixture = await layoutFixture(language);
      for (const nativeForm of [false, true]) {
        const shell = `<div class="ws-shell">${fixture.bodies["gm-preparation"]}</div>`;
        await page.setContent(`<style>${fixture.baseline}\n${fixture.css}</style>
          <section class="ws-rolls-dialog ws-theme-${theme}" style="width:1000px">
            <header class="window-header">Combat setup</header>
            <div class="window-content" style="height:410px">${nativeForm ? `<form><div class="dialog-content">${shell}</div></form>` : shell}</div>
          </section>`);
        await loadHudModules(page, {
          "hud/window/hud-layout.js": ["synchronizeHudLayout"],
          "hud/state.js": ["createHudState"]
        });
        await page.evaluate(() => {
          window.state = createHudState();
          const roster = document.querySelector(
            ".ws-gm-preparation-creatures .ws-gm-roster"
          );
          for (let count = 0; count < 20; count++)
            roster.append(roster.firstElementChild.cloneNode(true));
        });
        for (const editing of [false, true]) {
          for (const [width, height] of [
            [270, 220],
            [1000, 410],
            [1400, 310]
          ]) {
            await page.evaluate(
              ({ width, height, editing }) => {
                const root = document.querySelector(".ws-rolls-dialog");
                root.style.width = width + "px";
                root.querySelector(".window-content").style.height =
                  height + "px";
                window.state.hudEditing = editing;
                synchronizeHudLayout(root, window.state, key => key);
                root.querySelector(".ws-gm-preparation").scrollTop = 0;
              },
              { width, height, editing }
            );
            const start = page.locator('[data-action="gmstartcombat"]');
            const before = await start.boundingBox();
            const bounds = await page.locator(".window-content").boundingBox();
            expect(before.y).toBeGreaterThanOrEqual(bounds.y);
            expect(before.y + before.height).toBeLessThanOrEqual(
              bounds.y + bounds.height
            );
            expect(
              await start.evaluate(button => {
                const rect = button.getBoundingClientRect();
                return (
                  document
                    .elementFromPoint(
                      rect.x + rect.width / 2,
                      rect.y + rect.height / 2
                    )
                    ?.closest('[data-action="gmstartcombat"]') === button
                );
              })
            ).toBe(true);
            await page.locator(".ws-gm-preparation").evaluate(node => {
              node.scrollTop = node.scrollHeight;
            });
            const after = await start.boundingBox();
            expect(after.y).toBeCloseTo(before.y, 1);
            expect(after.height).toBeCloseTo(before.height, 1);
            expect(
              await page
                .locator(".window-content")
                .evaluate(node => node.scrollHeight <= node.clientHeight + 1)
            ).toBe(true);
          }
        }
      }
    });
  }
}
