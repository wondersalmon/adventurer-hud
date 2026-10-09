import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

const fixture = await layoutFixture("en", { editing: true });

test("GM defaults reserve narrow details and reflow action and roster cards", async ({
  page
}) => {
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:1950px"><div class="window-content" style="height:420px"><div class="ws-shell">${fixture.bodies["gm-features"]}</div></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/gm-column-dividers.js": ["bindGmColumnDividers"]
  });
  await page.evaluate(() => {
    window.dividers = bindGmColumnDividers(
      document.querySelector(".ws-rolls-dialog"),
      {
        readRatio: () => 0,
        saveRatio: () => {},
        isPinned: () => false,
        t: key => key
      }
    );
    window.dividers.sync();
    const roster = document.querySelector(".ws-gm-roster");
    for (let index = roster.children.length; index < 8; index++)
      roster.append(roster.firstElementChild.cloneNode(true));
    const items = document.querySelector(
      ".ws-gm-action-column .ws-combat-item-grid"
    );
    for (let index = items.children.length; index < 4; index++)
      items.append(items.firstElementChild.cloneNode(true));
  });
  expect((await page.locator(".ws-gm-combat").boundingBox()).width).toBeCloseTo(
    180,
    0
  );
  expect((await page.locator(".ws-gm-info").boundingBox()).width).toBeCloseTo(
    280,
    0
  );
  const columns = selector =>
    page
      .locator(selector)
      .evaluate(
        node => getComputedStyle(node).gridTemplateColumns.split(" ").length
      );
  expect(await columns(".ws-gm-action-column .ws-combat-item-grid")).toBe(2);
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node => (node.style.width = "1000px"));
  await page.evaluate(() => window.dividers.sync());
  expect(await columns(".ws-gm-action-column .ws-combat-item-grid")).toBe(2);
  const firstCards = await page
    .locator(".ws-gm-action-column .ws-combat-item-grid > *")
    .evaluateAll(nodes =>
      nodes.slice(0, 2).map(node => node.getBoundingClientRect().toJSON())
    );
  expect(firstCards[0].y).toBeCloseTo(firstCards[1].y, 0);
  expect(firstCards[1].x).toBeGreaterThan(firstCards[0].x);
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node => (node.style.width = "1950px"));
  await page.evaluate(() => window.dividers.sync());
  for (const [width, expected] of [
    [400, 1],
    [405, 2],
    [650, 2]
  ]) {
    await page
      .locator(".ws-gm-action-column .ws-combat-item-grid")
      .evaluate((node, width) => (node.style.width = `${width}px`), width);
    expect(await columns(".ws-gm-action-column .ws-combat-item-grid")).toBe(
      expected
    );
  }
  for (const [width, expected] of [
    [450, 2],
    [670, 3],
    [900, 4]
  ]) {
    await page
      .locator(".ws-gm-view")
      .evaluate(
        (node, width) =>
          node.style.setProperty("--ws-gm-roster-width", `${width}px`),
        width
      );
    expect(await columns(".ws-gm-roster")).toBe(expected);
  }
  await page
    .locator(".ws-gm-view")
    .evaluate(node => node.style.setProperty("--ws-gm-roster-width", "1300px"));
  expect(await columns(".ws-gm-roster")).toBe(4);
  await page.evaluate(() => window.dividers.dispose());
});

test("GM identity aligns portrait, name and search, with an internal clear control", async ({
  page
}) => {
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:1000px"><div class="window-content" style="height:420px"><div class="ws-shell">${fixture.bodies["gm-features"]}</div></div></section>`
  );
  const summary = page.locator(".ws-gm-search > summary");
  const name = await page.locator(".ws-gm-name").boundingBox();
  const portrait = await page.locator(".ws-gm-selected-image").boundingBox();
  const search = await summary.boundingBox();
  expect(
    Math.abs(portrait.y + portrait.height / 2 - name.y - name.height / 2)
  ).toBeLessThan(2);
  expect(
    Math.abs(search.y + search.height / 2 - name.y - name.height / 2)
  ).toBeLessThan(2);
  const before = await summary.evaluate(
    node => getComputedStyle(node).borderColor
  );
  await summary.hover();
  expect(
    await summary.evaluate(node => getComputedStyle(node).borderColor)
  ).not.toBe(before);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('.ws-gm-search [data-action="searchitems"]')
  ).toBeVisible();
  const input = await page.locator(".ws-gm-search input").boundingBox();
  const clear = await page
    .locator('.ws-gm-search [data-action="clearsearch"]')
    .boundingBox();
  expect(clear.x + clear.width).toBeLessThanOrEqual(input.x + input.width);
  expect(clear.y).toBeGreaterThanOrEqual(input.y);
  expect(clear.y + clear.height).toBeLessThanOrEqual(input.y + input.height);
});

test("GM dividers, independent categories and movement remain bounded during resizing", async ({
  page
}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:1150px"><div class="window-content" style="height:420px"><div class="ws-shell">${fixture.bodies["gm-features"]}</div></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/gm-column-dividers.js": ["bindGmColumnDividers"],
    "hud/window/extra-column.js": ["bindExtraColumn"],
    "hud/window/hud-layout.js": ["synchronizeHudLayout", "changeHudLayout"],
    "hud/state.js": ["createHudState"]
  });
  await page.evaluate(() => {
    const root = document.querySelector(".ws-rolls-dialog");
    window.state = createHudState({
      hudEditing: true,
      hudLayouts: { "combat:extra": { order: [], hidden: [] } }
    });
    window.ratios = { roster: 0.2, info: 0.4 };
    window.gmDividers = bindGmColumnDividers(root, {
      readRatio: key => window.ratios[key],
      saveRatio: (key, value) => {
        window.ratios[key] = value;
      },
      isPinned: () => root.classList.contains("ws-pinned"),
      t: key => key
    });
    window.extraDivider = bindExtraColumn(root, {
      readRatio: () => 0.5,
      saveRatio: () => {},
      isPinned: () => false
    });
    window.sync = () => {
      gmDividers.sync();
      synchronizeHudLayout(root, window.state, key => key);
      extraDivider.sync();
    };
    window.sync();
    root.addEventListener("click", event => {
      const target = event.target.closest('[data-action="hudblockmove"]');
      if (target) {
        changeHudLayout(root, window.state, target);
        window.sync();
      }
    });
  });
  await expect(page.locator(".ws-gm-column-divider")).toHaveCount(2);
  await expect(page.locator(".ws-extra-column-divider")).toHaveCount(1);
  const weapons = page.locator('[data-hud-block="tab:weapons"]');
  await weapons
    .locator(':scope > .ws-hud-block-tools [data-hud-direction="right"]')
    .click();
  expect(
    await weapons.evaluate(node => node.parentElement.dataset.hudLane)
  ).toBe("extra");
  await weapons
    .locator(':scope > .ws-hud-block-tools [data-hud-direction="left"]')
    .click();
  expect(
    await weapons.evaluate(node => node.parentElement.dataset.hudLane)
  ).toBe("actions");
  const divider = page.locator('[data-gm-divider="roster"]');
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.ratios.roster)).toBeGreaterThan(0.2);
  for (const width of [1950, 1150, 900, 899, 850, 640, 320, 1150]) {
    await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
      node.style.width = width + "px";
      window.sync();
    }, width);
    expect(
      await page
        .locator(".ws-gm-view")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 2)
    ).toBe(true);
    expect(
      await page
        .locator(".ws-gm-body")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 2)
    ).toBe(true);
    if (width < 900)
      await expect(page.locator('[data-gm-divider="info"]')).toBeHidden();
    else await expect(page.locator('[data-gm-divider="info"]')).toBeVisible();
  }
  await page.evaluate(() => {
    document.querySelector(".ws-rolls-dialog").classList.add("ws-pinned");
    window.sync();
  });
  const ratio = await page.evaluate(() => window.ratios.roster);
  await divider.evaluate(node =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
  );
  expect(await page.evaluate(() => window.ratios.roster)).toBe(ratio);
  await page.evaluate(() => {
    document.querySelector(".ws-rolls-dialog").style.width = "1950px";
    window.state.hudEditing = false;
    window.sync();
  });
  const buttons = page.locator(
    ".ws-gm-action-column > .ws-combat-category-section > .ws-combat-filter"
  );
  const boxes = await buttons.evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().toJSON())
  );
  expect(boxes.length).toBeGreaterThan(1);
  expect(
    boxes.some((box, index) =>
      boxes
        .slice(index + 1)
        .some(other => Math.abs(other.y - box.y) < 2 && other.x > box.x)
    )
  ).toBe(true);
  await page.evaluate(() => {
    gmDividers.dispose();
    extraDivider.dispose();
  });
  expect(errors).toEqual([]);
});

test("preparation blocks move between columns and remain readable at wide and narrow sizes", async ({
  page
}) => {
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:1150px"><div class="window-content" style="height:420px"><div class="ws-shell">${fixture.bodies["gm-preparation"]}</div></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/hud-layout.js": ["synchronizeHudLayout", "changeHudLayout"],
    "hud/state.js": ["createHudState"]
  });
  await page.evaluate(() => {
    const root = document.querySelector(".ws-rolls-dialog");
    window.state = createHudState({ hudEditing: true });
    window.sync = () => synchronizeHudLayout(root, window.state, key => key);
    window.sync();
    root.addEventListener("click", event => {
      const target = event.target.closest('[data-action="hudblockmove"]');
      if (target) {
        changeHudLayout(root, window.state, target);
        window.sync();
      }
    });
  });
  const players = page.locator('[data-hud-block="players"]');
  await players
    .locator(':scope > .ws-hud-block-tools [data-hud-direction="left"]')
    .click();
  expect(
    await players.evaluate(node => node.parentElement.dataset.hudLane)
  ).toBe("info");
  for (const width of [1150, 640, 320]) {
    await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
      node.style.width = width + "px";
      window.sync();
    }, width);
    expect(
      await page
        .locator(".ws-gm-preparation")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 2)
    ).toBe(true);
    expect(
      await page
        .locator(".ws-hud-block-tools")
        .evaluateAll(nodes =>
          nodes.every(node => node.scrollWidth <= node.clientWidth + 2)
        )
    ).toBe(true);
  }
});
