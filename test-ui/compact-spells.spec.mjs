import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
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
    visibility: { favorites: true, itemDetails: true, activityPicker: true }
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
        await expect(
          card.locator(".ws-item-side-actions > button")
        ).toHaveCount(1);
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
                ...card.querySelectorAll(".ws-item-side-actions button")
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
