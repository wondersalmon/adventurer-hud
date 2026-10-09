import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

for (const theme of ["dark", "light"]) {
  test(`${theme} status uses native keyboard focus and removes once per guarded gesture`, async ({
    page
  }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const fixture = await layoutFixture("en");
    await page.setContent(
      `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:300px"><div id="statuses"></div></section>`
    );
    await loadHudModules(page, {
      "hud/combat-statuses.js": ["createCombatStatusRenderer"],
      "hud/status-interactions.js": ["bindStatusInteractions"],
      "hud/actions.js": ["createHudActions"]
    });
    await page.evaluate(() => {
      window.game = {
        user: {},
        settings: { get: () => false },
        i18n: { localize: text => text }
      };
      window.CONFIG = { statusEffects: [] };
      const actor = {
        id: "hero",
        isOwner: true,
        statuses: new Set(["poisoned"]),
        effects: []
      };
      const root = document.querySelector("#statuses");
      const renderer = createCombatStatusRenderer({
        actor,
        adapter: {
          statusDefinitions: () => [{ id: "poisoned", name: "Poisoned" }]
        },
        hudState: {},
        escapeHTML: text => text,
        t: key => key
      });
      root.innerHTML = renderer.combatStatuses();
      window.statusCalls = 0;
      const actions = createHudActions({
        actor,
        t: key => key,
        adapter: {
          removeStatus: async () => {
            window.statusCalls++;
          }
        },
        performAndRefresh: callback => callback()
      });
      window.disposeStatuses = bindStatusInteractions({
        element: root,
        isActive: () => true,
        remove: (event, target) => actions.removestatus(event, target)
      });
    });
    const status = page.getByRole("button", { name: "Poisoned", exact: true });
    await page.keyboard.press("Tab");
    await expect(status).toBeFocused();
    await status.press("Enter");
    await status.press("Space");
    expect(await page.evaluate(() => window.statusCalls)).toBe(0);
    await status.press("Control+Enter");
    await expect.poll(() => page.evaluate(() => window.statusCalls)).toBe(1);
    await status.press("Control+Space");
    await expect.poll(() => page.evaluate(() => window.statusCalls)).toBe(2);
    await page.evaluate(() => window.disposeStatuses());
    await status.press("Control+Enter");
    expect(await page.evaluate(() => window.statusCalls)).toBe(2);
    expect(errors).toEqual([]);
  });
}
