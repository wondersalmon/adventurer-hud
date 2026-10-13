import { test, expect } from "@playwright/test";
import { loadHudModules } from "./module-fixture.mjs";
import { layoutFixture } from "./layout-fixture.mjs";
import { fragment, itemRendererFixture } from "../tests/helpers/rendering.mjs";
import { createItemPreview } from "../scripts/hud/items/item-preview.js";
import { bindItemDescriptionInteractions } from "../scripts/hud/items/item-interactions.js";

test("unprepared favorites block native clicks but retain their star and sheet gesture", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  const f = itemRendererFixture({
    visibility: { favorites: true },
    adapter: {
      itemRole: () => "spell",
      itemRangeData: () => ({}),
      rangeUnitLabel: () => "",
      spellPreparation: () => ({ canPrepare: true, prepared: false })
    }
  });
  const markup = f.renderer.combatItemButton(
    { id: "unprepared", name: "Unprepared spell", type: "spell" },
    { inFavorites: true }
  );
  await page.setContent(
    `<style>${fixture.baseline}${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:320px"><div class="ws-shell">${markup}</div></section>`
  );
  await page.addScriptTag({
    content: `${bindItemDescriptionInteractions.toString()};window.calls=[];const root=document.querySelector('.ws-shell');root.addEventListener('click',event=>{if(event.target.closest('[data-action="useitem"]'))window.calls.push('cast')});bindItemDescriptionInteractions({element:root,isActive:()=>true,openItem:event=>window.calls.push(event.shiftKey?'chat':'sheet')});`
  });
  const spell = page.locator(".ws-combat-item");
  await expect(spell).toBeDisabled();
  await expect(page.locator(".ws-item-favorite")).toBeEnabled();
  const box = await spell.boundingBox();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await page.mouse.click(box.x + 20, box.y + box.height / 2, {
    button: "right"
  });
  expect(await page.evaluate(() => window.calls)).toEqual(["sheet"]);
});

test("portrait, identity and inspiration share height in both modes and fonts", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  for (const body of ["player-main", "player-combat"])
    for (const width of [270, 600])
      for (const font of ["medium", "extralarge"]) {
        await page.setContent(
          `<style>${fixture.baseline}\n${fixture.css}</style><main class="ws-rolls-dialog ws-font-${font} ws-theme-dark" style="width:${width}px"><div class="ws-shell">${fixture.bodies[body]}</div></main>`
        );
        await loadHudModules(page, {
          "hud/window/responsive-layout.js": ["applyPlayerLayout"]
        });
        await page.evaluate(() =>
          window.applyPlayerLayout(
            document.querySelector(".ws-player-layout"),
            false
          )
        );
        const boxes = await page
          .locator(".ws-actor-header")
          .evaluate(header => {
            const buttons = [
              header.querySelector(":scope > .ws-actor-sheet-button"),
              header.querySelector(".ws-actor-identity"),
              header.querySelector(".ws-inspiration")
            ];
            return buttons.map(button => {
              const box = button.getBoundingClientRect();
              return { top: box.top, height: box.height };
            });
          });
        for (const box of boxes) {
          expect(Math.abs(box.height - boxes[0].height)).toBeLessThanOrEqual(1);
          expect(Math.abs(box.top - boxes[0].top)).toBeLessThanOrEqual(1);
        }
      }
});

test("inventory summary stays compact, with one row when wide and a single inventory action", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  const summary = fragment(fixture.bodies["player-inventory"]).querySelector(
    ".ws-inventory-summary"
  ).outerHTML;
  for (const width of [270, 480, 700]) {
    await page.setContent(
      `<style>${fixture.baseline}\n${fixture.css}</style><main class="ws-rolls-dialog ws-theme-dark" style="width:${width}px"><div class="ws-shell">${summary}</div></main>`
    );
    const layout = await page
      .locator(".ws-inventory-summary")
      .evaluate(root => {
        const a = root.querySelector(".ws-inventory-weight"),
          b = root.querySelector(".ws-inventory-currency");
        return {
          a: a.getBoundingClientRect().top,
          b: b.getBoundingClientRect().top,
          borders: [a, b].map(node => getComputedStyle(node).borderTopWidth),
          height: root.getBoundingClientRect().height,
          overflow: root.scrollWidth > root.clientWidth + 1
        };
      });
    expect(layout.overflow).toBe(false);
    expect(layout.borders).toEqual(["0px", "0px"]);
    if (width >= 480) {
      expect(layout.a).toBe(layout.b);
      expect(layout.height).toBeLessThan(36);
    } else {
      expect(layout.b).toBeGreaterThan(layout.a);
      expect(layout.height).toBeLessThan(60);
    }
  }
});

test("description-off hints use separate keycaps and card shortcuts route one native action", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><main class="ws-rolls-dialog ws-theme-dark"><div class="ws-shell"><div data-description-item-id="sword"><button>Use Sword</button></div></div></main>`
  );
  await page.addScriptTag({
    content:
      createItemPreview.toString() +
      "\n" +
      bindItemDescriptionInteractions.toString()
  });
  await page.evaluate(() => {
    const root = document.querySelector("main");
    const item = { id: "sword", name: "Sword" };
    window.calls = [];
    window.nativeUses = 0;
    root.addEventListener("click", () => window.nativeUses++);
    bindItemDescriptionInteractions({
      element: root,
      isActive: () => true,
      openItem: (event, target) =>
        window.calls.push([
          event.shiftKey ? "chat" : "sheet",
          target.dataset.itemId
        ])
    });
    createItemPreview({
      element: root,
      getItem: () => item,
      enabled: () => false,
      isActive: () => true,
      enrich: () => {
        throw new Error("must not enrich");
      },
      t: key =>
        ({
          "Combat.LeftClick": "LMB",
          "Combat.RightClick": "RMB",
          "Combat.ShortcutChat": "Send to chat",
          "Combat.ShortcutSheet": "Open sheet"
        })[key] ?? key,
      onError: () => {
        throw new Error("preview failed");
      }
    });
  });
  await page.getByRole("button", { name: "Use Sword" }).hover();
  const hints = page.locator(".ws-item-preview-shortcuts");
  await expect(hints).toBeVisible();
  await expect(hints.locator("kbd")).toHaveCount(3);
  await expect(page.locator(".ws-item-preview-body")).toHaveCount(0);
  expect(
    await hints.evaluate(node => getComputedStyle(node).borderTopWidth)
  ).toBe("1px");
  await page
    .getByRole("button", { name: "Use Sword" })
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Use Sword" })
    .click({ button: "right", modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Use Sword" })
    .click({ button: "right" });
  expect(await page.evaluate(() => window.calls)).toEqual([
    ["chat", "sword"],
    ["sheet", "sword"]
  ]);
  expect(await page.evaluate(() => window.nativeUses)).toBe(1);
});

test("saved combat categories use multiple columns and expand across the row", async ({
  page
}) => {
  const layouts = {
    "combat:actions": { order: ["tab:weapons"], hidden: [] },
    "combat:expanded": { order: ["features"], hidden: [] }
  };
  for (const editing of [false, true]) {
    const fixture = await layoutFixture("en", { editing, hudLayouts: layouts });
    for (const width of [270, 510]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><main class="ws-rolls-dialog ws-theme-dark ${editing ? "ws-hud-editing" : ""}" style="width:${width}px"><div class="ws-shell">${fixture.bodies["player-combat"]}</div></main>`
      );
      const sections = page.locator(".ws-combat-category-sections");
      const layout = await sections.evaluate(root => {
        const buttons = [...root.querySelectorAll(".ws-combat-filter")];
        const boxes = buttons.map(button => button.getBoundingClientRect());
        const body = root.querySelector(
          ".ws-combat-category-section > :not(.ws-combat-filter)"
        );
        return {
          columns: boxes.filter(box => Math.abs(box.top - boxes[0].top) < 1)
            .length,
          bodyWidth: body?.getBoundingClientRect().width,
          width: root.getBoundingClientRect().width,
          overflow: root.scrollWidth > root.clientWidth + 1
        };
      });
      expect(layout.overflow).toBe(false);
      if (width === 510) expect(layout.columns).toBeGreaterThan(1);
      expect(layout.bodyWidth).toBeCloseTo(layout.width, 0);
    }
  }
});

test("editor footer tools fit their blocks and inventory remains a single action", async ({
  page
}) => {
  const fixture = await layoutFixture("en", { editing: true });
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><main class="ws-rolls-dialog ws-theme-dark" style="width:800px"><div class="ws-shell">${fixture.bodies["player-combat-footer"]}</div></main>`
  );
  await loadHudModules(page, {
    "hud/window/hud-layout.js": ["synchronizeHudLayout"],
    "hud/window/responsive-layout.js": ["applyPlayerLayout"]
  });
  await page.evaluate(() => {
    const root = document.querySelector("main");
    window.applyPlayerLayout(root.querySelector(".ws-player-layout"), true);
    window.synchronizeHudLayout(
      root,
      { hudEditing: true, hudLayouts: {} },
      key => key
    );
  });
  await expect(
    page.locator('.ws-inventory-summary[data-hud-block="weight"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-action="hudblockhide"][data-hud-key="weight"]')
  ).toHaveCount(1);
  const tools = page.locator(
    ".ws-player-footer > [data-hud-block] > .ws-hud-block-tools"
  );
  expect(await tools.count()).toBeGreaterThan(0);
  expect(
    await tools.evaluateAll(nodes =>
      nodes.every(node => {
        const box = node.getBoundingClientRect(),
          parent = node.parentElement.getBoundingClientRect();
        const content = [...node.parentElement.children].filter(
          child => child !== node
        );
        return (
          box.left >= parent.left - 1 &&
          box.right <= parent.right + 1 &&
          content.every(
            child => child.getBoundingClientRect().top >= box.bottom - 1
          )
        );
      })
    )
  ).toBe(true);
});
