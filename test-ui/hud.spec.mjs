import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createCombatSpellRenderer } from "../scripts/hud/combat-spells.js";
import { createCombatStatusRenderer } from "../scripts/hud/combat-statuses.js";
import {
  escapeHTML,
  itemRendererFixture
} from "../tests/helpers/rendering.mjs";
const manifest = JSON.parse(
  await readFile(new URL("../module.json", import.meta.url), "utf8")
);
const css = (
  await Promise.all(
    manifest.styles.map(path =>
      readFile(new URL("../" + path, import.meta.url), "utf8")
    )
  )
).join("\n");
const t = key =>
  ({ "Combat.SpellSlotsShort": "Spell", "Combat.PactSlotsShort": "Pact" })[
    key
  ] || key;

test("spell heading and slots stay visible and are replaced by the next level", async ({
  page
}) => {
  const render = createCombatSpellRenderer({
    actor: {},
    adapter: {
      spellSlots: (_actor, level) => [[level, 3, `spell${level}`]],
      spellSlotKind: () => "standard",
      spellLevel: item => item.level
    },
    combatItemButton: () => '<div style="height:70px">Spell</div>',
    hudState: {},
    t,
    tf: (_key, { level }) => `LEVEL ${level}`
  });
  const items = [1, 2, 3].flatMap(level =>
    Array.from({ length: 12 }, () => ({ level }))
  );
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog" style="width:320px"><div class="window-content" style="height:240px;padding:0"><div class="ws-shell"><div class="ws-view"><div class="ws-combat-item-list">${render(items)}</div></div></div></div></div>`
  );
  const scroll = page.locator(".window-content");
  const viewport = await scroll.boundingBox();
  const headings = page.locator(".ws-spell-level-heading");
  await scroll.evaluate(element => {
    element.scrollTop = 100;
  });
  expect(
    Math.abs((await headings.nth(0).boundingBox()).y - viewport.y)
  ).toBeLessThan(2);
  await expect(headings.nth(0)).toContainText("LEVEL 1");
  await expect(headings.nth(0)).toContainText("1/3");
  const nextTop = await headings
    .nth(1)
    .evaluate(
      element =>
        element.getBoundingClientRect().top -
        document.querySelector(".window-content").getBoundingClientRect().top +
        document.querySelector(".window-content").scrollTop
    );
  await scroll.evaluate((element, top) => {
    element.scrollTop = top + 40;
  }, nextTop);
  expect(
    Math.abs((await headings.nth(1).boundingBox()).y - viewport.y)
  ).toBeLessThan(2);
  expect((await headings.nth(0).boundingBox()).y).toBeLessThan(viewport.y);
  await expect(headings.nth(1)).toContainText("LEVEL 2");
  await expect(headings.nth(1)).toContainText("2/3");
});

for (const width of [270, 320, 450]) {
  for (const [max, font] of [
    [3, "medium"],
    [10, "extralarge"]
  ]) {
    test(
      "spell pools stay inside width " +
        width +
        " with " +
        max +
        " slots at " +
        font,
      async ({ page }) => {
        const render = createCombatSpellRenderer({
          actor: {},
          adapter: {
            spellSlots: () => [
              [0, max, "spell1"],
              [1, 2, "pact"]
            ],
            spellSlotKind: pool => (pool === "pact" ? "pact" : "spell"),
            spellLevel: () => 1
          },
          canRollActor: true,
          combatItemButton: () => "",
          escapeHTML,
          hudState: {},
          t,
          tf: () => "Level 1"
        });
        await page.setContent(
          "<style>" +
            css +
            '</style><div class="ws-rolls-dialog ws-font-' +
            font +
            '" style="width:' +
            width +
            'px"><div class="ws-shell"><div class="ws-view">' +
            render([{}]) +
            "</div></div></div>"
        );
        const heading = page.locator(".ws-spell-level-heading");
        const bounds = await heading.boundingBox();
        const pools = await page.locator(".ws-spell-slots").all();
        expect(pools).toHaveLength(2);
        const boxes = await Promise.all(pools.map(pool => pool.boundingBox()));
        for (const box of boxes) {
          expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(
            bounds.x + bounds.width + 1
          );
        }
        const [a, b] = boxes;
        expect(
          a.x + a.width <= b.x + 1 ||
            b.x + b.width <= a.x + 1 ||
            a.y + a.height <= b.y + 1 ||
            b.y + b.height <= a.y + 1
        ).toBeTruthy();
      }
    );
  }
}

test("five conditions and overflow button fit the narrow HUD", async ({
  page
}) => {
  const ids = Array.from({ length: 13 }, (_, i) => "status" + i);
  globalThis.game = { i18n: { localize: key => key } };
  const { combatStatuses } = createCombatStatusRenderer({
    actor: { statuses: new Set(ids), effects: [] },
    adapter: {},
    escapeHTML,
    hudState: {},
    t,
    visibility: { conditions: true }
  });
  await page.setContent(
    "<style>" +
      css +
      '</style><div class="ws-rolls-dialog" style="width:270px"><div class="ws-shell"><div class="ws-view">' +
      combatStatuses() +
      "</div></div></div>"
  );
  const buttons = await page.locator(".ws-active-conditions > *").all();
  expect(buttons).toHaveLength(6);
  const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
  expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(1);
});

test("font setting scales combat text", async ({ page }) => {
  await page.setContent(
    "<style>" +
      css +
      '</style><div class="ws-rolls-dialog ws-font-medium"><div class="ws-view"><div class="ws-spell-level-heading"><strong>Level 1</strong></div></div></div>'
  );
  const label = page.locator(".ws-spell-level-heading strong");
  const medium = await label.evaluate(node =>
    parseFloat(getComputedStyle(node).fontSize)
  );
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.className = "ws-rolls-dialog ws-font-extralarge";
  });
  const extra = await label.evaluate(node =>
    parseFloat(getComputedStyle(node).fontSize)
  );
  expect(extra).toBeGreaterThan(medium);
});

test("favorites fit a narrow window without drag handles", async ({ page }) => {
  const { renderer } = itemRendererFixture({
    items: [
      { id: "a", name: "A long favorite item name", type: "feat" },
      { id: "b", name: "B favorite", type: "feat" }
    ],
    hudState: {
      favoriteEntries: [
        { itemId: "a", activityId: null },
        { itemId: "b", activityId: null }
      ],
      favoritesExpanded: true
    },
    visibility: { favorites: true }
  });
  await page.setContent(
    "<style>" +
      css +
      '</style><div class="ws-rolls-dialog ws-font-extralarge" style="width:270px">' +
      renderer.favoriteSection() +
      "</div>"
  );
  const cards = page.locator(".ws-favorites .ws-combat-item-card");
  await expect(page.locator("[data-favorite-drag-handle]")).toHaveCount(0);
  const fits = await cards.evaluateAll(nodes =>
    nodes.every(
      node =>
        node.getBoundingClientRect().right <=
        node.closest(".ws-rolls-dialog").getBoundingClientRect().right + 1
    )
  );
  expect(fits).toBe(true);
});
