import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { createItemPanelRenderer } from "../scripts/hud/items/item-panels.js";
import { escapeHTML } from "../tests/helpers/rendering.mjs";

test("compact spell controls stay square, separate and readable across sizes and themes", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  const spell = { id: "spell", name: "Catapult", type: "spell" };
  const renderer = createItemPanelRenderer({
    actor: { isOwner: true, items: new Map([[spell.id, spell]]) },
    adapter: {
      itemRole: () => "spell",
      itemActivities: item =>
        item.id === "multi"
          ? [
              { id: "cast", name: "Cast", use() {} },
              { id: "damage", name: "Damage", use() {} }
            ]
          : [],
      spellPreparation: () => ({ canPrepare: true, prepared: true }),
      itemActivation: () => "action",
      hasItemProperty: (_item, key) => key === "concentration",
      itemRangeData: () => ({ value: 60, units: "ft" }),
      rangeUnitLabel: () => "Feet",
      itemUsesData: () => null,
      itemAttackBonus: () => "",
      itemSaveDc: () => 15,
      itemDamageFormula: () => "3d8"
    },
    escapeHTML,
    hudState: { favoriteEntries: [] },
    t: key => (key === "Combat.SaveDCShort" ? "DC" : key),
    visibility: {
      favorites: true,
      itemDetails: true,
      activityPicker: true
    }
  });
  const html =
    renderer.combatItemButton(spell) +
    renderer.combatItemButton({
      ...spell,
      name: "Very long spell name that must wrap without overlapping preparation"
    }) +
    renderer.combatItemButton({
      ...spell,
      id: "multi",
      name: "Armor of Agathys"
    }) +
    renderer.combatItemButton({
      ...spell,
      id: "multi",
      name: "Very long spell with multiple activities and preparation controls"
    });
  for (const width of [270, 450])
    for (const font of ["medium", "extralarge"])
      for (const theme of ["dark", "light"]) {
        await page.setContent(
          `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-${font}" style="width:${width}px"><div class="ws-shell"><div class="ws-combat-item-list">${html}</div></div></section>`
        );
        const card = page.locator(".ws-spell-card").first();
        await expect(card.locator(":scope > .ws-item-favorite")).toHaveCount(1);
        await expect(
          card.locator('button[data-action="togglespellprepared"]')
        ).toHaveAttribute("aria-pressed", "true");
        const result = await page.locator(".ws-spell-card").evaluateAll(cards =>
          cards.map(card => {
            const prep = card.querySelector(".ws-item-prepare"),
              main = card.querySelector(".ws-combat-item");
            const name = main.querySelector("strong"),
              range = document.createRange();
            range.selectNodeContents(name);
            const prepBox = prep.getBoundingClientRect();
            const arrow = main.querySelector(".fa-chevron-down");
            const arrowBox = arrow?.getBoundingClientRect();
            return {
              height: card.getBoundingClientRect().height,
              overflow: card.scrollWidth > card.clientWidth + 1,
              nested: !!prep.closest(".ws-combat-item"),
              textRight: Math.max(
                ...[...range.getClientRects()].map(rect => rect.right)
              ),
              prepLeft: prepBox.left,
              prepBottom: prepBox.bottom,
              arrowTop: arrowBox?.top,
              arrowRight: arrowBox?.right,
              mainRight: main.getBoundingClientRect().right,
              controls: [
                prep,
                ...card.querySelectorAll(":scope > .ws-item-favorite")
              ].map(button => {
                const b = button.getBoundingClientRect();
                return [
                  b.width,
                  b.height,
                  getComputedStyle(button).borderRadius
                ];
              })
            };
          })
        );
        for (const entry of result) {
          expect(entry.overflow).toBe(false);
          expect(entry.nested).toBe(false);
          expect(entry.textRight).toBeLessThanOrEqual(entry.prepLeft + 1);
          if (entry.arrowTop !== undefined) {
            expect(entry.arrowRight).toBeLessThanOrEqual(entry.prepLeft);
            expect(entry.arrowRight).toBeLessThan(entry.mainRight);
          }
          for (const [width, height, radius] of entry.controls) {
            expect(width).toBe(26);
            expect(height).toBe(26);
            expect(radius).toBe("7px");
          }
        }
        if (width === 450 && font === "medium")
          expect(result[0].height).toBeLessThanOrEqual(65);
        if (width === 450 && font === "medium" && theme === "dark")
          await page
            .locator("section")
            .screenshot({ path: "dev/compact-spells-preview.png" });
        await card.locator(".ws-item-prepare").focus();
        await expect(card.locator(".ws-item-prepare")).toBeFocused();
      }
  await page.emulateMedia({ media: "screen" });
});

test("localized spell filters keep preparation counts readable in narrow panels and hide together", async ({
  page
}) => {
  const { createAbilityComponents } =
    await import("../scripts/hud/ability-components.js");
  const { readFile } = await import("node:fs/promises");
  for (const language of ["en", "ru"]) {
    const fixture = await layoutFixture(language);
    const translations = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    const visibility = { spellPreparation: true };
    const controls = createAbilityComponents({
      visibility,
      actor: {},
      hudState: { preparedSpellsOnly: true },
      escapeHTML,
      t: key => translations[`ADVENTURER_HUD.${key}`],
      adapter: {
        spellSources: () => [
          {
            source: "class:warlock",
            name: language === "ru" ? "Колдун" : "Warlock"
          }
        ],
        spellPreparationLimits: () => [
          {
            source: "class:warlock",
            name: language === "ru" ? "Колдун" : "Warlock",
            value: 12,
            max: 10
          }
        ]
      }
    });
    for (const theme of ["light", "dark"]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-extralarge" style="width:270px"><div class="ws-shell">${controls.spellFilterHTML()}</div></section>`
      );
      const toggle = page.locator("[data-spell-filters-toggle]");
      await expect(page.locator(".ws-spell-filter")).not.toBeVisible();
      await expect(toggle).toContainText(
        language === "ru" ? "Подготовленные" : "Prepared"
      );
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".ws-spell-filter")).toBeVisible();
      await expect(
        page.locator('.ws-spell-filter [aria-pressed="true"]')
      ).toHaveCount(1);
      await expect(
        page.locator('[data-source="class:warlock"] strong')
      ).toHaveText("12/10");
      const overflow = await page
        .locator(".ws-shell")
        .evaluate(node => node.scrollWidth > node.clientWidth + 1);
      expect(overflow).toBe(false);
      await loadHudModules(page, {
        "hud/window/dom-state.js": ["captureHudDomState", "restoreHudDomState"]
      });
      await toggle.focus();
      await page.evaluate(() => {
        const root = document.querySelector(".ws-shell");
        const snapshot = window.captureHudDomState(root);
        root.innerHTML = root.innerHTML;
        root.querySelector("details").open = false;
        window.restoreHudDomState(root, snapshot, { layoutApplied: true });
      });
      await expect(toggle).toBeFocused();
      await expect(page.locator(".ws-spell-filter")).toBeVisible();
      await page.locator('[data-source="class:warlock"]').focus();
      await expect(page.locator('[data-source="class:warlock"]')).toBeFocused();
    }
    visibility.spellPreparation = false;
    await page.locator(".ws-shell").evaluate((node, html) => {
      node.innerHTML = html;
    }, controls.spellFilterHTML());
    await expect(
      page.locator(".ws-spell-filter, .ws-spell-preparation-summary")
    ).toHaveCount(0);
  }
});
