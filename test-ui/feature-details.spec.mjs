import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { itemRendererFixture } from "../tests/helpers/rendering.mjs";

test("feature source headers collapse from the keyboard and preserve separate active/passive states", async ({
  page
}) => {
  const f = await layoutFixture("en");
  await page.setContent(
    "<style>" +
      f.baseline +
      f.css +
      '</style><section class="ws-rolls-dialog ws-theme-dark" style="width:320px"><div class="ws-shell"></div></section>'
  );
  await loadHudModules(page, {
    "hud/items/item-layout.js": ["renderItemLayout"],
    "hud/view-actions.js": ["createViewActions"],
    "hud/window/dom-state.js": ["captureHudDomState", "restoreHudDomState"],
    "hud/state.js": ["createHudState"]
  });
  await page.evaluate(() => {
    const state = window.createHudState();
    window.featureState = state;
    window.featureScope = "features:active";
    const entries = [
      {
        key: "a",
        name: "A",
        group: { id: "class", label: "Class" },
        html: '<button class="ws-button">Feature A</button>'
      },
      {
        key: "b",
        name: "B",
        group: { id: "race", label: "Species" },
        html: '<button class="ws-button">Feature B</button>'
      }
    ];
    const root = document.querySelector(".ws-shell");
    const render = () =>
      (root.innerHTML = window.renderItemLayout({
        entries,
        scope: window.featureScope,
        hudState: state,
        t: key => key,
        escapeHTML: value => value
      }));
    window.renderFeatures = render;
    window.refreshFeatures = () => {
      const dom = window.captureHudDomState(root);
      render();
      window.restoreHudDomState(root, dom, { layoutApplied: true });
    };
    const actions = window.createViewActions({
      actor: { isOwner: true },
      hudState: state,
      refreshHud: render
    });
    root.addEventListener("click", event => {
      const target = event.target.closest("[data-action]");
      if (target) actions[target.dataset.action]?.(event, target);
    });
    render();
  });
  const header = page.locator('[data-feature-group="class"]');
  const second = page.locator('[data-feature-group="race"]');
  await page.evaluate(() => {
    window.originalFeatureCard = document.querySelector(
      '[data-layout-key="b"]'
    );
  });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () =>
        window.originalFeatureCard ===
        document.querySelector('[data-layout-key="b"]')
    )
  ).toBe(true);
  await page.evaluate(() => window.refreshFeatures());
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(header).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Feature A", exact: true })
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Feature B", exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    window.featureScope = "features:passive";
    window.renderFeatures();
  });
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => {
    window.featureScope = "features:active";
    window.renderFeatures();
  });
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Feature A", exact: true })
  ).toBeVisible();
  expect(
    await header.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true);
});

test("weapon mastery is displayed muted or in the accent only with player details", async ({
  page
}) => {
  const f = await layoutFixture("en");
  const { renderer, visibility } = itemRendererFixture({
    visibility: { itemDetails: true },
    adapter: {
      itemRole: () => "weapon",
      itemAttackBonus: () => "",
      itemDamageFormula: () => "",
      itemRangeData: () => ({}),
      rangeUnitLabel: () => "",
      weaponMastery: (_actor, item) => ({
        label: "Push",
        available: item.id === "known"
      })
    }
  });
  const weapon = { id: "known", name: "Pike", type: "weapon" };
  const known = renderer.combatItemButton(weapon);
  const unavailable = renderer.combatItemButton({ ...weapon, id: "unknown" });
  visibility.gm = true;
  const gm = renderer.combatItemButton(weapon);
  for (const theme of ["dark", "light"]) {
    await page.setContent(
      "<style>" +
        f.baseline +
        f.css +
        '</style><section class="ws-rolls-dialog ws-theme-' +
        theme +
        '" style="width:320px"><div class="ws-shell">' +
        known +
        unavailable +
        gm +
        "</div></section>"
    );
    await expect(page.locator(".ws-weapon-mastery")).toHaveCount(2);
    const colors = await page
      .locator(".ws-weapon-mastery")
      .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
    expect(colors[0]).not.toBe(colors[1]);
    await expect(page.locator(".ws-mastery-available")).toHaveText("Push");
  }
});

test("inventory quantities and attunement labels fit narrow cards in both HUD languages", async ({
  page
}) => {
  const { readFile } = await import("node:fs/promises");
  const { dnd5eAdapter } = await import("../scripts/dnd5e/index.js");
  for (const language of ["en", "ru"]) {
    const fixture = await layoutFixture(language);
    const catalog = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    const t = key => catalog[`ADVENTURER_HUD.${key}`] ?? key;
    const f = itemRendererFixture({
      t,
      adapter: { inventoryInfo: dnd5eAdapter.inventoryInfo },
      visibility: { cardDetailFields: [] }
    });
    const html = [false, true]
      .map((attuned, i) =>
        f.renderer.combatItemButton(
          {
            id: String(i),
            type: "equipment",
            name:
              language === "en"
                ? "Ring with a long descriptive name"
                : "Кольцо с очень длинным названием",
            system: {
              quantity: i === 0 ? 0 : 12,
              attunement: "required",
              attuned
            }
          },
          { inventory: true }
        )
      )
      .join("");
    for (const theme of ["dark", "light"]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-extralarge" style="width:270px"><div class="ws-shell"><div class="ws-combat-item-list">${html}</div></div></section>`
      );
      await expect(page.locator(".ws-inventory-quantity").first()).toHaveText(
        "× 0"
      );
      await expect(page.locator(".ws-inventory-quantity").last()).toHaveText(
        "× 12"
      );
      await expect(page.locator(".ws-not-attuned")).toHaveText(
        t("Inventory.AttunementRequired")
      );
      await expect(page.locator(".ws-attuned")).toHaveText(
        t("Inventory.Attuned")
      );
      const overflow = await page
        .locator(".ws-combat-item-card")
        .evaluateAll(cards =>
          cards.some(card => card.scrollWidth > card.clientWidth + 1)
        );
      expect(overflow).toBe(false);
    }
  }
});
