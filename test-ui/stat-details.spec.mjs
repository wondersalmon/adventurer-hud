import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";

test("expanded native AC remains readable in both themes and narrow player/GM panels", async ({
  page
}) => {
  for (const expandedStat of ["ac"]) {
    const { css, baseline, bodies } = await layoutFixture("en", {
      expandedStat
    });
    for (const theme of ["dark", "light"])
      for (const scenario of ["player-combat", "gm-features"])
        for (const width of [320, 1000]) {
          await page.setContent(
            `<style>${baseline}\n${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px"><div class="window-content"><div class="ws-shell">${bodies[scenario]}</div></div></section>`
          );
          const details = page.locator(".ws-armor-class-details:not([hidden])");
          if (expandedStat === "ac")
            await details.evaluate(node => {
              node.innerHTML =
                '<table><tr><td class="attribution-value" data-type="override">10</td><td>Unarmored Defense (Monk)</td></tr><tr><td class="attribution-value" data-type="add">4</td><td>Dexterity</td></tr><tr><td class="attribution-value" data-type="add">2</td><td>Wisdom</td></tr><tr class="total"><td>16</td><td>Total</td></tr></table>';
            });
          await expect(details).toBeVisible();
          expect(
            await details.evaluate(
              node => node.scrollWidth <= node.clientWidth + 1
            )
          ).toBe(true);
          const overlap = await details.evaluate(node => {
            const a = node.getBoundingClientRect();
            return [...node.parentElement.children]
              .filter(child => child !== node && child.getClientRects().length)
              .some(child => {
                const b = child.getBoundingClientRect();
                return (
                  a.left < b.right - 1 &&
                  a.right > b.left + 1 &&
                  a.top < b.bottom - 1 &&
                  a.bottom > b.top + 1
                );
              });
          });
          expect(overlap).toBe(false);
        }
  }
});

test("GM search button and expanded search match the other info blocks", async ({
  page
}) => {
  const { css, baseline, bodies } = await layoutFixture("en");
  for (const width of [320, 1000]) {
    await page.setContent(
      `<style>${baseline}\n${css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:${width}px"><div class="window-content"><div class="ws-shell">${bodies["gm-features"]}</div></div></section>`
    );
    for (const open of [false, true]) {
      const result = await page
        .locator(".ws-gm-search")
        .evaluate((node, expanded) => {
          node.open = expanded;
          const identity = node
            .closest(".ws-gm-identity")
            .getBoundingClientRect();
          const summary = node.querySelector("summary").getBoundingClientRect();
          const search = node
            .querySelector(".ws-global-search")
            ?.getBoundingClientRect();
          return {
            summaryRight: summary.right,
            right: identity.right,
            searchWidth: search?.width,
            width: identity.width
          };
        }, open);
      expect(Math.abs(result.summaryRight - result.right)).toBeLessThanOrEqual(
        1
      );
      if (open)
        expect(Math.abs(result.searchWidth - result.width)).toBeLessThanOrEqual(
          1
        );
    }
  }
});
