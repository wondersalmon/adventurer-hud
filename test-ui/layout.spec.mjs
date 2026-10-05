import { bindPlayerDivider } from "../scripts/hud/window/column-divider.js";
import { synchronizeStatusLayout } from "../scripts/hud/window/status-layout.js";
import {
  expandedHudSection,
  revealHudSection
} from "../scripts/hud/window/section-reveal.js";
import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import {
  applyPlayerLayout,
  synchronizePlayerLayout
} from "../scripts/hud/window/responsive-layout.js";
import {
  captureHudDomState,
  restoreHudDomState
} from "../scripts/hud/window/dom-state.js";

const fixtures = {};

test("spell level headings toggle independently and retain state after refresh", async ({
  page
}) => {
  await showPanel(page, "player-combat-spells", {
    width: 640,
    height: 560,
    font: "large"
  });
  await page.addScriptTag({
    content: `${captureHudDomState.toString()};${restoreHudDomState.toString()};`
  });
  const groups = page.locator("details.ws-spell-level");
  expect(await groups.count()).toBeGreaterThan(1);
  const first = groups.first();
  await first.locator("summary").click();
  await expect(first).not.toHaveAttribute("open", "");
  await expect(groups.nth(1)).toHaveAttribute("open", "");
  expect(
    await first
      .locator("summary")
      .evaluate(node => getComputedStyle(node, "::before").content)
  ).toContain("›");
  await page.evaluate(() => {
    const root = document.querySelector(".ws-shell");
    const state = captureHudDomState(root);
    root.innerHTML = root.innerHTML;
    root.querySelectorAll("details.ws-spell-level").forEach(node => {
      node.open = true;
    });
    restoreHudDomState(root, state);
  });
  await expect(first).not.toHaveAttribute("open", "");
  await first.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("open", "");
  expect(
    await first
      .locator("summary")
      .evaluate(node => getComputedStyle(node, "::before").content)
  ).toContain("⌄");
});

test("default player size keeps class and PB on one line and limits action columns through 700px", async ({
  page
}) => {
  for (const language of ["en", "ru"]) {
    await showPanel(page, "player-combat-footer", {
      width: 640,
      height: 560,
      font: "large",
      language
    });
    await page.evaluate(() => {
      document.querySelector(".ws-actor-class").textContent =
        "Monk 6 / Warlock 2";
    });
    const rows = await page.evaluate(() => {
      const classes = document
        .querySelector(".ws-actor-class")
        .getBoundingClientRect();
      const pb = document
        .querySelector(".ws-actor-proficiency")
        .getBoundingClientRect();
      return Math.abs(classes.top - pb.top);
    });
    expect(rows).toBeLessThan(3);
    for (const width of [612, 634, 640, 700]) {
      await page.locator(".ws-rolls-dialog").evaluate((element, size) => {
        element.style.width = `${size}px`;
      }, width);
      await page.evaluate(() => synchronizePlayerLayout(document, 600));
      const columns = await page
        .locator(".ws-player-actions .ws-combat-filters")
        .evaluate(
          element =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length
        );
      expect(columns).toBe(2);
    }
  }
});

test("exploration rests sit beside inspiration; both modes place one shortcut block last in the left column", async ({
  page
}) => {
  for (const language of ["en", "ru"]) {
    for (const scenario of ["player-main-footer", "player-combat-footer"]) {
      await showPanel(page, scenario, {
        width: 650,
        height: 430,
        font: "large",
        language
      });
      const hints = page.locator(".ws-shortcuts");
      await expect(hints).toHaveCount(1);
      expect(
        await hints.evaluate(
          node =>
            node.parentElement.classList.contains("ws-player-info") &&
            node === node.parentElement.lastElementChild
        )
      ).toBe(true);
      if (scenario === "player-main-footer") {
        await expect(page.locator('[data-action="initiative"]')).toHaveCount(0);
        const rests = page.locator(".ws-exploration-rests");
        expect(
          await rests.evaluate(node =>
            node.parentElement.classList.contains("ws-actor-inspiration-slot")
          )
        ).toBe(true);
        await expect(rests.locator("button span")).toHaveCount(2);
        await expect(rests.locator("button span").first()).toBeHidden();
        await expect(rests.locator("button span").last()).toBeHidden();
        const short = await rests
          .locator('[data-action="shortrest"]')
          .boundingBox();
        const long = await rests
          .locator('[data-action="longrest"]')
          .boundingBox();
        const inspiration = await page
          .locator(".ws-actor-inspiration-slot > .ws-inspiration")
          .boundingBox();
        expect(short.x).toBeGreaterThan(inspiration.x);
        expect(long.x).toBeGreaterThan(short.x);
        expect(short.y + short.height / 2).toBeCloseTo(
          long.y + long.height / 2,
          0
        );
        expect(short.y + short.height / 2).toBeCloseTo(
          inspiration.y + inspiration.height / 2,
          0
        );
        const stats = page.locator(".ws-player-stats > .ws-combat-stat");
        await expect(stats).toHaveCount(2);
        expect((await stats.first().boundingBox()).height).toBeLessThan(60);
        expect((await stats.last().boundingBox()).height).toBeCloseTo(
          (await stats.first().boundingBox()).height,
          0
        );
        await expectReadableControls(page, `compact exploration ${language}`);
      }
    }
  }
});

test("HUD text uses the same Cyrillic and Latin font despite native control and heading families", async ({
  page
}) => {
  const sizes = [];
  for (const language of ["ru", "en"]) {
    await showPanel(page, "player-combat-footer", {
      width: 634,
      height: 538,
      font: "medium",
      language
    });
    await page.addStyleTag({
      content:
        ".window-content {font-family: Georgia, serif} button {font-family: 'Times New Roman', serif} h3 {font-family: monospace} .fa-solid {font-family: monospace}"
    });
    const typography = await page.locator(".ws-shell").evaluate(shell => {
      const selectors = [
        ".ws-section-toggle",
        ".ws-combat-filter",
        ".ws-ability-roll",
        ".ws-combat-stat",
        ".ws-actor-identity",
        ".ws-footer-controls button"
      ];
      return selectors.map(selector => {
        const node = shell.querySelector(selector);
        const style = getComputedStyle(node);
        return {
          font: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight
        };
      });
    });
    for (const style of typography)
      expect(style.font.toLowerCase()).toBe("arial, helvetica, sans-serif");
    sizes.push(typography);
    expect(
      await page
        .locator("i.fa-solid")
        .first()
        .evaluate(node => getComputedStyle(node).fontFamily)
    ).toBe("monospace");
    await expectReadableControls(page, `${language}, uniform font`);
  }
  expect(sizes[0]).toEqual(sizes[1]);
});

test("compact player columns keep two ability cards, a centered divider and an edge-to-edge footer", async ({
  page
}) => {
  for (const scenario of ["player-combat-footer", "player-main-footer"])
    for (const theme of ["light", "dark"])
      for (const language of ["ru", "en"]) {
        await showPanel(page, scenario, {
          width: 638,
          height: 577,
          font: "medium",
          theme,
          language
        });
        await page.addStyleTag({
          content: ".window-content { padding: 16px; }"
        });
        await page
          .locator(".window-content")
          .evaluate(node => node.style.removeProperty("padding"));
        const footer = await page.locator(".ws-player-footer").boundingBox();
        const content = await page.locator(".window-content").boundingBox();
        expect(footer.x).toBeCloseTo(content.x, 0);
        expect(footer.width).toBeCloseTo(content.width, 0);
        const left = await page.locator(".ws-player-info").boundingBox();
        const right = await page.locator(".ws-player-actions").boundingBox();
        const divider = await page.locator(".ws-column-divider").boundingBox();
        expect(divider.x + divider.width / 2).toBeCloseTo(
          (left.x + left.width + right.x) / 2,
          0
        );
        await page
          .locator(".ws-player-layout")
          .evaluate(node =>
            node.style.setProperty("--ws-player-left-width", "240px")
          );
        expect(
          await page
            .locator(".ws-ability-cards")
            .evaluate(
              node =>
                getComputedStyle(node).gridTemplateColumns.split(" ").length
            )
        ).toBe(2);
        await expectReadableControls(
          page,
          `${scenario}, compact ${theme}, ${language}`
        );
        await page.evaluate(() =>
          synchronizePlayerLayout(document, window.hudLayoutThreshold)
        );
        await page
          .locator(".ws-rolls-dialog")
          .evaluate(node => node.classList.add("ws-pinned"));
        expect(
          await page
            .locator(".ws-column-divider")
            .evaluate(node => getComputedStyle(node).backgroundImage)
        ).toContain(theme === "light" ? "121, 85, 28" : "193, 154, 88");
        await page.screenshot({
          path: `dev/player-${scenario}-${theme}-${language}.png`
        });
      }
});

test("fixed player toolbar keeps effects and native controls visible while content scrolls", async ({
  page
}) => {
  for (const scenario of ["player-combat-footer", "player-main-footer"]) {
    for (const width of [270, 450, 900]) {
      await showPanel(page, scenario, {
        width,
        height: 380,
        font: "extralarge"
      });
      await expect(
        page.locator(".ws-footer-effects .ws-combat-statuses")
      ).toHaveCount(1);
      await expect(
        page.locator('.ws-footer-controls [data-action="actorcenter"]')
      ).toBeVisible();
      await expect(
        page.locator('.ws-footer-controls [data-action="actorping"]')
      ).toBeVisible();
      await expect(
        page.locator('.ws-footer-controls [data-action="endturn"]')
      ).toHaveCount(scenario.includes("combat") ? 1 : 0);
      const visibleEffects = await page
        .locator(".ws-footer-effects .ws-active-conditions > .ws-status")
        .count();
      expect(visibleEffects).toBeLessThanOrEqual(5);
      if (width === 900) expect(visibleEffects).toBe(5);
      await expect(
        page.locator(".ws-footer-effects .ws-status-more")
      ).toBeVisible();
      const before = await page.locator(".ws-player-footer").boundingBox();
      const panel = await page.locator(".window-content").boundingBox();
      expect(before.y + before.height).toBeLessThanOrEqual(
        panel.y + panel.height + 1
      );
      await page
        .locator(".ws-player-layout, .ws-player-info, .ws-player-actions")
        .evaluateAll(nodes =>
          nodes.forEach(node => (node.scrollTop = node.scrollHeight))
        );
      const after = await page.locator(".ws-player-footer").boundingBox();
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.width).toBeCloseTo(before.width, 0);
    }
  }
});

test("inspiration shares the identity row and proficiency wraps only when it cannot fit", async ({
  page
}) => {
  await showPanel(page, "player-combat", {
    width: 900,
    height: 650,
    font: "medium"
  });
  await page
    .locator(".ws-actor-identity > strong")
    .evaluate(node => (node.textContent = "Rook"));
  await page
    .locator(".ws-actor-class")
    .evaluate(node => (node.textContent = "Monk 6 / Warlock 2"));
  const summary = await page.locator(".ws-actor-summary").boundingBox();
  const prof = await page.locator(".ws-actor-proficiency").boundingBox();
  const klass = await page.locator(".ws-actor-class").boundingBox();
  expect(prof.y).toBeCloseTo(klass.y, 0);
  expect(prof.x).toBeGreaterThan(klass.x + klass.width);
  const identity = await page.locator(".ws-actor-identity").boundingBox();
  const inspiration = await page.locator(".ws-inspiration").boundingBox();
  expect(inspiration.y + inspiration.height / 2).toBeGreaterThanOrEqual(
    identity.y
  );
  expect(inspiration.y + inspiration.height / 2).toBeLessThanOrEqual(
    identity.y + identity.height
  );
  expect(prof.x + prof.width).toBeLessThanOrEqual(
    summary.x + summary.width + 1
  );
});

test("player divider drags and resizes by keyboard, preserves ratio and refuses changes while pinned", async ({
  page
}) => {
  await showPanel(page, "player-main", { width: 900, height: 650 });
  await page.addScriptTag({
    content: `${bindPlayerDivider.toString()};window.columnRatio=0.35;window.disposeDivider=bindPlayerDivider(document.querySelector('.ws-rolls-dialog'),{readRatio:()=>window.columnRatio,saveRatio:value=>window.columnRatio=value,isPinned:()=>document.querySelector('.ws-rolls-dialog').classList.contains('ws-pinned'),sync:()=>synchronizePlayerLayout(document,600,0,window.columnRatio)});`
  });
  const handle = page.locator(".ws-column-divider");
  const before = await page.locator(".ws-player-info").boundingBox();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 30);
  await page.mouse.up();
  const changed = await page.locator(".ws-player-info").boundingBox();
  expect(changed.width).toBeGreaterThan(before.width + 40);
  const ratio = await page.evaluate(() => window.columnRatio);
  expect(ratio).toBeGreaterThan(0.35);
  await page.evaluate(() =>
    synchronizePlayerLayout(document, 600, 0, window.columnRatio)
  );
  expect(
    (await page.locator(".ws-player-info").boundingBox()).width
  ).toBeCloseTo(changed.width, 0);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.columnRatio)).toBeGreaterThan(ratio);
  await page.evaluate(() =>
    synchronizePlayerLayout(document, 600, 0, window.columnRatio)
  );
  const extreme = await handle.boundingBox();
  await page.mouse.move(extreme.x + extreme.width / 2, extreme.y + 30);
  await page.mouse.down();
  await page.mouse.move(1250, extreme.y + 30);
  await page.mouse.up();
  const bounded = await page.locator(".ws-player-info").boundingBox();
  expect(await page.evaluate(() => window.columnRatio)).toBeLessThanOrEqual(
    0.7
  );
  await page.evaluate(() =>
    synchronizePlayerLayout(document, 600, 0, window.columnRatio)
  );
  expect(
    (await page.locator(".ws-player-info").boundingBox()).width
  ).toBeCloseTo(bounded.width, 0);
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.classList.add("ws-pinned");
    synchronizePlayerLayout(document, 600, 0, window.columnRatio);
  });
  const pinnedRatio = await page.evaluate(() => window.columnRatio);
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.columnRatio)).toBe(pinnedRatio);
  await expect(handle).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => window.disposeDivider());
});

test("player layouts share unified saves, checks, proficiency and initiative", async ({
  page
}) => {
  for (const scenario of ["player-main", "player-combat"]) {
    await showPanel(page, scenario, {
      width: 900,
      height: 700,
      font: "medium"
    });
    await expect(
      page.locator(".ws-player-info .ws-player-favorites")
    ).toHaveCount(0);
    await expect(page.locator(".ws-player-actions > :first-child")).toHaveClass(
      "ws-player-favorites"
    );
    await expect(page.locator(".ws-ability-table")).toBeVisible();
    await expect(page.locator('[data-action="toggleabilities"]')).toHaveCount(
      0
    );
    await expect(
      page.locator('.ws-ability-table [data-type="save"]')
    ).toHaveCount(6);
    await expect(
      page.locator('.ws-ability-table [data-type="check"]')
    ).toHaveCount(6);
    await expect(page.locator(".ws-actor-proficiency")).toBeVisible();
    if (scenario === "player-combat")
      await expect(
        page.locator(".ws-player-initiative-slot .ws-header-initiative")
      ).toBeVisible();
    else
      await expect(page.locator('[data-action="initiative"]')).toHaveCount(0);
    if (scenario === "player-combat") {
      await expect(
        page.locator('.ws-actor-quick-controls [data-action="endturn"]')
      ).toBeVisible();
      await expect(page.locator(".ws-player-action-toggle")).not.toBeVisible();
      await expect(
        page.locator('[data-action="combatfilter"][data-category="action"]')
      ).toBeVisible();
      await page.locator('[data-action="endturn"]').focus();
    }
    await page.locator(".ws-rolls-dialog").evaluate(node => {
      node.style.width = "450px";
      synchronizePlayerLayout(document, window.hudLayoutThreshold);
    });
    await expect(page.locator(".ws-ability-table")).toBeVisible();
    await expect(page.locator(".ws-ability-cards")).toBeVisible();
    if (scenario === "player-combat")
      await expect(
        page.locator('.ws-player-initiative-slot [data-action="initiative"]')
      ).toBeVisible();
    else
      await expect(page.locator('[data-action="initiative"]')).toHaveCount(0);
    if (scenario === "player-combat") {
      await expect(
        page.locator('.ws-actor-quick-controls [data-action="endturn"]')
      ).toBeFocused();
      await expect(page.locator(".ws-player-action-toggle")).toHaveCount(0);
      await expect(
        page.locator('[data-action="combatfilter"][data-category="action"]')
      ).toBeVisible();
    }
  }
});

test("abilities stay open at every width and inventory retains weight and coins", async ({
  page
}) => {
  for (const scenario of ["player-main", "player-combat"]) {
    for (const width of [450, 599, 600, 850]) {
      await showPanel(page, scenario, { width, height: 650 });
      await expect(page.locator(".ws-ability-cards")).toBeVisible();
      await expect(
        page.locator(".ws-ability-table [data-type=save]")
      ).toHaveCount(6);
      await expect(
        page.locator(".ws-ability-table [data-type=check]")
      ).toHaveCount(6);
      await expect(page.locator('[data-action="toggleabilities"]')).toHaveCount(
        0
      );
      await expect(
        page.locator(".ws-actor-identity .ws-actor-proficiency")
      ).toHaveCount(1);
    }
  }
  for (const scenario of ["player-inventory", "player-combat-inventory"]) {
    for (const width of [450, 850]) {
      await showPanel(page, scenario, { width, height: 650 });
      await expect(page.locator(".ws-inventory-weight")).toHaveCount(1);
      await expect(page.locator(".ws-inventory-weight strong")).toContainText(
        "87.5"
      );
      await expect(page.locator(".ws-coin-gp")).toContainText("1,234");
      await expectReadableControls(page, `${scenario}, ${width}`);
    }
  }
});

test("player stats share heights, initiative glows steadily and category icons share a fixed slot", async ({
  page
}) => {
  for (const font of ["medium", "extralarge"]) {
    for (const width of [450, 600, 850]) {
      await showPanel(page, "player-combat", { width, height: 650, font });
      const sizes = await page.locator(".ws-player-stats").evaluate(node => {
        const stat = selector =>
          node.querySelector(selector).getBoundingClientRect().height;
        const init = node.querySelector(".ws-header-initiative");
        return {
          heights: [
            stat(".ws-combat-stat"),
            stat(".ws-header-initiative"),
            stat(".ws-player-speed")
          ],
          glow: getComputedStyle(init).boxShadow,
          animation: getComputedStyle(init).animationName
        };
      });
      expect(
        Math.max(...sizes.heights) - Math.min(...sizes.heights)
      ).toBeLessThanOrEqual(1);
      expect(sizes.glow).not.toBe("none");
      expect(sizes.animation).toBe("none");
      await expect(
        page.locator(".ws-actor-identity .ws-actor-proficiency")
      ).toHaveCount(1);
      const offsets = await page
        .locator(".ws-combat-actions > .ws-combat-filters > button")
        .evaluateAll(nodes =>
          nodes
            .filter(node => node.getBoundingClientRect().width)
            .map(
              node =>
                node.querySelector(":scope > i").getBoundingClientRect().left -
                node.getBoundingClientRect().left
            )
        );
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(
        1
      );
    }
  }
});

test("wide companions follow highlighted favorites and return below abilities when narrowed", async ({
  page
}) => {
  for (const scenario of ["player-companions", "player-companions-combat"]) {
    await showPanel(page, scenario, { width: 900, height: 650 });
    await expect(
      page.locator(".ws-player-info > .ws-companions-panel")
    ).toHaveCount(0);
    await expect(
      page.locator(
        ".ws-player-actions > .ws-player-favorites + .ws-companions-panel"
      )
    ).toBeVisible();
    const appearance = await page
      .locator(".ws-companions-panel")
      .evaluate(node => {
        const styles = getComputedStyle(node);
        return {
          border: styles.borderTopWidth,
          color: styles.borderTopColor,
          background: styles.backgroundColor
        };
      });
    expect(appearance.border).toBe("1px");
    expect(appearance.color).toBe("rgb(49, 93, 67)");
    const favoriteColor = await page
      .locator(".ws-player-favorites")
      .evaluate(node => getComputedStyle(node).borderTopColor);
    expect(appearance.color).not.toBe(favoriteColor);
    expect(appearance.background).not.toBe("rgba(0, 0, 0, 0)");
    await page.locator('[data-action="companionsheet"]').first().focus();
    await page.locator(".ws-rolls-dialog").evaluate(node => {
      node.style.width = "450px";
      synchronizePlayerLayout(document, window.hudLayoutThreshold);
    });
    await expect(
      page.locator(".ws-player-info > .ws-ability-table + .ws-companions-panel")
    ).toBeVisible();
    await expect(
      page.locator('[data-action="companionsheet"]').first()
    ).toBeFocused();
  }
});

test("player turn control stays labeled at the top and the turn glow stays dim and static", async ({
  page
}) => {
  for (const width of [270, 480, 615, 1084]) {
    await showPanel(page, "player-combat", {
      width,
      height: 350,
      font: "medium"
    });
    const button = page.locator('.ws-header-end-turn[data-action="endturn"]');
    await expect(button).toBeVisible();
    await expect(button.locator("span")).not.toHaveText("");
    const geometry = await button.evaluate(node => {
      const label = node.querySelector("span");
      const box = node.getBoundingClientRect();
      const hp = document
        .querySelector(".ws-health-stack")
        .getBoundingClientRect();
      return {
        clipped: label.scrollWidth > label.clientWidth + 1,
        bottom: box.bottom,
        hpTop: hp.top
      };
    });
    expect(geometry.clipped).toBe(false);
    expect(geometry.bottom).toBeLessThan(geometry.hpTop);
    const appearance = await page.locator(".ws-rolls-dialog").evaluate(node => {
      node.classList.add("ws-player-mode", "ws-actor-turn", "ws-turn-arrival");
      const styles = getComputedStyle(node);
      return { animation: styles.animationName, shadow: styles.boxShadow };
    });
    expect(appearance.animation).toBe("none");
    expect(appearance.shadow).toContain("0.42");
    await page
      .locator(".ws-rolls-dialog")
      .evaluate(node =>
        node.classList.remove("ws-actor-turn", "ws-turn-arrival")
      );
  }
});

test("expanded sections reveal their content within one scroller and honor disabling", async ({
  page
}) => {
  for (const width of [450, 900]) {
    await showPanel(page, "player-companions-combat", { width, height: 420 });
    await page.addScriptTag({
      content: `${expandedHudSection.toString()}\n${revealHudSection.toString()}`
    });
    const result = await page.evaluate(() => {
      const root = document.querySelector(".ws-rolls-dialog");
      const layout = root.querySelector(".ws-player-layout");
      const scroller = layout.classList.contains("ws-player-columns")
        ? root.querySelector(".ws-player-actions")
        : layout;
      const other = layout.classList.contains("ws-player-columns")
        ? root.querySelector(".ws-player-info")
        : root.querySelector(".ws-player-actions");
      other.scrollTop = 35;
      const otherTop = other.scrollTop;
      const section = expandedHudSection(root, "togglecompanions");
      section.style.minHeight = "600px";
      scroller.scrollTop = 0;
      revealHudSection(section, root, false);
      const disabled = scroller.scrollTop;
      revealHudSection(section, root, true);
      return {
        disabled,
        top: scroller.scrollTop,
        sectionTop: section.getBoundingClientRect().top,
        viewportTop: scroller.getBoundingClientRect().top,
        otherTop,
        afterOther: other.scrollTop
      };
    });
    expect(result.disabled).toBe(0);
    expect(result.top).toBeGreaterThan(0);
    // Browser scroll positions round fractional CSS pixels.
    expect(
      Math.abs(result.sectionTop - (result.viewportTop + 6))
    ).toBeLessThanOrEqual(1);
    expect(result.afterOther).toBe(result.otherTop);
  }
});

test("tools follow skills with separate headings, borders and spacing in both modes", async ({
  page
}) => {
  for (const scenario of ["player-skills", "player-combat-skills"]) {
    await showPanel(page, scenario, {
      width: 900,
      height: 900,
      font: "medium"
    });
    const tools = page.locator(".ws-tools-content");
    await expect(tools).toBeVisible();
    const spacing = await tools.evaluate(node => {
      const skills = node.previousElementSibling.getBoundingClientRect();
      const section = node.querySelector(".ws-tool-section");
      const heading = section
        .querySelector(".ws-section-title")
        .getBoundingClientRect();
      const firstTool = section
        .querySelector('[data-action="tool"]')
        .getBoundingClientRect();
      return {
        gap: heading.top - skills.bottom,
        border: getComputedStyle(section).borderTopWidth,
        below: firstTool.top - heading.bottom
      };
    });
    expect(spacing.gap).toBeGreaterThanOrEqual(20);
    expect(spacing.border).toBe("1px");
    expect(spacing.below).toBeGreaterThanOrEqual(8);
    await expect(
      page.locator('[data-exploration-section][data-view="tools"]')
    ).toHaveCount(0);
  }
});
test.beforeAll(async () => {
  for (const language of ["ru", "en"])
    fixtures[language] = await layoutFixture(language);
});

async function showPanel(
  page,
  scenario,
  {
    width,
    height,
    font = "extralarge",
    language = "ru",
    theme = "dark",
    threshold = 600
  }
) {
  const { css, baseline, bodies } = fixtures[language];
  await page.setContent(
    `<style>${baseline}\n${css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-${font}" style="width:${width}px"><div class="window-content" style="height:${height}px;padding:0"><form><div class="dialog-content standard-form"><div class="ws-shell">${bodies[scenario]}</div></div></form></div></section><script>${synchronizeStatusLayout.toString()};${applyPlayerLayout.toString()};${synchronizePlayerLayout.toString()};window.hudLayoutObserver?.disconnect();window.hudLayoutThreshold=${threshold};window.hudLayoutObserver=new ResizeObserver(() => synchronizePlayerLayout(document,window.hudLayoutThreshold));window.hudLayoutObserver.observe(document.querySelector('.ws-rolls-dialog'));synchronizePlayerLayout(document,window.hudLayoutThreshold);</script>`
  );
}

async function expectReadableControls(page, description) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const controls = document.querySelectorAll(
      '.ws-ability-roll, .ws-rest-controls .ws-header-control, .ws-gm-saves button, .ws-nav[data-view="main"], .ws-gm-speed, .ws-combat-stat, .ws-section-toggle'
    );
    for (const node of controls) {
      if (!node.getBoundingClientRect().width) continue;
      if (node.scrollWidth > node.clientWidth + 2)
        issues.push(`${node.dataset.action}: horizontal overflow`);
      for (const child of node.querySelectorAll("span, strong")) {
        if (child.scrollWidth > child.clientWidth + 2)
          issues.push(`${node.dataset.action}: clipped ${child.textContent}`);
      }
      if (node.matches(".ws-ability-roll")) {
        const label = node.querySelector("span").getBoundingClientRect();
        const value = node.querySelector("strong").getBoundingClientRect();
        if (label.right > value.left + 1)
          issues.push("overlapping ability label and modifier");
      }
      if (node.matches(".ws-gm-speed")) {
        const value = node.querySelector("strong");
        if (
          value.clientHeight <
          parseFloat(getComputedStyle(value).lineHeight) - 1
        )
          issues.push("clipped speed value");
      }
    }
    const view = document.querySelector(".ws-view");
    if (view.scrollWidth > view.clientWidth + 2)
      issues.push("panel horizontal overflow");
    return issues;
  });
  expect(problems, description).toEqual([]);
}

test("custom column thresholds keep both player modes readable at the minimum and maximum settings", async ({
  page
}) => {
  for (const scenario of [
    "player-main",
    "player-combat-spells",
    "player-combat-inventory",
    "player-inventory"
  ])
    for (const configured of [300, 480, 600, 1200, 1400]) {
      const threshold = Math.min(1200, Math.max(450, configured));
      await page.setViewportSize({ width: 1600, height: 900 });
      await showPanel(page, scenario, {
        width: threshold - 1,
        height: 380,
        threshold: configured
      });
      await page.locator(".window-content").evaluate(node => {
        node.style.paddingInline = "22px";
      });
      await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
        node.style.width = `${width}px`;
      }, threshold);
      await expect(page.locator(".ws-player-layout")).toHaveClass(
        /ws-player-columns/
      );
      await expectReadableControls(page, `${scenario}, threshold ${threshold}`);
      await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
        node.style.width = `${width}px`;
        synchronizePlayerLayout(document, window.hudLayoutThreshold);
      }, threshold - 10);
      await expect(page.locator(".ws-player-layout")).not.toHaveClass(
        /ws-player-columns/
      );
    }
});

test("item names and wrapped metadata stay inside their cards at every panel width", async ({
  page
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const scenario of ["player-combat-spells", "gm-spells"])
    for (const language of ["en", "ru"])
      for (const font of ["medium", "extralarge"])
        for (const width of [270, 390, 500, 599, 615, 900, 1100, 1400]) {
          await showPanel(page, scenario, {
            width,
            height: 380,
            language,
            font,
            theme: language === "en" ? "light" : "dark"
          });
          const problems = await page
            .locator(".ws-combat-item")
            .evaluateAll(nodes => {
              const issues = [];
              for (const button of nodes) {
                const bounds = button.getBoundingClientRect();
                const name = button.querySelector("strong").textContent;
                for (const child of button.querySelectorAll(
                  "strong, small, .ws-spell-meta > *"
                )) {
                  const box = child.getBoundingClientRect();
                  if (
                    box.left < bounds.left - 1 ||
                    box.right > bounds.right + 1 ||
                    box.top < bounds.top - 1 ||
                    box.bottom > bounds.bottom + 1
                  )
                    issues.push(`${name}: text outside card`);
                  if (
                    child.scrollWidth > child.clientWidth + 2 ||
                    child.scrollHeight > child.clientHeight + 2
                  )
                    issues.push(`${name}: clipped text`);
                }
              }
              for (const button of document.querySelectorAll(
                ".ws-combat-filter"
              )) {
                if (
                  button.scrollWidth > button.clientWidth + 2 ||
                  button.scrollHeight > button.clientHeight + 2
                )
                  issues.push("clipped category");
              }
              return issues;
            });
          expect(
            problems,
            `${scenario}, ${language}, ${font}, ${width}`
          ).toEqual([]);
          await expectReadableControls(page, `${scenario}, ${width}`);
        }
});

test("player combat switches between one scroller and two columns while resizing and preserves state on refresh", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await showPanel(page, "player-combat-spells", { width: 450, height: 220 });
  const info = page.locator(".ws-player-info");
  const actions = page.locator(".ws-player-actions");
  for (const width of [450, 599, 615, 1100, 1400, 450, 800]) {
    await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
      node.style.width = `${width}px`;
      synchronizePlayerLayout(document, window.hudLayoutThreshold);
    }, width);
    const left = await info.boundingBox();
    const right = await actions.boundingBox();
    if (width < 600) {
      expect(left.y + left.height).toBeLessThanOrEqual(right.y);
      await expect(page.locator(".ws-player-layout")).toHaveCSS(
        "overflow-y",
        "auto"
      );
      await expect(actions).toHaveCSS("overflow-y", "visible");
    } else {
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      expect(left.y).toBeCloseTo(
        (await page.locator(".ws-player-actions").boundingBox()).y,
        0
      );
      expect(right.y).toBeLessThan(left.y + left.height - 40);
      expect(left.height).toBeGreaterThan(100);
      expect(right.height).toBeCloseTo(left.height, 0);
      await expect(info).toHaveCSS("overflow-y", "auto");
      await expect(actions).toHaveCSS("overflow-y", "auto");
      expect(await actions.evaluate(node => node.scrollHeight)).toBeGreaterThan(
        right.height
      );
    }
    await expectReadableControls(page, `resized to ${width}`);
  }
  const search = page.locator('[data-action="searchitems"]');
  await search.focus();
  await search.evaluate(node => {
    node.value = "barrier";
    node.setSelectionRange(2, 5);
  });
  await page.addScriptTag({
    content: `${captureHudDomState.toString()}\n${restoreHudDomState.toString()}`
  });
  const scroll = await page.evaluate(() => {
    const root = document.querySelector(".ws-shell");
    const columns = [
      root.querySelector(".ws-player-info"),
      root.querySelector(".ws-player-actions")
    ];
    columns.forEach(node => {
      node.scrollTop = 120;
    });
    const before = columns.map(node => node.scrollTop);
    const state = captureHudDomState(root);
    const search = root.querySelector('[data-action="searchitems"]');
    search.setAttribute("value", search.value);
    root.innerHTML = root.innerHTML;
    root
      .querySelector(".ws-player-layout")
      .classList.remove("ws-player-columns");
    restoreHudDomState(root, state);
    return {
      before,
      after: [
        root.querySelector(".ws-player-info").scrollTop,
        root.querySelector(".ws-player-actions").scrollTop
      ]
    };
  });
  expect(scroll.before.every(top => top > 0)).toBe(true);
  expect(scroll.after).toEqual(scroll.before);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("barrier");
  expect(
    await search.evaluate(node => [node.selectionStart, node.selectionEnd])
  ).toEqual([2, 5]);
});

test("exploration uses the same responsive columns even without favorites", async ({
  page
}) => {
  for (const scenario of ["player-main", "player-main-no-favorites"]) {
    await showPanel(page, scenario, { width: 450, height: 220 });
    for (const width of [270, 500, 599, 615, 1100, 450]) {
      await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
        node.style.width = `${width}px`;
        synchronizePlayerLayout(document, window.hudLayoutThreshold);
      }, width);
      const info = await page.locator(".ws-player-info").boundingBox();
      const actions = await page.locator(".ws-player-actions").boundingBox();
      const nav = await page.locator(".ws-nav-grid").boundingBox();
      if (width < 600) {
        expect(info.y + info.height).toBeLessThanOrEqual(actions.y);
        await expect(page.locator(".ws-player-layout")).toHaveCSS(
          "overflow-y",
          "auto"
        );
      } else {
        expect(info.x + info.width).toBeLessThanOrEqual(nav.x);
        expect(info.y).toBeCloseTo(actions.y, 0);
        expect(actions.height).toBeCloseTo(info.height, 0);
        for (const selector of [".ws-player-info", ".ws-player-actions"])
          await expect(page.locator(selector)).toHaveCSS("overflow-y", "auto");
      }
      await expectReadableControls(page, `${scenario}, resized to ${width}`);
    }
    if (scenario.endsWith("no-favorites"))
      await expect(page.locator(".ws-favorites")).toHaveCount(0);
  }
});

test("exploration details open beside character information on wide panels and fill narrow panels", async ({
  page
}) => {
  for (const scenario of [
    "player-skills",
    "player-tools",
    "player-spells",
    "player-inventory"
  ]) {
    await showPanel(page, scenario, { width: 450, height: 380 });
    const info = page.locator(".ws-player-info");
    const section = page.locator(".ws-player-subview");
    await expect(info).not.toBeVisible();
    await expect(section).toBeVisible();
    for (const width of [615, 800, 1100]) {
      await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
        node.style.width = `${width}px`;
        synchronizePlayerLayout(document, window.hudLayoutThreshold);
      }, width);
      await expect(info).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      const left = await info.boundingBox();
      const right = await section.boundingBox();
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      expect(left.y).toBeCloseTo(
        (await page.locator(".ws-player-actions").boundingBox()).y,
        0
      );
      expect(right.y).toBeLessThan(left.y + left.height - 40);
      await expectReadableControls(page, `${scenario}, ${width}`);
    }
    await page.locator(".ws-rolls-dialog").evaluate(node => {
      node.style.width = "450px";
    });
    await expect(info).not.toBeVisible();
    await expect(section).toBeVisible();
  }
});

test("wide GM footer stays centered and every direct command remains reachable when wrapping", async ({
  page
}) => {
  for (const width of [763, 1000, 1338]) {
    for (const language of ["ru", "en"]) {
      await showPanel(page, "gm-features", { width, height: 407, language });
      const problems = await page.locator(".ws-gm-tools").evaluate(footer => {
        const bounds = footer.getBoundingClientRect();
        const groups = [
          ...footer.querySelectorAll("button:not(.ws-gm-more-toggle)")
        ].map(node => node.getBoundingClientRect());
        const left = Math.min(...groups.map(box => box.left));
        const right = Math.max(...groups.map(box => box.right));
        const issues = [];
        if (Math.abs((left + right) / 2 - (bounds.left + bounds.right) / 2) > 2)
          issues.push("uncentered commands");
        for (const button of footer.querySelectorAll(
          "button:not(.ws-gm-more-toggle)"
        )) {
          const box = button.getBoundingClientRect();
          if (
            box.left < bounds.left ||
            box.right > bounds.right ||
            box.top < bounds.top ||
            box.bottom > bounds.bottom
          )
            issues.push(`${button.dataset.action}: clipped`);
          if (
            document
              .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
              ?.closest("button") !== button
          )
            issues.push(`${button.dataset.action}: obscured`);
        }
        return issues;
      });
      expect(problems, `${language}, width ${width}`).toEqual([]);
    }
  }
});

test("short wide GM panels preserve usable content and every footer command can be scrolled into view", async ({
  page
}) => {
  for (const scenario of ["gm-features", "gm-spells"]) {
    for (const width of [763, 800, 1338]) {
      for (const font of ["medium", "extralarge"]) {
        await showPanel(page, scenario, { width, height: 140, font });
        const content = await page.locator(".ws-gm-body").boundingBox();
        expect(
          content.height,
          `${scenario}, ${width}, ${font}`
        ).toBeGreaterThanOrEqual(60);
        const buttons = page.locator(
          ".ws-gm-tools button:not(.ws-gm-more-toggle)"
        );
        for (let index = 0; index < (await buttons.count()); index++) {
          const reachable = await buttons.nth(index).evaluate(button => {
            button.scrollIntoView({ block: "nearest", inline: "nearest" });
            const bounds = button
              .closest(".ws-gm-tools")
              .getBoundingClientRect();
            const box = button.getBoundingClientRect();
            return (
              box.top >= bounds.top &&
              box.bottom <= bounds.bottom &&
              document
                .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
                ?.closest("button") === button
            );
          });
          expect(
            reachable,
            `${scenario}, ${width}, ${font}, command ${index}`
          ).toBe(true);
        }
      }
    }
  }
});

for (const scenario of [
  "player-main",
  "player-combat",
  "player-combat-spells",
  "player-combat-inventory",
  "player-skills",
  "player-tools",
  "player-spells",
  "player-inventory",
  "gm-features",
  "gm-actions",
  "gm-spells",
  "gm-empty"
]) {
  test(`${scenario}: controls fit the supported sizes and text scales`, async ({
    page
  }) => {
    for (const width of [
      270, 320, 360, 450, 600, 679, 680, 695, 739, 740, 800, 1100
    ]) {
      for (const height of [140, 220, 380, 640]) {
        for (const font of ["medium", "extralarge"]) {
          await showPanel(page, scenario, { width, height, font });
          await expectReadableControls(
            page,
            `${scenario} ${width} × ${height}, ${font}`
          );
          if (scenario.startsWith("gm-") && scenario !== "gm-empty") {
            const content = await page
              .locator(width < 755 ? ".ws-gm-content" : ".ws-gm-body")
              .boundingBox();
            expect(
              content.height,
              `${scenario} ${width} × ${height}, ${font}: usable content height`
            ).toBeGreaterThanOrEqual(height < 220 ? 60 : 100);
            const separated = await page
              .locator(".ws-gm-body")
              .evaluate(node => {
                const [info, actions] = [...node.children].map(child =>
                  child.getBoundingClientRect()
                );
                return (
                  info.right <= actions.left ||
                  actions.right <= info.left ||
                  info.bottom <= actions.top ||
                  actions.bottom <= info.top
                );
              });
            expect(
              separated,
              `${scenario} ${width} × ${height}, ${font}: sections must not overlap`
            ).toBe(true);
          }
        }
      }
    }
  });
}

test("both themes and languages fit narrow, intermediate and wide panels", async ({
  page
}) => {
  for (const language of ["ru", "en"])
    for (const theme of ["dark", "light"]) {
      for (const scenario of [
        "player-main",
        "player-tools",
        "gm-features",
        "gm-empty"
      ]) {
        for (const width of [270, 800, 1100]) {
          await showPanel(page, scenario, {
            width,
            height: 180,
            language,
            theme
          });
          await expectReadableControls(
            page,
            `${scenario}, ${language}, ${theme}, ${width}`
          );
        }
      }
    }
});

test("secondary GM commands stay available by keyboard without consuming the short viewport", async ({
  page
}) => {
  await showPanel(page, "gm-features", { width: 270, height: 180 });
  const more = page.locator(".ws-gm-more");
  await expect(page.locator('[data-action="togglegmtools"]')).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  const content = await page.locator(".ws-gm-content").boundingBox();
  expect(content.height).toBeGreaterThanOrEqual(60);
  await page.evaluate(() => {
    window.clickedActions = [];
    document.addEventListener("click", event => {
      const control = event.target.closest('[data-action="togglegmtools"]');
      if (control) window.clickedActions.push(control.dataset.action);
    });
  });
  await page.locator('[data-action="togglegmtools"]').focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.clickedActions)).toEqual([
    "togglegmtools"
  ]);
  await more.evaluate(node => {
    node.classList.add("ws-expanded");
    node.querySelector("button").setAttribute("aria-expanded", "true");
  });
  const command = page.locator('[data-action="gmcenter"]');
  await expect(command).toBeVisible();
  expect(
    await command.evaluate(node => {
      const box = node.getBoundingClientRect();
      return (
        document
          .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          ?.closest('[data-action="gmcenter"]') === node
      );
    })
  ).toBe(true);
  const after = await page.locator(".ws-gm-content").boundingBox();
  expect(after.height).toBe(content.height);
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node => (node.style.width = "1100px"));
  await more.evaluate(node => node.classList.remove("ws-expanded"));
  await expect(page.locator('[data-action="togglegmtools"]')).not.toBeVisible();
  await expect(command).toBeVisible();
  await expect(page.locator('[data-action="gmping"]')).toBeVisible();
  await expect(page.locator('[data-action="gmremovedead"]')).toBeVisible();
});

test("player health precedes abilities and navigation and wide panels share the space", async ({
  page
}) => {
  await showPanel(page, "player-main", {
    width: 450,
    height: 640,
    font: "medium"
  });
  const nav = await page.locator(".ws-nav-grid").boundingBox();
  const abilities = await page.locator(".ws-ability-table").boundingBox();
  const favorites = await page.locator(".ws-player-favorites").boundingBox();
  const mode = await page.locator(".ws-mode-navigation").boundingBox();
  const health = await page.locator(".ws-regular-health").boundingBox();
  expect(mode.y + mode.height).toBeLessThan(health.y);
  expect(health.y + health.height).toBeLessThan(abilities.y);
  expect(abilities.y + abilities.height).toBeLessThan(nav.y);
  await expect(
    page.locator('[data-action="shortrest"], [data-action="longrest"]')
  ).toHaveCount(2);
  await expect(page.locator('[data-action="shortrest"]')).toBeVisible();
  await expect(page.locator('[data-action="longrest"]')).toBeVisible();
  const rest = await page.locator('[data-action="shortrest"]').boundingBox();
  const inspiration = await page
    .locator('[data-action="inspiration"]')
    .boundingBox();
  const longRest = await page.locator('[data-action="longrest"]').boundingBox();
  expect(rest.x).toBeGreaterThanOrEqual(inspiration.x + inspiration.width);
  expect(longRest.x).toBeGreaterThanOrEqual(rest.x + rest.width);
  for (const control of [rest, longRest]) {
    expect(control.y + control.height / 2).toBeCloseTo(
      inspiration.y + inspiration.height / 2,
      0
    );
    expect(control.y + control.height).toBeLessThan(mode.y);
  }
  expect(rest.y + rest.height).toBeLessThan(favorites.y);
  expect(health.y + health.height).toBeLessThan(favorites.y);
  expect(favorites.y + favorites.height).toBeLessThan(abilities.y);
  await showPanel(page, "player-main", {
    width: 1100,
    height: 640,
    font: "medium"
  });
  const basics = await page.locator(".ws-player-basics").boundingBox();
  const wideFavorites = await page
    .locator(".ws-player-favorites")
    .boundingBox();
  expect(wideFavorites.x).toBeGreaterThan(basics.x + basics.width);
  expect(
    await page
      .locator(".ws-player-actions")
      .evaluate(node =>
        node.firstElementChild.classList.contains("ws-player-favorites")
      )
  ).toBe(true);
  expect(
    await page
      .locator(".ws-player-favorites")
      .evaluate(node => getComputedStyle(node).borderTopWidth)
  ).toBe("1px");
  const favoriteGrid = page.locator(
    ".ws-player-favorites .ws-combat-item-grid"
  );
  expect(
    await favoriteGrid.evaluate(node => {
      const grid = node.getBoundingClientRect();
      return [...node.children].some(
        child =>
          child.getBoundingClientRect().right <= grid.right + 1 &&
          child.getBoundingClientRect().width < grid.width
      );
    })
  ).toBe(true);
});

test("narrow GM actions use one scroller and the selected creature is visible before the roster", async ({
  page
}) => {
  await showPanel(page, "gm-actions", { width: 450, height: 640 });
  await expect(page.locator('[data-dice-tray="toggle"]')).toHaveCount(0);
  await expect(
    page.locator(
      '[data-action="gmrollinitiative"][data-scope="all"][data-reroll="false"]'
    )
  ).toHaveCount(1);
  await expect(page.locator(".ws-gm-encounter-tools")).toHaveCount(0);
  await expect(page.locator(".ws-gm-list > summary")).toHaveCount(0);
  await expect(page.locator("details.ws-gm-list")).toHaveCount(0);
  await expect(
    page.locator('.ws-gm-tools [data-action="gmrollinitiative"]')
  ).toHaveCount(2);
  await expect(
    page.locator('.ws-gm-tools [data-action="gmresetinitiative"]')
  ).toHaveCount(0);
  await expect(page.locator(".ws-gm-identity > strong")).not.toHaveText("");
  await expect(
    page.locator(
      '.ws-gm-identity-actions [data-action="gmrollinitiative"][data-reroll="true"]'
    )
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.ws-gm-identity-actions [data-action="gmresetcombatantinitiative"]'
    )
  ).toHaveCount(1);
  await showPanel(page, "gm-features", { width: 450, height: 380 });
  const summary = await page.locator(".ws-gm-selection-summary").boundingBox();
  const roster = await page.locator(".ws-gm-roster").boundingBox();
  expect(summary.y + summary.height).toBeLessThan(roster.y);
  await expect(page.locator(".ws-combat-item-list")).toHaveCSS(
    "overflow-y",
    "visible"
  );
  await expect(page.locator(".ws-gm-content")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator(".ws-gm-creature").first()).toHaveAttribute(
    "title",
    /Страж забытого северного храма 0/
  );
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node => (node.style.width = "1100px"));
  await expect(page.locator(".ws-gm-selection-summary")).not.toBeVisible();
});

test("selected defeated creature has its own skull removal button beside the sheet", async ({
  page
}) => {
  await showPanel(page, "gm-defeated", { width: 763, height: 540 });
  await expect(
    page.locator('.ws-gm-identity-actions [data-action="gmremove"] .fa-skull')
  ).toHaveCount(1);
  await expect(
    page.locator('.ws-gm-identity-actions [data-action="gmremove"]')
  ).toBeEnabled();
  await expect(
    page.locator('.ws-gm-tools [data-action="gmremove"]')
  ).toHaveCount(0);
  await showPanel(page, "gm-actions", { width: 763, height: 540 });
  await expect(
    page.locator('.ws-gm-identity-actions [data-action="gmremove"]')
  ).toHaveCount(0);
});

test("empty GM panel offers preparation without unavailable battle commands", async ({
  page
}) => {
  await showPanel(page, "gm-empty", { width: 270, height: 220 });
  await expect(page.locator('[data-action="gmcreatecombat"]')).toBeVisible();
  await expect(page.locator(".ws-gm-encounter-tools > h3")).toBeVisible();
  await expect(page.locator('[data-action="gmaddcreatures"]')).toHaveCount(2);
  await expect(
    page.locator(
      '[data-action="gmrollinitiative"], [data-action="gmendcombat"], .ws-gm-turn, .ws-gm-tools'
    )
  ).toHaveCount(0);
});

test("GM preparation shows setup directly and puts start after initiative", async ({
  page
}) => {
  for (const width of [270, 763, 1338]) {
    await showPanel(page, "gm-preparation", { width, height: 540 });
    await expect(page.locator(".ws-gm-encounter-tools > summary")).toHaveCount(
      0
    );
    await expect(page.locator('[data-action="gmaddcreatures"]')).toHaveCount(2);
    await expect(page.locator('[data-action="gmrollinitiative"]')).toHaveCount(
      5
    );
    await expect(
      page.locator(
        '.ws-gm-encounter-tools > .ws-gm-initiative-controls [data-scope="all"]'
      )
    ).toBeVisible();
    await expect(
      page.locator(
        '.ws-gm-encounter-tools > .ws-gm-initiative-controls [data-scope="npc"]'
      )
    ).toBeVisible();
    await expect(page.locator('[data-action="gmstartcombat"]')).toBeEnabled();
    await expect(page.locator(".ws-gm-tools")).toHaveCount(0);
    const headings = await page
      .locator(".ws-gm-preparation-rosters summary")
      .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontSize));
    expect(headings).toHaveLength(2);
    expect(headings[0]).toBe(headings[1]);
    await page.locator(".ws-gm-player-roster > summary").click();
    await expect(
      page.locator(".ws-gm-player-roster .ws-gm-roster")
    ).not.toBeVisible();
    await page.locator(".ws-gm-player-roster > summary").click();
    await expect(
      page.locator(".ws-gm-player-roster .ws-gm-creature")
    ).toHaveCount(1);
    await expect(
      page.locator('.ws-gm-player-roster [data-action="gmselect"]')
    ).toHaveCount(0);
    await expect(
      page.locator('[data-action="gmresetinitiative"]')
    ).toBeEnabled();
    const monsters = await page
      .locator(
        ".ws-gm-preparation-rosters > .ws-gm-list:not(.ws-gm-player-roster)"
      )
      .boundingBox();
    const players = await page.locator(".ws-gm-player-roster").boundingBox();
    if (width >= 763)
      expect(players.x).toBeGreaterThanOrEqual(monsters.x + monsters.width);
    else expect(players.y).toBeGreaterThanOrEqual(monsters.y + monsters.height);
    const initiative = await page
      .locator(".ws-gm-encounter-tools > .ws-gm-initiative-controls")
      .boundingBox();
    const start = await page
      .locator('[data-action="gmstartcombat"]')
      .boundingBox();
    expect(initiative.y + initiative.height).toBeLessThan(start.y);
    const options = page.locator(".ws-gm-initiative-options");
    await expect(
      options.locator('[data-action="gmrollinitiative"]').first()
    ).not.toBeVisible();
    await options.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      options.locator('[data-action="gmrollinitiative"]')
    ).toHaveCount(3);
    for (const button of await options.locator("button").all())
      await expect(button).toBeVisible();
    await page.addScriptTag({
      content: `${captureHudDomState.toString()}\n${restoreHudDomState.toString()}`
    });
    await page.evaluate(() => {
      const root = document.querySelector(".ws-shell");
      const state = captureHudDomState(root);
      root.innerHTML = root.innerHTML;
      restoreHudDomState(root, state);
    });
    await expect(options.locator("summary")).toBeFocused();
    await expect(options).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(
      options.locator('[data-action="gmresetinitiative"]')
    ).not.toBeVisible();
  }
});

test("player quick controls sit beside identity and abilities follow stats", async ({
  page
}) => {
  for (const scenario of ["player-main", "player-combat"]) {
    await showPanel(page, scenario, {
      width: 270,
      height: 540,
      language: "en"
    });
    await expect(page.locator(".ws-actor-class")).toHaveCSS(
      "text-align",
      "left"
    );
    const mode = await page.locator(".ws-mode-navigation").boundingBox();
    const abilities = await page.locator(".ws-ability-table").boundingBox();
    const health = await page.locator(".ws-health-stack").first().boundingBox();
    expect(mode.y + mode.height).toBeLessThan(health.y);
    expect(health.y + health.height).toBeLessThan(abilities.y);
    await expect(
      page.locator('.ws-actor-header [data-action="inspiration"]')
    ).toHaveCount(1);
    await expect(
      page.locator('[data-action="shortrest"], [data-action="longrest"]')
    ).toHaveCount(scenario === "player-main" ? 2 : 0);
    if (scenario === "player-combat") {
      const stats = await page.locator(".ws-combat-stats").boundingBox();
      expect(stats.y + stats.height).toBeLessThan(abilities.y);
    }
    await page.locator(".ws-mode-navigation").evaluate(node => node.remove());
    const identity = await page.locator(".ws-actor-header").boundingBox();
    const after = await page.locator(".ws-health-stack").first().boundingBox();
    expect(after.y - (identity.y + identity.height)).toBeLessThan(15);
  }
});

test("explicit light HUD keeps native header controls, menu labels and panel borders visible", async ({
  page
}) => {
  await showPanel(page, "player-main", {
    width: 270,
    height: 540,
    theme: "light"
  });
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    const header = document.createElement("header");
    header.className = "window-header";
    header.innerHTML =
      '<h4 class="window-title" style="color:white">Explore</h4><button class="header-control" style="color:white">⋮</button><button class="header-control" style="color:white">×</button><div class="controls-dropdown" style="color:white;background:#222"><button class="control" style="color:white">Settings</button></div>';
    node.prepend(header);
  });
  await expect(page.locator(".window-title")).toHaveCSS(
    "color",
    "rgb(41, 39, 34)"
  );
  await expect(page.locator(".header-control").first()).toHaveCSS(
    "color",
    "rgb(41, 39, 34)"
  );
  await expect(page.locator(".controls-dropdown .control")).toHaveCSS(
    "color",
    "rgb(41, 39, 34)"
  );
  await expect(page.locator(".controls-dropdown")).toHaveCSS(
    "background-color",
    "rgb(245, 241, 232)"
  );
  expect(
    await page
      .locator(".ws-ability-card")
      .first()
      .evaluate(node => {
        const rgb = value => value.match(/\d+/g).slice(0, 3).map(Number);
        const luminance = color =>
          rgb(color)
            .map(n => {
              const channel = n / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            })
            .reduce(
              (sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index],
              0
            );
        const style = getComputedStyle(node);
        const background = luminance(style.backgroundColor),
          border = luminance(style.borderTopColor);
        return (
          (Math.max(background, border) + 0.05) /
          (Math.min(background, border) + 0.05)
        );
      })
  ).toBeGreaterThanOrEqual(3);
  await page
    .locator(".ws-rolls-dialog")
    .evaluate(node => node.classList.add("ws-player-mode"));
  await expect(page.locator(".ws-rolls-dialog")).toHaveCSS(
    "min-height",
    "350px"
  );
});

test("companion cards leave room for names with two columns of actions", async ({
  page
}) => {
  for (const width of [600, 660, 740, 1100]) {
    for (const font of ["medium", "extralarge"]) {
      await showPanel(page, "player-companions-combat", {
        width,
        height: 640,
        font,
        threshold: 480
      });
      await expect(page.locator(".ws-player-layout")).toHaveClass(
        /ws-player-columns/
      );
      const rows = await page.locator(".ws-companion-row").evaluateAll(rows =>
        rows.map(row => {
          const card = row.querySelector(".ws-companion-open"),
            controls = row.querySelector(".ws-companion-controls");
          const buttons = [...controls.children].map(button =>
            button.getBoundingClientRect()
          );
          const name = card.querySelector("strong");
          return {
            cardWidth: card.getBoundingClientRect().width,
            controlsWidth: controls.getBoundingClientRect().width,
            fits:
              row.scrollWidth <= row.clientWidth + 1 &&
              name.scrollWidth <= name.clientWidth + 1,
            twoColumns:
              buttons.length < 3 ||
              (buttons[0].y === buttons[1].y && buttons[2].y > buttons[0].y)
          };
        })
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.fits).toBe(true);
        expect(row.twoColumns).toBe(true);
        expect(row.cardWidth).toBeGreaterThan(row.controlsWidth * 1.8);
      }
      const favorites = page.locator(".ws-player-actions .ws-favorites");
      await expect(favorites).toHaveCount(1);
      const favoriteBox = await favorites.boundingBox();
      const actions = await page.locator(".ws-combat-actions").boundingBox();
      expect(favoriteBox.y + favoriteBox.height).toBeLessThanOrEqual(actions.y);
    }
  }
});

test("exploration section icons remain visible and headers wrap into columns above expanded content", async ({
  page
}) => {
  for (const width of [600, 800, 1100, 1737]) {
    await page.setViewportSize({ width: 1900, height: 900 });
    await showPanel(page, "player-inventory", {
      width,
      height: 640,
      threshold: 480,
      font: "medium"
    });
    const headers = page.locator('[data-exploration-section="true"]');
    await expect(headers).toHaveCount(3);
    for (const header of await headers.all()) {
      await expect(header).toBeVisible();
      await expect(header.locator(".ws-nav-main i")).toBeVisible();
      const box = await header.boundingBox();
      expect(box.width).toBeLessThan(330);
      expect(
        await header.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
    }
    const boxes = await headers.evaluateAll(nodes =>
      nodes.map(node => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, bottom: b.bottom };
      })
    );
    const panel = await page
      .locator("#ws-exploration-content-inventory")
      .boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(
      Math.max(...boxes.map(b => b.bottom))
    );
    if (width >= 1100) expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    await expect(page.locator(".ws-column-divider")).toBeVisible();
    await expect(page.locator(".ws-column-divider")).toHaveCSS("width", "8px");
    await expect(
      page.locator('#ws-inventory > .ws-nav[data-view="main"]')
    ).toBeHidden();
  }
});

test("wide exploration defaults to skills while narrow exploration keeps its home navigation", async ({
  page
}) => {
  await showPanel(page, "player-main-no-favorites", {
    width: 900,
    height: 500,
    font: "medium",
    threshold: 480
  });
  const skills = page.locator("#ws-exploration-content-skills");
  const header = page.locator('[data-exploration-default="true"]');
  await expect(skills).toBeVisible();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#ws-skills .ws-entry").first()).toBeVisible();
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.style.width = "450px";
    synchronizePlayerLayout(document, window.hudLayoutThreshold);
  });
  await expect(skills).toBeHidden();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(header.locator(".ws-nav-main i")).toBeVisible();
  await expect(page.locator(".ws-player-info")).toBeVisible();
  await page.locator(".ws-rolls-dialog").evaluate(node => {
    node.style.width = "900px";
    synchronizePlayerLayout(document, window.hudLayoutThreshold);
  });
  await expect(skills).toBeVisible();
  await expect(header).toHaveAttribute("aria-expanded", "true");
});

test("default skills retain the column scroll when freshly rendered hidden markup is restored", async ({
  page
}) => {
  await showPanel(page, "player-main-no-favorites", {
    width: 900,
    height: 220,
    font: "medium",
    threshold: 480
  });
  await page.addScriptTag({
    content:
      captureHudDomState.toString() + "\n" + restoreHudDomState.toString()
  });
  const scroll = await page.evaluate(() => {
    const root = document.querySelector(".ws-shell"),
      actions = root.querySelector(".ws-player-actions");
    actions.scrollTop = 140;
    const before = actions.scrollTop,
      state = captureHudDomState(root);
    root.innerHTML = root.innerHTML;
    root
      .querySelector(".ws-player-layout")
      .classList.remove("ws-player-columns");
    root.querySelector("[data-exploration-default-body]").hidden = true;
    restoreHudDomState(root, state);
    return {
      before,
      after: root.querySelector(".ws-player-actions").scrollTop
    };
  });
  expect(scroll.before).toBeGreaterThan(0);
  expect(scroll.after).toBe(scroll.before);
});

test("multi-activity primary cards keep the same width and always expose native favorite stars", async ({
  page
}) => {
  for (const width of [600, 900, 1400]) {
    for (const editing of [false, true]) {
      await showPanel(page, editing ? "player-combat-edit" : "player-combat", {
        width,
        height: 640,
        threshold: 480,
        font: "medium"
      });
      const multi = page.locator(
        '.ws-player-actions [data-description-item-id="i21"]'
      );
      const single = page.locator(
        '.ws-player-actions [data-description-item-id="i20"]'
      );
      const star = multi.locator(".ws-item-side-actions > .ws-item-favorite");
      {
        await expect(star).toHaveAttribute("data-action", "togglefavorite");
        await expect(star).toHaveAttribute("data-item-id", "i21");
        expect(await star.getAttribute("data-activity-id")).toBeNull();
      }
      const multiBox = await multi.locator(".ws-combat-item").boundingBox(),
        singleBox = await single.locator(".ws-combat-item").boundingBox();
      expect(multiBox.width).toBeCloseTo(singleBox.width, 0);
    }
  }
});
