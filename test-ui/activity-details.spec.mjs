import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";
import { createCombatItemCardRenderer } from "../scripts/hud/items/combat-item-card.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { CARD_DETAIL_FIELDS } from "../scripts/settings-schema.js";
import { escapeHTML } from "../tests/helpers/rendering.mjs";

for (const language of ["en", "ru"])
  test(
    "exact Activity details remain readable at narrow widths and large fonts: " +
      language,
    async ({ page }) => {
      const f = await layoutFixture(language);
      const labels = JSON.parse(
        await readFile(
          new URL("../lang/" + language + ".json", import.meta.url),
          "utf8"
        )
      );
      const t = key => labels["ADVENTURER_HUD." + key] ?? key;
      const item = {
        id: "strike",
        name: language === "ru" ? "Безоружная атака" : "Unarmed Strike",
        type: "feat",
        system: {
          activities: new Map([
            [
              "attack",
              {
                id: "attack",
                name:
                  language === "ru"
                    ? "Атака с длинным названием"
                    : "Attack with a longer action name",
                type: "attack",
                activation: { type: "action" },
                labels: {
                  toHit: "+3",
                  damages: [{ formula: "1", damageType: "bludgeoning" }]
                },
                range: { value: 5, units: "ft" },
                use() {}
              }
            ],
            [
              "grapple",
              {
                id: "grapple",
                name: language === "ru" ? "Захват" : "Grapple",
                type: "save",
                activation: { type: "action" },
                labels: {},
                save: { dc: { value: 11 } },
                range: { value: 5, units: "ft" },
                use() {}
              }
            ],
            [
              "shove",
              {
                id: "shove",
                name: language === "ru" ? "Толчок" : "Shove",
                type: "save",
                activation: { type: "action" },
                labels: {},
                save: { dc: { value: 12 } },
                range: { value: 5, units: "ft" },
                use() {}
              }
            ]
          ])
        }
      };
      globalThis.CONFIG.DND5E.damageTypes = {
        bludgeoning: { label: language === "ru" ? "Дробящий" : "Bludgeoning" }
      };
      const render = createCombatItemCardRenderer({
        actor: { isOwner: true, items: new Map([[item.id, item]]) },
        adapter: { ...dnd5eAdapter, rangeUnitLabel: units => units },
        escapeHTML,
        hudState: { favoriteEntries: [], openActivityItemId: item.id },
        t,
        visibility: {
          activityPicker: true,
          favorites: true,
          cardDetailFields: CARD_DETAIL_FIELDS
        }
      });
      const markup = render(item);
      for (const width of [240, 320])
        for (const font of ["medium", "extraLarge"]) {
          await page.setContent(
            "<style>" +
              f.baseline +
              "button{display:inline-flex;align-items:center;justify-content:center;text-align:center}" +
              f.css +
              '</style><section class="ws-rolls-dialog ws-theme-dark ws-font-' +
              font.toLowerCase() +
              '" style="min-width:0;width:' +
              width +
              'px"><div class="ws-shell">' +
              markup +
              "</div></section>"
          );
          expect(
            await page
              .locator(".ws-rolls-dialog")
              .evaluate(element =>
                Math.round(element.getBoundingClientRect().width)
              )
          ).toBe(width);
          const options = page.locator(
            '.ws-activity-option > [data-action="useactivity"]'
          );
          await expect(options).toHaveCount(3);
          const favoriteBounds = await page
            .locator(".ws-activity-option")
            .evaluateAll(nodes =>
              nodes.map(node => {
                const card = node
                  .querySelector('[data-action="useactivity"]')
                  .getBoundingClientRect();
                const star = node
                  .querySelector(".ws-item-favorite")
                  .getBoundingClientRect();
                return (
                  star.left >= card.left &&
                  star.right <= card.right + 1 &&
                  star.top >= card.top &&
                  star.bottom <= card.bottom + 1
                );
              })
            );
          expect(favoriteBounds).toEqual([true, true, true]);
          await expect(
            page.locator(
              '.ws-activity-option [data-activity-id="attack"][data-action="useactivity"]'
            )
          ).toContainText("+3");
          await expect(
            page.locator(
              '.ws-activity-option [data-activity-id="grapple"][data-action="useactivity"]'
            )
          ).toContainText("11");
          await expect(
            page.locator(
              '.ws-activity-option [data-activity-id="shove"][data-action="useactivity"]'
            )
          ).toContainText("12");
          const violations = await options.evaluateAll(buttons =>
            buttons.flatMap(button => {
              const rect = button.getBoundingClientRect(),
                meta = button
                  .querySelector(".ws-spell-meta")
                  .getBoundingClientRect();
              return [
                button.scrollWidth > button.clientWidth + 1
                  ? "horizontal overflow"
                  : null,
                button.scrollHeight > button.clientHeight + 1
                  ? "clipped height"
                  : null,
                meta.bottom > rect.bottom + 1 ? "metadata outside button" : null
              ].filter(Boolean);
            })
          );
          expect(violations, width + "px " + font).toEqual([]);
          const alignment = await options.evaluateAll(buttons =>
            buttons.map(button => {
              const rect = button.getBoundingClientRect();
              const label = button
                .querySelector("strong")
                .getBoundingClientRect();
              const meta = button
                .querySelector(".ws-spell-meta")
                .getBoundingClientRect();
              return {
                label: label.left - rect.left,
                meta: meta.left - rect.left
              };
            })
          );
          expect(
            Math.max(...alignment.map(value => value.label)) -
              Math.min(...alignment.map(value => value.label))
          ).toBeLessThanOrEqual(1);
          for (const value of alignment) {
            expect(value.label).toBeLessThanOrEqual(12);
            expect(Math.abs(value.meta - value.label)).toBeLessThanOrEqual(1);
          }
          await options.nth(1).focus();
          await page.evaluate(() => {
            window.lastActivity = null;
            document
              .querySelector(".ws-shell")
              .addEventListener("click", event => {
                window.lastActivity = event.target.closest(
                  '[data-action="useactivity"]'
                )?.dataset.activityId;
              });
          });
          await page.keyboard.press("Enter");
          expect(await page.evaluate(() => window.lastActivity)).toBe(
            "grapple"
          );
        }
    }
  );
