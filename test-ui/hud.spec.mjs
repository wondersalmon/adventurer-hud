import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createCombatSpellRenderer } from "../scripts/hud/combat-spells.js";
import { createCombatStatusRenderer } from "../scripts/hud/combat-statuses.js";
import { renderGmCombatHeader } from "../scripts/hud/gm-combat.js";
import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createHudComponents } from "../scripts/hud/components.js";
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

test("GM identity and bottom tools fit a narrow window with long action lists", async ({
  page
}) => {
  globalThis.game = {
    settings: { get: () => false },
    i18n: { localize: key => key }
  };
  const actor = {
    type: "npc",
    name: "Tarrasque",
    img: "icons/svg/mystery-man.svg",
    statuses: new Set(),
    effects: []
  };
  const adapter = {
    classSummary: () => "",
    combatStats: () => ({
      ac: 25,
      hp: { value: 600, max: 676, temp: 0 },
      speed: 60,
      proficiencyBonus: 9
    }),
    movementSummary: () => "Walk 60 ft · Burrow 40 ft · Climb 60 ft",
    npcMovement: () => ({
      primary: "60 ft",
      secondary: "Burrow 40 ft · Climb 60 ft"
    }),
    npcResource: () => ({ value: 6, max: 6 }),
    npcTraits: () => [{ title: "GM.DamageImmunities", text: "Fire, poison" }]
  };
  const { actorHeader } = createHudComponents({
    actor,
    adapter,
    escapeHTML,
    t
  });
  const { renderer } = itemRendererFixture({
    items: Array.from({ length: 20 }, (_, id) => ({
      id: String(id),
      type: "feat",
      name: `A long monster feature ${id}`
    })),
    adapter: {
      combatItems: () =>
        Array.from({ length: 20 }, (_, id) => ({
          id: String(id),
          name: `A long monster feature ${id}`,
          type: "feat"
        }))
    },
    hudState: { combatCategory: "features" }
  });
  const { combatHTML } = createCombatRenderer({
    actor,
    actorHeader,
    adapter,
    canRollActor: true,
    escapeHTML,
    formatMod: value => `+${value}`,
    hudState: {},
    visibility: {},
    t,
    getCombatState: () => ({ isTurn: true, canEndTurn: true }),
    gmHeader: () => "<section class='ws-gm-combat'>Creatures</section>",
    favoriteSection: () => "",
    combatActions: renderer.combatActions,
    modeNavigation: () => "",
    shortcutHint: () => ""
  });
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog ws-font-extralarge" style="width:320px"><div class="window-content" style="height:380px;padding:0"><form><div class="dialog-content standard-form"><div class="ws-shell">${combatHTML()}</div></div></form></div></div>`
  );
  await expect(page.locator('[data-action="gmsheet"]')).toHaveCount(1);
  await expect(page.locator(".ws-gm-secondary-speed")).not.toBeVisible();
  await page.locator(".ws-gm-secondary-speed").evaluate(node => {
    node.hidden = !node.hidden;
  });
  await expect(page.locator(".ws-gm-secondary-speed")).toBeVisible();
  await page.locator(".ws-gm-secondary-speed").evaluate(node => {
    node.hidden = !node.hidden;
  });

  await expect(page.locator('[data-action="gmcenter"]')).toHaveCount(1);
  await expect(page.locator('[data-action="gmping"]')).toHaveCount(1);
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node =>
      node.style.setProperty("--background", "rgba(20, 20, 20, 0.5)")
    );
  expect(
    await page
      .locator(".ws-gm-tools")
      .evaluate(node => getComputedStyle(node).backgroundColor)
  ).toBe("rgb(23, 23, 28)");

  const fits = await page
    .locator(".ws-gm-view")
    .evaluate(node => node.scrollWidth <= node.clientWidth + 1);
  expect(fits).toBe(true);
  const listBounds = await page.locator(".ws-combat-item-list").boundingBox();
  const savesBounds = await page.locator(".ws-gm-special-column").boundingBox();
  expect(savesBounds.y).toBeGreaterThanOrEqual(
    listBounds.y + listBounds.height
  );
  expect(
    await page
      .locator(".ws-combat-item-list")
      .evaluate(
        node =>
          node.scrollHeight > node.clientHeight &&
          getComputedStyle(node).overflowY === "auto"
      )
  ).toBe(true);
  await page.locator(".window-content").evaluate(node => {
    node.style.height = "220px";
  });
  const narrowViewport = await page.locator(".window-content").boundingBox();
  const narrowFooter = await page.locator(".ws-gm-tools").boundingBox();
  expect(narrowFooter.y + narrowFooter.height).toBeLessThanOrEqual(
    narrowViewport.y + narrowViewport.height + 1
  );
  expect(narrowFooter.y).toBeGreaterThanOrEqual(narrowViewport.y);
  await page.locator(".window-content").evaluate(node => {
    node.style.height = "380px";
  });
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.style.width = "1100px";
  });
  const columns = await page.locator(".ws-gm-body").evaluate(node =>
    [...node.children].map(child => ({
      left: child.getBoundingClientRect().left,
      top: child.getBoundingClientRect().top,
      bottom: child.getBoundingClientRect().bottom
    }))
  );
  expect(columns[1].left).toBeGreaterThan(columns[0].left);
  expect(columns[2].left).toBeGreaterThan(columns[1].left);
  expect(
    await page
      .locator(".ws-gm-view")
      .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true);

  const viewport = await page.locator(".window-content").boundingBox();
  const footer = await page.locator(".ws-gm-tools").boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(
    viewport.y + viewport.height + 1
  );
  const body = await page.locator(".ws-gm-body").boundingBox();
  const roster = await page.locator(".ws-gm-combat").boundingBox();
  expect(roster.y).toBeCloseTo(body.y, 0);
  expect(roster.x + roster.width).toBeLessThanOrEqual(body.x);
  await page.screenshot({ path: "test-results/gm-wide-short.png" });
});

test("GM toolbar fits a narrow HUD with wrapping portraits and HP above each token", async ({
  page
}) => {
  globalThis.game = { settings: { get: () => true } };
  const list = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    name: `Goblin with a long name ${index}`,
    initiative: 15,
    hidden: index === 0,
    defeated: index === 1,
    token: { actor: { img: "icons/svg/mystery-man.svg" } }
  }));
  const combat = {
    id: "battle",
    name: "An encounter with a long name",
    started: true,
    round: 3,
    combatant: list[0]
  };
  const html = renderGmCombatHeader({
    controller: {
      isGM: () => true,
      getCombat: () => combat,
      combats: () => [combat],
      roster: () => list
    },
    selectedId: "0",
    adapter: { combatStats: () => ({ hp: { value: 12, max: 20, temp: 3 } }) },
    escapeHTML,
    t: key => key.split(".").at(-1),
    tf: (_key, { round }) => `Round ${round}`
  });
  await page.setContent(
    `<style>button { height: 32px; line-height: 32px; } ${css}</style><div class="ws-rolls-dialog ws-font-extralarge" style="width:320px"><div class="ws-shell"><div class="ws-view">${html}</div></div></div>`
  );
  const toolbar = page.locator(".ws-gm-toolbar");
  const fits = await toolbar.evaluate(
    node => node.scrollWidth <= node.clientWidth + 1
  );
  expect(fits).toBe(true);
  const roster = page.locator(".ws-gm-roster");
  expect(
    await roster.evaluate(
      node =>
        node.scrollHeight <= node.clientHeight + 1 &&
        node.scrollWidth <= node.clientWidth + 1
    )
  ).toBe(true);
  await expect(page.locator('[data-action="gmselect"]')).toHaveCount(8);
  await expect(page.locator(".ws-selected")).toHaveCount(1);
  await expect(roster.locator("img")).toHaveCount(8);
  const cards = await roster.locator(".ws-gm-creature").evaluateAll(nodes =>
    nodes.map(node => ({
      box: node.getBoundingClientRect().toJSON(),
      image: node.querySelector("img").getBoundingClientRect().toJSON(),
      name: node.querySelector("strong").getBoundingClientRect().toJSON()
    }))
  );
  for (const card of cards) {
    expect(card.image.bottom).toBeLessThanOrEqual(card.box.bottom);
    expect(card.name.bottom).toBeLessThanOrEqual(card.box.bottom);
  }
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].box,
        b = cards[j].box;
      expect(
        a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top
      ).toBe(true);
    }

  await expect(page.locator('[data-action="gmsettings"]')).toHaveCount(0);
});

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

test("unstarted combat has a prominent start button with a bounded red alert and reduced-motion support", async ({
  page
}) => {
  globalThis.game = { settings: { get: () => true } };
  const combat = { id: "battle", started: false, round: 0 };
  const html = renderGmCombatHeader({
    controller: {
      isGM: () => true,
      getCombat: () => combat,
      combats: () => [combat],
      roster: () => []
    },
    selectedId: null,
    adapter: {},
    escapeHTML,
    t,
    tf: () => "Round 0"
  });
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog"><div class="ws-shell">${html}</div></div>`
  );
  const start = page.locator('[data-action="gmstartcombat"]');
  await expect(start).toBeVisible();
  await expect(start.locator(".fa-play")).toHaveCount(1);
  expect(
    await start.evaluate(
      node => getComputedStyle(node, "::after").animationIterationCount
    )
  ).toBe("2");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await start.evaluate(
      node => getComputedStyle(node, "::after").animationName
    )
  ).toBe("none");
});
