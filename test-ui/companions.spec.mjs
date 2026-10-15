import { synchronizeStatusLayout } from "../scripts/hud/window/status-layout.js";
import { applyPlayerLayout } from "../scripts/hud/window/responsive-layout.js";
import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { readFile } from "node:fs/promises";
import {
  captureHudDomState,
  restoreHudDomState
} from "../scripts/hud/window/dom-state.js";

for (const language of ["en", "ru"]) {
  test(`${language} companion ping picker explains native modifiers at narrow widths`, async ({
    page
  }) => {
    const { css, baseline } = await layoutFixture(language);
    const catalog = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    await page.setContent(`<style>${baseline}${css}</style>`);
    await loadHudModules(page, {
      "hud/companions/companion-picker.js": ["createCompanionPicker"]
    });
    await page.evaluate(async catalog => {
      const t = key => catalog[`ADVENTURER_HUD.${key}`];
      const picker = window.createCompanionPicker({
        t,
        escapeHTML: value => {
          const node = document.createElement("span");
          node.textContent = value;
          return node.innerHTML;
        },
        isCurrent: () => true,
        DialogV2: class {
          constructor(options) {
            this.options = options;
          }
          render() {
            const dialog = document.createElement("section");
            dialog.className =
              "ws-rolls-dialog ws-companion-picker ws-theme-light";
            dialog.style.cssText = "width:270px;font-size:20px;padding:12px";
            dialog.append(this.options.content);
            document.body.append(dialog);
          }
        }
      });
      await picker.withToken(
        {
          tokenOptions: [
            { uuid: "Scene.scene.Token.one", name: "First token" },
            { uuid: "Scene.scene.Token.two", name: "Second token" }
          ]
        },
        () => {},
        { hint: t("Companions.PingChooseHint") }
      );
    }, catalog);
    const select = page.locator(".ws-companion-picker select");
    await expect(select).toHaveAccessibleDescription(
      catalog["ADVENTURER_HUD.Companions.PingChooseHint"]
    );
    await expect(page.locator("#ws-companion-picker-hint")).toBeVisible();
    expect(
      await page
        .locator(".ws-companion-picker")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
    ).toBe(true);
    await select.focus();
    await page.keyboard.press("ArrowDown");
    await expect(select).toHaveValue("1");
  });
}

test("companion native tooltip exposes its complete effect list at narrow widths", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog" style="width:270px">${bodies["player-companions-all"]}</section>`
  );
  const button = page.locator(".ws-companion-open").first();
  await button.hover();
  await expect(button).toHaveAttribute(
    "data-tooltip-class",
    "ws-gm-effects-tooltip"
  );
  const tooltip = await button.getAttribute("data-tooltip");
  expect(tooltip).toContain("<strong>");
  // Foundry owns tooltip activation; render the delegated content for layout checks.
  await page.evaluate(markup => {
    const node = document.createElement("div");
    node.id = "tooltip";
    node.className = "ws-gm-effects-tooltip";
    node.style.width = "240px";
    node.innerHTML = markup;
    document.body.append(node);
  }, tooltip);
  await expect(page.locator("#tooltip strong")).toBeVisible();
  expect(
    await page
      .locator("#tooltip")
      .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true);
});

test("companion secondary text stays readable and every row action remains reachable", async ({
  page
}) => {
  for (const language of ["ru", "en"]) {
    const { bodies, css, baseline } = await layoutFixture(language);
    for (const width of [270, 320, 450])
      for (const theme of ["light", "dark"])
        for (const font of ["medium", "extralarge"]) {
          await page.setContent(
            `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-${font}" style="width:${width}px"><div class="ws-shell">${bodies["player-companions-all-vision"]}</div></section>`
          );
          const text = await page
            .locator(
              ".ws-companion-copy small, .ws-companion-status, .ws-familiar-vision small"
            )
            .evaluateAll(nodes =>
              nodes.map(node => ({
                font: parseFloat(getComputedStyle(node).fontSize),
                overflow: node.scrollWidth > node.clientWidth + 1
              }))
            );
          expect(text.every(node => node.font >= 11 && !node.overflow)).toBe(
            true
          );
          for (const row of await page.locator(".ws-companion-row").all()) {
            await expect(
              row.locator('[data-action="companionsheet"]')
            ).toBeVisible();
            const name = row.locator(".ws-companion-copy strong");
            expect((await name.boundingBox()).width).toBeGreaterThan(60);
            const label = await row
              .locator(".ws-companion-open")
              .getAttribute("aria-label");
            expect(label).toContain(await name.innerText());
            const boxes = await row.locator("button").evaluateAll(nodes =>
              nodes.map(node => {
                const r = node.getBoundingClientRect();
                return {
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom
                };
              })
            );
            for (let index = 0; index < boxes.length; index++)
              for (const other of boxes.slice(index + 1)) {
                const box = boxes[index];
                expect(
                  box.right <= other.left ||
                    other.right <= box.left ||
                    box.bottom <= other.top ||
                    other.bottom <= box.top
                ).toBe(true);
              }
          }
          await expect(
            page.locator('[data-action="companionplace"]')
          ).toBeVisible();
          await expect(
            page.locator('[data-action="companionplace"]')
          ).toBeEnabled();
          expect(
            await page
              .locator(".ws-view")
              .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
          ).toBe(true);
        }
  }
});

test("refresh preserves each actual companion filter and its next keyboard action", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog" style="width:320px"><div class="ws-shell">${bodies["player-companions-all"]}</div></section>`
  );
  await page.addScriptTag({
    content: `${synchronizeStatusLayout.toString()}
${applyPlayerLayout.toString()}
${captureHudDomState.toString()}\n${restoreHudDomState.toString()}`
  });
  await page.evaluate(() => {
    document.addEventListener("click", event => {
      const filter = event.target.closest("[data-companion-filter]")?.dataset
        .companionFilter;
      if (filter) window.selectedFilter = filter;
    });
  });
  for (const value of ["scene", "all"]) {
    const button = page.locator(`[data-companion-filter="${value}"]`);
    await button.focus();
    await page.evaluate(() => {
      const root = document.querySelector(".ws-shell");
      const state = captureHudDomState(root);
      root.innerHTML = root.innerHTML;
      restoreHudDomState(root, state);
    });
    await expect(button).toBeFocused();
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.selectedFilter)).toBe(value);
  }
});

test("companion list and actions fit narrow panels in both themes and large text", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [270, 320, 450]) {
    for (const theme of ["dark", "light"]) {
      for (const scenario of [
        "player-companions",
        "player-companions-vision",
        "player-companions-all",
        "companion-actions",
        "companion-exploration",
        "player-companions-combat"
      ]) {
        await page.setContent(
          `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-extralarge" style="width:${width}px"><header class="window-header"><b>${scenario.startsWith("companion-") ? "Действия спутника" : "Спутники"}</b></header><div class="window-content"><div class="ws-shell">${bodies[scenario]}</div></div></section>`
        );
        await page.addScriptTag({
          content:
            synchronizeStatusLayout.toString() +
            ";synchronizeStatusLayout(document);"
        });
        expect(
          await page
            .locator(".ws-view")
            .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        const focusButton = page.locator('[data-action="actorcenter"]');
        await expect(focusButton).toHaveCount(1);
        await expect(focusButton).toHaveAttribute(
          "aria-label",
          "Выбрать персонажа и центрировать камеру"
        );
        await expect(focusButton).toBeVisible();
        expect(
          await page.locator("button").evaluateAll(nodes =>
            nodes.every(node => {
              const box = node.getBoundingClientRect();
              const root = node
                .closest(".ws-rolls-dialog")
                .getBoundingClientRect();
              return (
                !box.width ||
                (box.right <= root.right + 1 && box.left >= root.left - 1)
              );
            })
          )
        ).toBe(true);
        if (scenario.startsWith("player-companions")) {
          expect(
            await page
              .locator(".ws-companions-panel")
              .evaluate(node =>
                node.previousElementSibling?.classList.contains(
                  "ws-ability-table"
                )
              )
          ).toBe(true);
          const fonts = await page
            .locator(
              '[data-action="togglefavorites"], [data-action="togglecompanions"]'
            )
            .evaluateAll(nodes =>
              nodes.map(node => {
                const style = getComputedStyle(node);
                return [
                  style.fontFamily,
                  style.fontSize,
                  style.fontWeight,
                  style.letterSpacing
                ];
              })
            );
          expect(fonts[1]).toEqual(fonts[0]);
          const count = scenario.endsWith("-all") ? 3 : 2;
          await expect(page.locator(".ws-companion-row")).toHaveCount(count);
          await expect(
            page.locator('[data-action="companionsheet"]')
          ).toHaveCount(count);
          await expect(
            page.locator('[data-action="companionplace"]')
          ).toHaveCount(scenario.endsWith("-all") ? 1 : 0);
          if (scenario.endsWith("-all")) {
            await expect(
              page.locator('.ws-companion-row [data-action="companionplace"]')
            ).toHaveCount(1);
            await expect(
              page
                .locator(".ws-companion-row")
                .last()
                .locator('[data-action="companionsheet"]')
            ).toBeEnabled();
            const add = await page
              .locator('[data-action="companionplace"]')
              .boundingBox();
            const name = await page
              .locator(".ws-companion-open")
              .last()
              .boundingBox();
            const row = await page
              .locator(".ws-companion-row")
              .last()
              .boundingBox();
            expect(add.y).toBeGreaterThanOrEqual(name.y + name.height);
            expect(add.x).toBeGreaterThanOrEqual(row.x);
            expect(add.x + add.width).toBeLessThanOrEqual(row.x + row.width);
            expect(add.y + add.height).toBeLessThanOrEqual(row.y + row.height);
          }
          await expect(
            page.locator(
              '[data-action="editcompanions"], [data-action="linkcompanion"], [data-action="unlinkcompanion"]'
            )
          ).toHaveCount(0);
          await expect(
            page.locator(".ws-companion-effects").first()
          ).toBeVisible();
          await expect(page.locator(".ws-companion-initiative")).toHaveCount(
            count
          );
          await expect(
            page.locator(".ws-companion-initiative").last()
          ).toBeDisabled();
          if (scenario.endsWith("-all"))
            await expect(
              page
                .locator(".ws-companion-initiative")
                .last()
                .locator(".fa-dice-d20")
            ).toBeVisible();
          await expect(
            page.locator('[data-action="togglecompanions"]')
          ).toHaveAttribute("aria-expanded", "true");
          await expect(
            page.locator('.ws-companion-hp[role="meter"]').first()
          ).toHaveAttribute("aria-valuenow", "1");
        } else {
          await expect(
            page.locator('[data-action="companionback"]')
          ).toBeVisible();
          await expect(page.locator(".ws-companion-switch")).toHaveCount(2);
          await expect(
            page.locator(".ws-companion-switch").last()
          ).toBeEnabled();
          await expect(
            page.locator(".ws-actor-identity.ws-companion-turn")
          ).toHaveCount(1);
          await expect(
            page.locator(
              '[data-action="inspiration"], [data-action="death"], [data-action="togglefavorite"]'
            )
          ).toHaveCount(0);
        }
        await expect(page.locator(".ws-mode-navigation")).toBeVisible();
        await expect(page.locator(".ws-mode-navigation button")).toHaveCount(2);
        const combat =
          scenario.endsWith("-combat") || scenario === "companion-actions";
        if (combat) {
          await expect(page.locator(".ws-actor-proficiency")).toHaveText(
            /БМ [+-]?\d+/
          );
          await expect(
            page.locator('[data-action="combatmode"]')
          ).toBeDisabled();
          await expect(page.locator('[data-action="normal"]')).toBeEnabled();
        } else {
          await expect(page.locator('[data-action="normal"]')).toBeDisabled();
          await expect(
            page.locator('[data-action="combatmode"]')
          ).toBeEnabled();
        }
        if (
          width === 320 &&
          theme === "dark" &&
          process.env.COMPANION_PREVIEW_DIR
        ) {
          await page.locator(".ws-rolls-dialog").screenshot({
            path: `${process.env.COMPANION_PREVIEW_DIR}/${scenario}.png`
          });
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test("companion navigation and row controls support native keyboard activation", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog" style="width:320px"><div class="ws-shell">${bodies["player-companions-all"]}</div></section>`
  );
  await page.evaluate(() => {
    window.actions = [];
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (button)
        window.actions.push([
          button.dataset.action,
          button.dataset.companionUuid || null
        ]);
    });
  });
  await page.locator('[data-action="togglecompanions"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-companion-filter="scene"]')).toBeFocused();
  await page.locator('[data-action="opencompanion"]').first().focus();
  await expect(
    page.locator('[data-action="opencompanion"]').first()
  ).toBeFocused();
  await page.keyboard.press("Space");
  await page.locator('[data-action="companionsheet"]').first().focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-action="companionping"]').first().focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-action="companionplace"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-action="actorcenter"]').focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.actions)).toEqual([
    ["togglecompanions", null],
    ["opencompanion", "Actor.owl"],
    ["companionsheet", "Actor.owl"],
    ["companionping", "Actor.owl"],
    ["companionplace", "Actor.mephit"],
    ["actorcenter", null]
  ]);
});

test("compact companion cards fit beside their tools and sibling switches support keyboard activation", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  await page.setContent(
    `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-font-medium" style="width:450px"><div class="ws-shell">${bodies["player-companions"]}</div></section>`
  );
  const card = await page.locator(".ws-companion-open").first().boundingBox();
  expect(card.height).toBeLessThanOrEqual(60);
  await expect(page.locator('[data-action="companioncenter"]')).toHaveCount(0);
  await expect(page.locator('[data-action="companionping"]')).toHaveCount(2);
  for (const scenario of ["companion-actions", "companion-exploration"]) {
    await page.setContent(
      `<style>${baseline}${css}</style><section class="ws-rolls-dialog" style="width:270px"><div class="ws-shell">${bodies[scenario]}</div></section>`
    );
    await page.evaluate(() => {
      window.actions = [];
      document.addEventListener("click", event => {
        const button = event.target.closest(".ws-companion-switch");
        if (button)
          window.actions.push([
            button.dataset.action,
            button.dataset.companionUuid
          ]);
      });
    });
    await expect(page.locator(".ws-companion-switch").first()).toBeHidden();
    await page.locator("#ws-companion-switch-toggle").click();
    await page.locator(".ws-companion-switch").first().focus();
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.actions)).toEqual([
      ["opencompanion", "Scene.scene.Token.wolf"]
    ]);
  }
});

test("golden turn frames remain visible with effects disabled or reduced motion", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of ["dark", "light"]) {
    await page.setContent(
      `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:320px"><div class="ws-shell">${bodies["companion-actions"]}</div></section>`
    );
    const frame = page.locator(".ws-actor-identity.ws-companion-turn");
    const style = () =>
      frame.evaluate(node => {
        const frameStyle = getComputedStyle(node, "::after");
        return {
          animation: frameStyle.animationName,
          border: frameStyle.borderTopWidth,
          color: frameStyle.borderTopColor
        };
      });
    expect((await style()).animation).toBe("ws-companion-turn-glow");
    expect((await style()).border).toBe("2px");
    await page
      .locator(".ws-rolls-dialog")
      .evaluate(node => node.classList.add("ws-effects-disabled"));
    expect((await style()).animation).toBe("none");
    expect((await style()).border).toBe("2px");
    await page
      .locator(".ws-rolls-dialog")
      .evaluate(node => node.classList.remove("ws-effects-disabled"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await style()).animation).toBe("none");
    expect((await style()).border).toBe("2px");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});

test("companion controls retain touch targets on coarse pointers", async ({
  browser
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 400, height: 800 }
  });
  const page = await context.newPage();
  try {
    const { bodies, css, baseline } = await layoutFixture();
    await page.setContent(
      `<style>${baseline}${css}</style><section class="ws-rolls-dialog" style="width:270px"><div class="ws-shell">${bodies["player-companions-all"]}</div></section>`
    );
    for (const button of await page
      .locator(
        ".ws-companion-controls button, .ws-companions-toggle, .ws-companion-add, .ws-companion-toolbar button, .ws-companion-edit-controls button"
      )
      .all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});

test("shared familiar sight has a green pressed eye and accessible return control in both themes", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture();
  for (const theme of ["dark", "light"]) {
    await page.setContent(
      `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:270px"><div class="ws-shell">${bodies["player-companions-vision"]}</div></section>`
    );
    const eye = page.locator(
      '[data-action="companionvision"][aria-pressed="true"]'
    );
    await expect(eye).toHaveAttribute("aria-pressed", "true");
    const style = await eye.evaluate(node => {
      const css = getComputedStyle(node);
      return {
        color: css.color,
        background: css.backgroundColor,
        shadow: css.boxShadow
      };
    });
    expect(style.color).toBe("rgb(216, 255, 222)");
    expect(style.background).toBe("rgb(36, 91, 50)");
    expect(style.shadow).not.toBe("none");
    await expect(
      page.locator('.ws-familiar-vision[role="status"]')
    ).toContainText("Сова");
    await expect(
      page.locator('[data-action="companionvisionstop"]')
    ).toHaveAttribute("aria-label", /Вернуть чувства персонажа/);
    await eye.focus();
    await expect(eye).toBeFocused();
    expect(
      await page
        .locator(".ws-view")
        .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
    ).toBe(true);
  }
});

test("compact companion effects leave actions on one row and reveal overflow inside the frame", async ({
  page
}) => {
  const { bodies, css, baseline } = await layoutFixture("en");
  for (const width of [270, 450, 600]) {
    await page.setContent(
      `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-dark" style="width:${width}px"><div class="ws-shell">${bodies["player-companions-all"]}</div></section>`
    );
    const row = page.locator(".ws-companion-row").first();
    const effects = row.locator(
      ".ws-companion-controls > .ws-companion-effects"
    );
    await expect(effects.locator(":scope > span")).toHaveCount(3);
    const overflow = effects.locator("summary");
    await expect(overflow).toHaveText("+2−");
    expect(await overflow.innerText()).toBe("+2");
    await expect(effects.locator(".ws-companion-effects-extra")).toBeHidden();
    const icon = await effects.locator(":scope > span").first().boundingBox();
    const ping = await row
      .locator('[data-action="companionping"]')
      .boundingBox();
    expect(icon.width).toBe(20);
    expect(icon.width).toBeLessThan(ping.width);
    expect(icon.height).toBe(20);
    if (width >= 450)
      expect(
        Math.abs(icon.y + icon.height / 2 - ping.y - ping.height / 2)
      ).toBeLessThan(1);
    await overflow.focus();
    await page.keyboard.press("Enter");
    await expect(effects.locator(".ws-companion-effects-extra")).toBeVisible();
    expect(await overflow.innerText()).toBe("−");
    const frame = await row.boundingBox();
    for (const box of await effects
      .locator("span[role=img]")
      .evaluateAll(nodes =>
        nodes.map(node => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, bottom: r.bottom };
        })
      )) {
      expect(box.left).toBeGreaterThanOrEqual(frame.x);
      expect(box.right).toBeLessThanOrEqual(frame.x + frame.width);
      expect(box.bottom).toBeLessThanOrEqual(frame.y + frame.height);
    }
    await page.keyboard.press("Enter");
    await expect(effects.locator(".ws-companion-effects-extra")).toBeHidden();
    expect(await overflow.innerText()).toBe("+2");
  }
});

test("companion effect overflow reserves one row of controls at narrow widths, large text and touch sizes", async ({
  browser
}) => {
  const { bodies, css, baseline } = await layoutFixture("ru");
  for (const coarse of [false, true]) {
    const context = await browser.newContext({
      hasTouch: coarse,
      viewport: { width: 850, height: 1000 }
    });
    const page = await context.newPage();
    let reducedVisibleEffects = false;
    try {
      for (const [width, font] of [270, 320, 420, 600].flatMap(width =>
        ["medium", "extralarge"].map(font => [width, font])
      )) {
        await page.setContent(
          `<style>${baseline}${css}</style><section class="ws-rolls-dialog ws-theme-light ws-font-${font}" style="width:${width}px"><div class="ws-shell">${bodies["player-companions-combat"]}</div></section>`
        );
        await loadHudModules(page, {
          "hud/window/status-layout.js": ["synchronizeStatusLayout"],
          "hud/window/dom-state.js": [
            "captureHudDomState",
            "restoreHudDomState"
          ]
        });
        const originalEffects = await page
          .locator(".ws-companion-row")
          .evaluateAll(rows =>
            rows.map(row =>
              [
                ...row.querySelectorAll(
                  '.ws-companion-effects span[role="img"]'
                )
              ].map(icon => icon.title)
            )
          );
        await page.evaluate(() =>
          window.synchronizeStatusLayout(
            document.querySelector(".ws-rolls-dialog")
          )
        );
        for (const [rowIndex, row] of (
          await page.locator(".ws-companion-row").all()
        ).entries()) {
          const controls = row.locator(".ws-companion-controls");
          const boxes = await controls
            .locator(":scope > button")
            .evaluateAll(nodes =>
              nodes.map(node => {
                const { x, y, width, height } = node.getBoundingClientRect();
                return { x, y, width, height };
              })
            );
          const frame = await row.boundingBox();
          for (const box of boxes) {
            expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1);
            expect(box.x).toBeGreaterThanOrEqual(frame.x);
            expect(box.x + box.width).toBeLessThanOrEqual(
              frame.x + frame.width
            );
            expect(box.y + box.height).toBeLessThanOrEqual(
              frame.y + frame.height
            );
            if (coarse) {
              expect(box.width).toBeGreaterThanOrEqual(44);
              expect(box.height).toBeGreaterThanOrEqual(44);
            }
          }
          const effects = controls.locator(".ws-companion-effects");
          if (await effects.count()) {
            const visible = await effects
              .locator(":scope > span[role=img]")
              .count();
            const hidden = await effects
              .locator(".ws-companion-effects-extra > span[role=img]")
              .count();
            expect(visible).toBeLessThanOrEqual(3);
            if (visible < Math.min(3, originalEffects[rowIndex].length))
              reducedVisibleEffects = true;
            expect((await effects.boundingBox()).height).toBeLessThanOrEqual(
              boxes[0].height
            );
            expect(visible + hidden).toBe(originalEffects[rowIndex].length);
            expect(
              await effects
                .locator('span[role="img"]')
                .evaluateAll(nodes => nodes.map(node => node.title))
            ).toEqual(originalEffects[rowIndex]);
            await expect(
              effects.locator(".ws-companion-effects-count")
            ).toHaveText(`+${hidden}`);
          }
        }
        const row = page.locator(".ws-companion-row").first();
        const summary = row.locator(".ws-companion-effects-more summary");
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(row.locator("details")).toHaveAttribute("open", "");
        await page.evaluate(() => {
          const root = document.querySelector(".ws-rolls-dialog");
          root.style.width = "270px";
          window.synchronizeStatusLayout(root);
        });
        await expect(summary).toBeFocused();
        await expect(row.locator("details")).toHaveAttribute("open", "");
        const frame = await row.boundingBox();
        for (const icon of await row
          .locator(".ws-companion-effects-extra > span")
          .all()) {
          const box = await icon.boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(frame.x);
          expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
          expect(box.y + box.height).toBeLessThanOrEqual(
            frame.y + frame.height
          );
        }
        await page.evaluate(() => {
          const root = document.querySelector(".ws-rolls-dialog");
          const state = window.captureHudDomState(root);
          const shell = root.querySelector(".ws-shell");
          shell.innerHTML = shell.innerHTML;
          window.restoreHudDomState(root, state);
        });
        await expect(row.locator("details")).toHaveAttribute("open", "");
        await expect(row.locator("summary")).toBeFocused();
      }
      expect(reducedVisibleEffects).toBe(true);
    } finally {
      await context.close();
    }
  }
});
