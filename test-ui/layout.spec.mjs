import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";

const fixtures = {};
test.beforeAll(async () => {
  for (const language of ["ru", "en"])
    fixtures[language] = await layoutFixture(language);
});

async function showPanel(
  page,
  scenario,
  { width, height, font = "extralarge", language = "ru", theme = "dark" }
) {
  const { css, baseline, bodies } = fixtures[language];
  await page.setContent(
    `<style>${baseline}\n${css}</style><section class="ws-rolls-dialog ws-theme-${theme} ws-font-${font}" style="width:${width}px"><div class="window-content" style="height:${height}px;padding:0"><form><div class="dialog-content standard-form"><div class="ws-shell">${bodies[scenario]}</div></div></form></div></section>`
  );
}

async function expectReadableControls(page, description) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const controls = document.querySelectorAll(
      '.ws-ability-roll, .ws-rest-controls .ws-header-control, .ws-gm-saves button, .ws-nav[data-view="main"], .ws-gm-speed'
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
    for (const width of [270, 320, 360, 450, 600, 739, 740, 800, 1100]) {
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
  ).toHaveCount(0);
  expect(nav.y + nav.height).toBeLessThan(favorites.y);
  await showPanel(page, "player-main", {
    width: 1100,
    height: 640,
    font: "medium"
  });
  const basics = await page.locator(".ws-player-basics").boundingBox();
  const wideFavorites = await page
    .locator(".ws-player-favorites")
    .boundingBox();
  expect(wideFavorites.x).toBeGreaterThanOrEqual(basics.x + basics.width);
  const favoriteGrid = page.locator(
    ".ws-player-favorites .ws-combat-item-grid"
  );
  expect(
    await favoriteGrid.evaluate(node => {
      const grid = node.getBoundingClientRect();
      return [...node.children].some(
        child => Math.abs(child.getBoundingClientRect().right - grid.right) <= 1
      );
    })
  ).toBe(true);
});

test("narrow GM actions use one scroller and the selected creature is visible before the roster", async ({
  page
}) => {
  await showPanel(page, "gm-actions", { width: 450, height: 640 });
  await expect(page.locator(".ws-gm-encounter-tools")).toHaveCount(0);
  await expect(page.locator(".ws-gm-list > summary")).toHaveCount(0);
  await expect(page.locator("details.ws-gm-list")).toHaveCount(0);
  await expect(
    page.locator('.ws-gm-tools [data-action="gmrollinitiative"]')
  ).toHaveCount(1);
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
      4
    );
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
      .locator(".ws-gm-initiative-controls")
      .boundingBox();
    const start = await page
      .locator('[data-action="gmstartcombat"]')
      .boundingBox();
    expect(initiative.y + initiative.height).toBeLessThan(start.y);
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
    await expect(page.locator(".ws-actor-identity span")).toHaveCSS(
      "text-align",
      "center"
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
    ).toHaveCount(0);
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
