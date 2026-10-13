import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

async function show(
  page,
  fixture,
  scenario,
  width,
  font = "medium",
  height = 530
) {
  await page.setContent(
    `<style>${fixture.baseline}${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark ws-font-${font}" style="width:${width}px"><div class="window-content" style="height:${height}px"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/responsive-layout.js": ["synchronizePlayerLayout"]
  });
  await page.evaluate(() =>
    window.synchronizePlayerLayout(
      document.querySelector(".ws-rolls-dialog"),
      450,
      0,
      0.34,
      "manual"
    )
  );
}

test("stat labels use one size in narrow and wide rows without changing the text preset", async ({
  page
}) => {
  for (const language of ["ru", "en"]) {
    const fixture = await layoutFixture(language);
    for (const font of ["medium", "extralarge"])
      for (const width of [450, 647, 900]) {
        await show(page, fixture, "player-combat-footer", width, font);
        const labels = await page
          .locator(
            ".ws-player-stats .ws-combat-stat > span, .ws-player-stats .ws-header-initiative > span"
          )
          .evaluateAll(nodes =>
            nodes.map(node => ({
              text: node.innerText,
              width: node.clientWidth,
              font: getComputedStyle(node).fontSize,
              top: node
                .closest("button, .ws-combat-stat")
                .getBoundingClientRect().top,
              clipped: node.scrollWidth > node.clientWidth + 1,
              scale: getComputedStyle(node)
                .getPropertyValue("--ws-type-scale")
                .trim()
            }))
          );
        expect(labels).toHaveLength(3);
        expect(new Set(labels.map(label => label.font)).size).toBe(1);
        expect(labels.every(label => parseFloat(label.font) >= 9.5)).toBe(true);
        expect(new Set(labels.map(label => label.scale))).toEqual(
          new Set([font === "medium" ? "1.15" : "1.5"])
        );
        expect(labels, `${language}, ${font}, ${width}`).toEqual(
          expect.arrayContaining(
            labels.map(label => ({ ...label, clipped: false }))
          )
        );
        expect(
          Math.max(...labels.map(label => label.top)) -
            Math.min(...labels.map(label => label.top))
        ).toBeLessThan(1);
      }
  }
});

test("spells use two columns when the content width supports compact favorites", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const font of ["medium", "extralarge"])
    for (const width of [647, 751, 900, 1120]) {
      await show(page, fixture, "player-combat-spells", width, font);
      const grids = await page
        .locator(".ws-combat-item-grid")
        .evaluateAll(nodes =>
          nodes.map(node => ({
            columns:
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
            width: node.clientWidth,
            scale: Number(
              getComputedStyle(node).getPropertyValue("--ws-type-scale")
            ),
            overflow: node.scrollWidth > node.clientWidth + 1
          }))
        );
      expect(grids.length).toBeGreaterThan(1);
      for (const grid of grids) {
        expect(grid.overflow).toBe(false);
        if (grid.width >= 2 * 170 * grid.scale + 5)
          expect(grid.columns).toBeGreaterThanOrEqual(2);
      }
      const filters = await page
        .locator(".ws-combat-filter")
        .evaluateAll(nodes =>
          nodes.map(node => node.getBoundingClientRect().width)
        );
      const areaWidth = await page
        .locator(".ws-player-actions")
        .evaluate(node => node.clientWidth);
      if (areaWidth > 450)
        expect(Math.max(...filters)).toBeLessThan(areaWidth / 2);
    }
});

test("relocated category sections keep compact navigation and a multi-column expanded list", async ({
  page
}) => {
  const fixture = await layoutFixture("ru", { editing: true });
  await show(page, fixture, "player-combat-spells", 900);
  await loadHudModules(page, {
    "hud/window/hud-layout.js": ["synchronizeHudLayout"]
  });
  await page.evaluate(() =>
    window.synchronizeHudLayout(
      document.querySelector(".ws-rolls-dialog"),
      {
        hudEditing: false,
        hudLayouts: {
          "combat:actions": { order: ["tab:weapons", "tab:spells"], hidden: [] }
        }
      },
      key => key
    )
  );
  const area = page.locator(".ws-player-actions");
  expect(await area.evaluate(node => getComputedStyle(node).display)).toBe(
    "grid"
  );
  const filters = await area
    .locator(".ws-combat-filter")
    .evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().width)
    );
  const width = await area.evaluate(node => node.clientWidth);
  expect(filters.length).toBeGreaterThan(2);
  expect(Math.max(...filters)).toBeLessThan(width / 2);
  const expanded = area
    .locator(
      '.ws-combat-category-section:has(> [aria-expanded="true"]) .ws-combat-item-grid'
    )
    .first();
  expect(
    await expanded.evaluate(
      node => getComputedStyle(node).gridTemplateColumns.split(" ").length
    )
  ).toBeGreaterThanOrEqual(2);
});

test("opening Inventory replaces a long Features list without stale or overlapping cards", async ({
  page
}) => {
  const layouts = expanded => ({
    "combat:actions": { order: ["tab:features", "tab:inventory"], hidden: [] },
    "combat:expanded": { order: expanded, hidden: [] }
  });
  const states = {};
  let fixture;
  for (const expanded of [["features"], ["inventory"], []]) {
    fixture = await layoutFixture("en", {
      hudLayouts: layouts(expanded),
      featureCount: 80
    });
    states[expanded.join(",")] = fixture.bodies["player-combat-footer"];
  }
  await show(page, fixture, "player-combat-footer", 900, "extralarge");
  await loadHudModules(page, {
    "hud/window/hud-layout.js": ["synchronizeHudLayout"],
    "hud/refresh.js": ["refreshHudView"],
    "hud/view-actions.js": ["createViewActions"],
    "hud/state.js": ["createHudState"]
  });
  await page.evaluate(
    ({ states, initial }) => {
      const root = document.querySelector(".ws-rolls-dialog");
      const state = window.createHudState({
        hudLayouts: initial,
        combatCategory: "features"
      });
      const sync = () => {
        window.synchronizePlayerLayout(root, 450, 0, 0.34, "manual");
        window.synchronizeHudLayout(root, state, key => key);
      };
      const render = region => {
        const body =
          states[state.hudLayouts["combat:expanded"].order.join(",")];
        const template = document.createElement("template");
        template.innerHTML = body;
        window.refreshHudView({
          app: { rendered: true, element: root },
          hudState: state,
          mode: "combat",
          region,
          renderers: {
            combat: () => body,
            actions: () =>
              template.content.querySelector(".ws-combat-actions").outerHTML
          },
          syncLayout: sync
        });
      };
      const actions = window.createViewActions({
        hudState: state,
        refreshHud: render
      });
      root.addEventListener("click", event => {
        const target = event.target.closest('[data-action="combatfilter"]');
        if (target) actions.combatfilter(event, target);
      });
      render();
    },
    { states, initial: layouts(["features"]) }
  );
  const features = page.locator('[data-hud-block="tab:features"]');
  const inventory = page.locator('[data-hud-block="tab:inventory"]');
  await inventory.locator(':scope > [data-action="combatfilter"]').click();
  await expect(
    features.locator(':scope > [data-action="combatfilter"]')
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    inventory.locator(':scope > [data-action="combatfilter"]')
  ).toHaveAttribute("aria-expanded", "true");
  const featureList = features.locator(":scope > .ws-combat-item-list");
  const inventoryList = inventory.locator(":scope > .ws-combat-item-list");
  await expect(featureList).toHaveCount(0);
  await expect(
    page.locator(".ws-player-actions .ws-feature-group")
  ).toHaveCount(0);
  await inventoryList.evaluate(node => node.scrollIntoView({ block: "start" }));
  const overlapping = await inventoryList
    .locator(".ws-combat-item-card")
    .evaluateAll(nodes => {
      const boxes = nodes.map(node => node.getBoundingClientRect());
      return boxes.some((box, index) =>
        boxes
          .slice(index + 1)
          .some(
            other =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top
          )
      );
    });
  expect(overlapping).toBe(false);
  await page.screenshot({
    path: "dev/test-results/categories-switch.png"
  });
  await features.locator(':scope > [data-action="combatfilter"]').click();
  await expect(featureList).toHaveCount(1);
  await expect(inventoryList).toHaveCount(0);
  await features.locator(':scope > [data-action="combatfilter"]').click();
  await expect(featureList).toHaveCount(0);
});

test("action and inventory categories form three readable columns in the saved-layout path, then reduce on narrow lanes", async ({
  page
}) => {
  for (const language of ["en", "ru"]) {
    const fixture = await layoutFixture(language, { editing: true });
    for (const scenario of ["player-combat-footer", "player-combat-inventory"])
      for (const [width, font] of [
        [900, "extralarge"],
        [647, "extralarge"],
        [450, "medium"]
      ]) {
        await show(page, fixture, scenario, width, font);
        await loadHudModules(page, {
          "hud/window/hud-layout.js": ["synchronizeHudLayout"]
        });
        await page.evaluate(() =>
          window.synchronizeHudLayout(
            document.querySelector(".ws-rolls-dialog"),
            {
              hudEditing: false,
              hudLayouts: {
                "combat:actions": {
                  order: ["tab:weapons", "tab:inventory"],
                  hidden: []
                }
              }
            },
            key => key
          )
        );
        const selectors = [
          ".ws-player-actions > .ws-combat-category-section > .ws-combat-filter"
        ];
        if (scenario.endsWith("inventory"))
          selectors.push(".ws-inventory-filters .ws-combat-filter");
        for (const selector of selectors) {
          const buttons = await page.locator(selector).evaluateAll(nodes =>
            nodes.map(node => {
              const box = node.getBoundingClientRect();
              const label = node.querySelector("span");
              const range = document.createRange();
              range.selectNodeContents(label);
              return {
                top: box.top,
                left: box.left,
                right: box.right,
                label: label.textContent,
                lines: range.getClientRects().length,
                clipped:
                  node.scrollWidth > node.clientWidth + 1 ||
                  label.scrollWidth > label.clientWidth + 1
              };
            })
          );
          expect(buttons.length).toBeGreaterThanOrEqual(3);
          const firstRow = buttons.filter(
            button => Math.abs(button.top - buttons[0].top) < 1
          );
          expect(firstRow.length).toBe(
            width === 900 ? 3 : width === 647 ? 2 : 1
          );
          for (const button of buttons) {
            expect(button.clipped, button.label).toBe(false);
            expect(button.lines, button.label).toBe(1);
          }
        }
      }
  }
});

test("companion cards form text-aware columns with actions inside each card and no overlaps", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const font of ["medium", "extralarge"])
    for (const width of [270, 450, 620]) {
      await page.setContent(
        `<style>${fixture.baseline}${fixture.css}</style><section class="ws-rolls-dialog ws-font-${font}" style="width:${width}px"><div class="ws-shell">${fixture.bodies["player-companions-all-vision"]}</div></section>`
      );
      const grid = await page.locator(".ws-companions-list").evaluate(node => ({
        columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
        width: node.clientWidth,
        scale: Number(
          getComputedStyle(node).getPropertyValue("--ws-type-scale")
        )
      }));
      expect(grid.columns).toBe(grid.width >= 340 * grid.scale + 4 ? 2 : 1);
      for (const row of await page.locator(".ws-companion-row").all()) {
        const controls = await row.locator("button").evaluateAll(nodes =>
          nodes.map(node => {
            const box = node.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              clipped: node.scrollWidth > node.clientWidth + 1
            };
          })
        );
        expect(controls.every(control => !control.clipped)).toBe(true);
        for (const [index, control] of controls.entries())
          for (const other of controls.slice(index + 1))
            expect(
              control.right <= other.left ||
                other.right <= control.left ||
                control.bottom <= other.top ||
                other.bottom <= control.top
            ).toBe(true);
        await expect(
          row.locator('[data-action="companionsheet"]')
        ).toBeVisible();
      }
      await page.locator('[data-action="companionsheet"]').first().focus();
      await expect(
        page.locator('[data-action="companionsheet"]').first()
      ).toBeFocused();
    }
});

test("companion cards split inside the real padded actions lane at large text", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await show(page, fixture, "player-companions-combat", 900, "extralarge");
  const grid = page.locator(
    ".ws-player-actions .ws-companions-panel #ws-companions-body .ws-companions-list"
  );
  const metrics = await grid.evaluate(node => ({
    width: node.clientWidth,
    scale: Number(getComputedStyle(node).getPropertyValue("--ws-type-scale")),
    columns: getComputedStyle(node).gridTemplateColumns.split(" ").length
  }));
  expect(metrics.scale).toBe(1.5);
  expect(metrics.width).toBeGreaterThanOrEqual(514);
  expect(metrics.width).toBeLessThan(574);
  expect(metrics.columns).toBe(2);
  const cards = await grid
    .locator(".ws-companion-card")
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()));
  expect(cards).toHaveLength(2);
  expect(Math.abs(cards[0].top - cards[1].top)).toBeLessThan(1);
  expect(cards[0].right).toBeLessThanOrEqual(cards[1].left);
});

test("companion switching keeps compact columns when only height or scrollbar changes", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const height of [350, 1000]) {
    await show(page, fixture, "companion-actions", 647, "medium", height);
    await expect(page.locator(".ws-companion-switch").first()).toBeHidden();
    const toggle = page.locator("#ws-companion-switch-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".ws-companion-switch").first()).toBeVisible();
    const count = await page
      .locator(".ws-companion-switches")
      .evaluate(node => {
        const sample = node.firstElementChild;
        for (let index = 0; index < 15; index++)
          node.append(sample.cloneNode(true));
        return getComputedStyle(node).gridTemplateColumns.split(" ").length;
      });
    expect(count).toBe(2);
    const first = page.locator(".ws-companion-switch").first();
    expect(await first.getAttribute("title")).toBeTruthy();
    await first.focus();
    await expect(first).toBeFocused();
    await expect(page.locator('[data-action="companionback"]')).toBeVisible();
  }
});

test("companion disclosure keeps its native expansion and summary focus across a full refresh", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  await show(page, fixture, "companion-actions", 647);
  await loadHudModules(page, {
    "hud/window/dom-state.js": ["captureHudDomState", "restoreHudDomState"]
  });
  const summary = page.locator("#ws-companion-switch-toggle");
  await expect(page.locator(".ws-companion-switch").first()).toBeHidden();
  await expect(summary).toContainText("Другие спутники · 2");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".ws-companion-switch").first()).toBeVisible();
  for (const expanded of [true, false]) {
    if (!expanded) await page.keyboard.press("Enter");
    await page.evaluate(body => {
      const root = document.querySelector(".ws-rolls-dialog");
      const snapshot = window.captureHudDomState(root);
      root.querySelector(".ws-shell").innerHTML = body;
      window.restoreHudDomState(root, snapshot);
    }, fixture.bodies["companion-actions"]);
    await expect(summary).toBeFocused();
    expect(
      await page
        .locator(".ws-companion-switch-list")
        .evaluate(node => node.open)
    ).toBe(expanded);
    await expect(page.locator('[data-action="companionback"]')).toBeVisible();
  }
});
