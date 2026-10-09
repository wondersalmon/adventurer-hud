import { synchronizeStatusLayout } from "../scripts/hud/window/status-layout.js";
import { applyPlayerLayout } from "../scripts/hud/window/responsive-layout.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createCombatSpellRenderer } from "../scripts/hud/items/combat-spells.js";
import { createCombatStatusRenderer } from "../scripts/hud/combat-statuses.js";
import { renderGmCombatHeader } from "../scripts/hud/gm/gm-combat.js";
import { createCombatRenderer } from "../scripts/hud/combat.js";
import { createHudComponents } from "../scripts/hud/components.js";
import { bindItemDescriptionInteractions } from "../scripts/hud/items/item-interactions.js";
import { renderInventorySummary } from "../scripts/hud/items/inventory-summary.js";
import { synchronizeHudTheme, watchHudTheme } from "../scripts/hud/theme.js";
import {
  captureHudDomState,
  restoreHudDomState
} from "../scripts/hud/window/dom-state.js";
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

test("inventory weight and all coin types stay readable and distinct in both themes", async ({
  page
}) => {
  const labels = {
    "Inventory.Weight": "Вес / лимит",
    "Inventory.Currency": "Монеты",
    ...Object.fromEntries(
      ["cp", "sp", "ep", "gp", "pp"].flatMap((type, index) => [
        [`Inventory.Coin.${type}.Name`, type],
        [`Inventory.Coin.${type}.Unit`, ["мм", "см", "эм", "зм", "пм"][index]]
      ])
    )
  };
  const format = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
  const html = renderInventorySummary({
    data: {
      weight: 123456.7,
      maxWeight: 987654.3,
      units: "кг",
      coins: ["cp", "sp", "ep", "gp", "pp"].map(type => ({
        type,
        value: 1234567890123
      }))
    },
    t: key => labels[key],
    escapeHTML,
    formatNumber: value => format.format(value)
  });
  for (const width of [270, 320, 450]) {
    for (const theme of ["light", "dark"]) {
      await page.setContent(
        `<style>${css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-extralarge" style="width:${width}px"><div class="ws-shell"><div class="ws-view">${html}</div></div></section>`
      );
      for (const stat of await page.locator(".ws-inventory-stat").all()) {
        expect(
          await stat.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        const box = await stat.boundingBox();
        for (const value of await stat.locator("strong").all()) {
          const strong = await value.boundingBox();
          expect(strong.x + strong.width).toBeLessThanOrEqual(
            box.x + box.width + 1
          );
        }
      }
      await expect(page.locator(".ws-inventory-weight")).toContainText("кг");
      await expect(page.locator(".ws-inventory-currency")).toContainText("зм");
      const colors = await page
        .locator(".ws-coin")
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
      expect(new Set(colors).size).toBe(5);
      for (const coin of await page.locator(".ws-coin").all())
        expect(
          await coin.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
    }
  }
});

test("refresh restores the exact repeated button for keyboard activation", async ({
  page
}) => {
  await page.addScriptTag({
    content: `${synchronizeStatusLayout.toString()}
${applyPlayerLayout.toString()}
${captureHudDomState.toString()}\n${restoreHudDomState.toString()}`
  });
  for (const attribute of [
    "data-proficient",
    "data-prepared",
    "data-view",
    "data-scope",
    "data-reroll",
    "data-reset-initiative-id",
    "data-companion-uuid",
    "data-companion-direction",
    "data-companion-filter"
  ]) {
    await page.setContent(
      `<main><button data-action="same" ${attribute}="first">First</button><button data-action="same" ${attribute}="second">Second</button></main>`
    );
    await page.locator("button").nth(1).focus();
    await page.evaluate(() => {
      const root = document.querySelector("main");
      const state = captureHudDomState(root);
      root.innerHTML = root.innerHTML;
      restoreHudDomState(root, state);
    });
    await expect(page.locator("button").nth(1)).toBeFocused();
  }
});

test("player portrait and name support keyboard activation without overflowing the header", async ({
  page
}) => {
  const { actorHeader } = createHudComponents({
    actor: { name: "A character with a rather long name", img: "" },
    adapter: { classSummary: () => "Bard 8 / Fighter 2" },
    escapeHTML,
    t
  });
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog" style="width:320px">${actorHeader()}</div>`
  );
  await expect(page.locator('button[data-action="gmsheet"]')).toHaveCount(2);
  await page.evaluate(() => {
    window.sheetOpenCount = 0;
    document.addEventListener("click", event => {
      if (event.target.closest('[data-action="gmsheet"]'))
        window.sheetOpenCount++;
    });
  });
  await page.keyboard.press("Tab");
  await expect(
    page.locator(".ws-actor-sheet-button:not(.ws-actor-identity)")
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("button.ws-actor-identity")).toBeFocused();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.sheetOpenCount)).toBe(2);
  expect(
    await page
      .locator(".ws-actor-header")
      .evaluate(node => node.scrollWidth <= node.clientWidth)
  ).toBe(true);
});

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
    getCombatState: () => ({
      combat: { started: true },
      isTurn: true,
      canEndTurn: true
    }),
    gmHeader: () => "<section class='ws-gm-combat'>Creatures</section>",
    favoriteSection: () => "",
    combatActions: renderer.combatActions,
    modeNavigation: () => "",
    shortcutHint: () => ""
  });
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog ws-font-extralarge" style="width:320px"><div class="window-content" style="height:380px;padding:0"><form><div class="dialog-content standard-form"><div class="ws-shell">${combatHTML()}</div></div></form></div></div>`
  );
  await expect(page.locator('button[data-action="gmsheet"]')).toHaveCount(1);
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
  const infoBounds = await page.locator(".ws-gm-info").boundingBox();
  expect(listBounds.y).toBeGreaterThanOrEqual(infoBounds.y + infoBounds.height);
  expect(
    await page
      .locator(".ws-gm-content")
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
  expect(columns).toHaveLength(2);
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
  await page.screenshot({ path: "dev/test-results/gm-wide-short.png" });
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
    token: { id: String(index), actor: { img: "icons/svg/mystery-man.svg" } }
  }));
  globalThis.canvas = {
    scene: {
      id: "scene",
      tokens: new Map(list.map(entry => [entry.token.id, entry.token]))
    }
  };
  const combat = {
    id: "battle",
    name: "An encounter with a long name",
    started: true,
    round: 3,
    combatant: list[0],
    turns: list
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
  const cards = await roster.locator(".ws-gm-roster-entry").evaluateAll(nodes =>
    nodes.map(node => ({
      box: node.getBoundingClientRect().toJSON(),
      image: node
        .closest(".ws-gm-roster-entry")
        .querySelector("img")
        .getBoundingClientRect()
        .toJSON(),
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
    escapeHTML,
    hudState: {},
    t,
    tf: (_key, { level }) => `LEVEL ${level}`
  });
  const items = [1, 2, 3].flatMap(level =>
    Array.from({ length: 12 }, (_, index) => ({
      level,
      id: `spell-${level}-${index}`,
      name: `Spell ${index}`
    }))
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

test("effects fill one row and reserve room for the overflow counter during resizing", async ({
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
  await page.addScriptTag({ content: synchronizeStatusLayout.toString() });
  let previousCount = 0;
  for (const width of [270, 320, 450, 700]) {
    await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
      node.style.width = width + "px";
      synchronizeStatusLayout(document);
    }, width);
    const values = await page.locator(".ws-combat-statuses").evaluate(panel => {
      const row = panel.querySelector(".ws-active-conditions");
      const more = panel.querySelector(".ws-status-more");
      const icons = [...row.querySelectorAll(".ws-status")];
      const boxes = [...icons, ...(more.hidden ? [] : [more])].map(node =>
        node.getBoundingClientRect()
      );
      const gap = parseFloat(getComputedStyle(row).columnGap);
      const used =
        boxes.reduce((sum, box) => sum + box.width, 0) +
        gap * (boxes.length - 1);
      return {
        count: icons.length,
        overflow: panel.querySelectorAll(".ws-status-extra .ws-status").length,
        counter: more.textContent,
        hidden: more.hidden,
        used,
        width: row.clientWidth,
        ys: boxes.map(box => Math.round(box.y)),
        extraHidden: panel.querySelector(".ws-status-extra").hidden
      };
    });
    expect(values.count).toBeGreaterThanOrEqual(previousCount);
    expect(values.count + values.overflow).toBe(13);
    expect(new Set(values.ys).size).toBe(1);
    expect(values.used).toBeLessThanOrEqual(values.width);
    if (values.overflow) {
      expect(values.counter).toBe("+" + values.overflow);
      expect(values.width - values.used).toBeLessThan(35);
      expect(values.extraHidden).toBe(true);
    } else expect(values.hidden).toBe(true);
    previousCount = values.count;
  }
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.style.width = "270px";
    node.querySelector(".ws-status-more").setAttribute("aria-expanded", "true");
    synchronizeStatusLayout(document);
  });
  await expect(page.locator(".ws-status-extra")).toBeVisible();
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

test("item description gestures preserve left-click modifiers and work on depleted cards", async ({
  page
}) => {
  const { renderer } = itemRendererFixture({
    items: [{ id: "a", name: "Sword", type: "feat" }],
    hudState: {
      favoriteEntries: [{ itemId: "a", activityId: null }],
      favoritesExpanded: true
    },
    visibility: { favorites: true }
  });
  await page.setContent(
    `<style>${css}</style><div class="ws-rolls-dialog" style="width:320px">${renderer.favoriteSection()}</div>`
  );
  await page.addScriptTag({
    content: bindItemDescriptionInteractions.toString()
  });
  await page.evaluate(() => {
    window.gestures = [];
    const element = document.querySelector(".ws-rolls-dialog");
    window.unbindDescriptions = bindItemDescriptionInteractions({
      element,
      isActive: () => true,
      openItem: (event, target) =>
        window.gestures.push([
          "description",
          target.dataset.itemId,
          Boolean(event.shiftKey)
        ])
    });
    element.addEventListener("click", event =>
      window.gestures.push([
        "roll",
        event.shiftKey,
        event.altKey,
        event.ctrlKey
      ])
    );
  });
  const item = page.locator(".ws-combat-item");
  await item.click({ modifiers: ["Shift"] });
  await item.click({ modifiers: ["Alt"] });
  await item.click({ modifiers: ["Control"] });
  await item.click({ button: "right" });
  await item.click({ button: "right", modifiers: ["Shift"] });
  await item.focus();
  await page.keyboard.press("Shift+F10");
  expect(await page.evaluate(() => window.gestures.length)).toBe(5);
  await item.evaluate(node => {
    node.disabled = true;
  });
  const bounds = await item.boundingBox();
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { button: "right" }
  );
  expect(await page.evaluate(() => window.gestures)).toEqual([
    ["roll", true, false, false],
    ["roll", false, true, false],
    ["roll", false, false, true],
    ["description", "a", false],
    ["description", "a", true],
    ["description", "a", false]
  ]);
  await page.evaluate(() => window.unbindDescriptions());
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { button: "right" }
  );
  expect(await page.evaluate(() => window.gestures.length)).toBe(6);
});

test("favorite cards reclaim both side columns and removal controls fit in editing", async ({
  page
}) => {
  const { renderer } = itemRendererFixture({
    items: [
      { id: "a", name: "Shortbow", type: "feat" },
      { id: "b", name: "Flurry of Blows", type: "feat" }
    ],
    hudState: {
      favoriteEntries: [
        { itemId: "a", activityId: null },
        { itemId: "b", activityId: null }
      ],
      favoritesExpanded: true
    },
    adapter: { itemUsesData: () => ({ value: 2, max: 2 }) },
    visibility: { favorites: true }
  });
  for (const width of [270, 320, 600]) {
    await page.setContent(
      `<style>${css}</style><div class="ws-rolls-dialog ws-font-extralarge" style="width:${width}px">${renderer.favoriteSection()}</div>`
    );
    await expect(page.locator('[data-action="removefavorite"]')).toHaveCount(2);
    const compact = await page.locator(".ws-combat-item").first().boundingBox();
    const card = await page
      .locator(".ws-combat-item-card")
      .first()
      .boundingBox();
    await expect(page.locator(".ws-item-open")).toHaveCount(2);
    expect(card.width - compact.width).toBeCloseTo(27, 0);
    await page.locator(".ws-rolls-dialog").evaluate((node, html) => {
      node.innerHTML = html;
    }, renderer.favoriteSection());
    await expect(page.locator('[data-action="removefavorite"]')).toHaveCount(2);
    const editing = await page.locator(".ws-combat-item").first().boundingBox();
    expect(compact.width).toBeCloseTo(editing.width, 0);
    expect(
      await page
        .locator(".ws-combat-item-card")
        .evaluateAll(nodes =>
          nodes.every(node => node.scrollWidth <= node.clientWidth)
        )
    ).toBe(true);
  }
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

test("automatic themes match manual palettes, follow native theme changes and stop observing on disposal", async ({
  page
}) => {
  await page.setContent(
    `<style>${css}</style><style>.theme-dark { color-scheme: dark; --color-text-primary: #ddd; background: #101217; }.theme-light { color-scheme: light; --color-text-primary: #111; background: #fff; }</style><main class="theme-dark"><section class="ws-rolls-dialog"><header class="window-header">HUD</header><div class="window-content"><div class="ws-shell"><div class="ws-view"><button class="ws-button">Attack</button><input value="Search"></div></div></div></section></main>`
  );
  await page.addScriptTag({
    content: `${synchronizeHudTheme.toString()}\n${watchHudTheme.toString()}`
  });
  await page.addStyleTag({
    content: "* { transition: none !important; animation: none !important; }"
  });
  await page.evaluate(() => {
    window.selectedTheme = "auto";
    const element = document.querySelector("section");
    synchronizeHudTheme(element, window.selectedTheme);
    window.unwatchTheme = watchHudTheme(element, () => window.selectedTheme);
  });
  const palette = () =>
    page
      .locator(
        "section, .window-header, .window-content, .ws-shell, button, input"
      )
      .evaluateAll(nodes =>
        nodes.map(node => {
          const style = getComputedStyle(node);
          return [
            style.color,
            style.backgroundColor,
            style.borderColor,
            style.colorScheme
          ];
        })
      );
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "dark"
  );
  const dark = await palette();
  await page.evaluate(() => {
    window.selectedTheme = "dark";
    synchronizeHudTheme(document.querySelector("section"), "dark");
  });
  expect(await palette()).toEqual(dark);
  await page.evaluate(() => {
    document.querySelector("main").className = "theme-light";
  });
  await expect(page.locator("section")).toHaveClass(/ws-theme-dark/);
  expect(await palette()).toEqual(dark);
  await page.evaluate(() => {
    window.selectedTheme = "auto";
    synchronizeHudTheme(document.querySelector("section"), "auto");
  });
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "light"
  );
  const light = await palette();
  await page.evaluate(() => {
    window.selectedTheme = "light";
    synchronizeHudTheme(document.querySelector("section"), "light");
  });
  expect(await palette()).toEqual(light);
  await page.evaluate(() => {
    window.selectedTheme = "auto";
    synchronizeHudTheme(document.querySelector("section"), "auto");
    document.querySelector("main").className = "theme-dark";
  });
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "dark"
  );
  expect(await palette()).toEqual(dark);
  await page
    .locator("section")
    .evaluate(element => element.classList.add("theme-light"));
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "light"
  );
  await page
    .locator("section")
    .evaluate(element => element.classList.remove("theme-light"));
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "dark"
  );
  await page.evaluate(() => {
    window.unwatchTheme();
    document.querySelector("main").className = "theme-light";
  });
  await expect(page.locator("section")).toHaveAttribute(
    "data-ws-auto-theme",
    "dark"
  );
});

test("explicit HUD themes override host colors and keep light text readable", async ({
  page
}) => {
  await page.setContent(
    `<style>${css}</style><style>body { --color-text-primary: white; --color-text-secondary: #aaa; background: #111; }</style><section class="ws-rolls-dialog ws-theme-light"><header class="window-header">HUD</header><div class="window-content"><div class="ws-shell"><div class="ws-view"><button class="ws-button">Attack</button><input value="Search"><div class="ws-gm-tools">Next turn</div><span class="ws-spell-slots"><b>Spell</b></span><span class="ws-spell-slots ws-pact-slots"><b>Pact</b></span><span class="ws-health-condition ws-health-critical">Critical</span></div></div></div></section>`
  );
  const shell = page.locator(".ws-shell");
  await expect(shell).toHaveCSS("color", "rgb(41, 39, 34)");
  await expect(page.locator(".window-header")).toHaveCSS(
    "background-color",
    "rgb(245, 241, 232)"
  );
  await expect(page.locator("input")).toHaveCSS("color", "rgb(41, 39, 34)");
  await expect(page.locator(".ws-gm-tools")).toHaveCSS(
    "background-color",
    "rgb(245, 241, 232)"
  );
  await expect(page.locator(".ws-spell-slots:not(.ws-pact-slots) b")).toHaveCSS(
    "color",
    "rgb(33, 103, 127)"
  );
  await expect(page.locator(".ws-pact-slots b")).toHaveCSS(
    "color",
    "rgb(118, 67, 158)"
  );
  await page.locator("section").evaluate(el => {
    el.classList.remove("ws-theme-light");
    el.classList.add("ws-theme-dark");
  });
  await expect(shell).toHaveCSS("color", "rgb(230, 230, 223)");
  await expect(page.locator(".window-header")).toHaveCSS(
    "background-color",
    "rgb(25, 24, 31)"
  );
});
