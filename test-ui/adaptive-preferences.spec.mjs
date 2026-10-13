import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { measureTextContrast } from "./contrast.mjs";

test("Russian categories do not break inside words and the three stat controls share a row", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const width of [647, 900])
    for (const font of ["medium", "extralarge"]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-${font} ws-theme-dark" style="width:${width}px"><div class="window-content" style="height:700px"><div class="ws-shell">${fixture.bodies["player-combat-footer"]}</div></div></section>`
      );
      await loadHudModules(page, {
        "hud/window/responsive-layout.js": ["synchronizePlayerLayout"]
      });
      await page.evaluate(() =>
        window.synchronizePlayerLayout(
          document.querySelector(".ws-rolls-dialog"),
          450,
          0,
          0.45,
          "manual"
        )
      );
      const row = await page
        .locator(
          ".ws-player-stats > .ws-combat-stat, .ws-player-stats > .ws-player-initiative-slot"
        )
        .evaluateAll(nodes =>
          nodes.map(node => node.getBoundingClientRect().top)
        );
      expect(row).toHaveLength(3);
      expect(Math.max(...row) - Math.min(...row)).toBeLessThan(1);
      const labels = await page
        .locator(".ws-player-actions .ws-combat-filter span")
        .evaluateAll(nodes =>
          nodes
            .filter(node => /^[А-ЯЁ]+$/.test(node.textContent.trim()))
            .map(node => {
              const range = document.createRange();
              range.selectNodeContents(node);
              return {
                text: node.textContent,
                lines: range.getClientRects().length
              };
            })
        );
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) expect(label.lines, label.text).toBe(1);
    }
});

test("automatic columns respect font metrics and exact boundaries; manual thresholds remain exact", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const font of ["small", "medium", "large", "extralarge", "custom"])
    for (const family of ["arial", "verdana", "georgia"]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-${font} ws-theme-light" style="width:900px"><div class="window-content" style="height:700px"><div class="ws-shell">${fixture.bodies["player-combat-footer"]}</div></div></section>`
      );
      await loadHudModules(page, {
        "hud/window/responsive-layout.js": ["synchronizePlayerLayout"],
        "hud/theme.js": ["synchronizeHudTypography"]
      });
      const boundary = await page.evaluate(family => {
        const root = document.querySelector(".ws-rolls-dialog");
        window.synchronizeHudTypography(root, {
          family,
          style: "normal",
          size: root.classList.contains("ws-font-custom")
            ? "custom"
            : undefined,
          pixels: 18
        });
        window.synchronizePlayerLayout(root, 450, 0, 0.48, "auto");
        return Number(
          root.querySelector(".ws-player-layout").dataset.columnSwitchWidth
        );
      }, family);
      expect(boundary).toBeGreaterThan(450);
      for (const offset of [-1, 0, 1]) {
        const result = await page.evaluate(
          ({ boundary, offset }) => {
            const root = document.querySelector(".ws-rolls-dialog");
            root.style.width = `${boundary + offset}px`;
            window.synchronizePlayerLayout(root, 450, 0, 0.48, "auto");
            const view = root.querySelector(".ws-player-layout");
            const info = view
                .querySelector(".ws-player-info")
                .getBoundingClientRect(),
              actions = view
                .querySelector(".ws-player-actions")
                .getBoundingClientRect();
            return {
              columns: view.classList.contains("ws-player-columns"),
              overflow: root.scrollWidth > root.clientWidth + 1,
              overlap:
                info.right > actions.left + 1 &&
                info.top < actions.bottom &&
                info.bottom > actions.top,
              text: getComputedStyle(view).getPropertyValue("--ws-type-scale")
            };
          },
          { boundary, offset }
        );
        expect(result.columns).toBe(offset >= 0);
        expect(result.overflow).toBe(false);
        if (offset >= 0) expect(result.overlap).toBe(false);
        const text = result.text;
        await page.evaluate(() => {
          const root = document.querySelector(".ws-rolls-dialog");
          root.style.width = "1100px";
          window.synchronizePlayerLayout(root, 450, 0, 0.48, "auto");
        });
        expect(
          await page
            .locator(".ws-player-layout")
            .evaluate(n =>
              getComputedStyle(n).getPropertyValue("--ws-type-scale")
            )
        ).toBe(text);
      }
      for (const width of [719, 720, 721]) {
        await page.evaluate(width => {
          const root = document.querySelector(".ws-rolls-dialog");
          root.style.width = width + "px";
          window.synchronizePlayerLayout(root, 720, 0, 0.48, "manual");
        }, width);
        expect(
          await page
            .locator(".ws-player-layout")
            .evaluate(n => n.classList.contains("ws-player-columns"))
        ).toBe(width >= 720);
      }
    }
});

test("long NPC identity wraps inside its button without intersecting GM controls", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  for (const width of [740, 899, 900, 1120])
    for (const font of ["medium", "extralarge"]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-${font} ws-theme-dark" style="width:${width}px"><div class="window-content" style="height:600px"><div class="ws-shell">${fixture.bodies["gm-features"]}</div></div></section>`
      );
      const name = page.locator(".ws-gm-name").first();
      await name.evaluate(
        n =>
          (n.textContent =
            "Александриэль Северная Хранительница — Very long name of the ancient dragon and keeper of the forgotten mountain")
      );
      const result = await name.evaluate(n => {
        const box = n.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(n);
        return {
          clipped: [...range.getClientRects()].some(
            r =>
              r.top < box.top - 1 ||
              r.bottom > box.bottom + 1 ||
              r.left < box.left - 1 ||
              r.right > box.right + 1
          ),
          overflow: n.scrollWidth > n.clientWidth + 1
        };
      });
      expect(result.clipped).toBe(false);
      expect(result.overflow).toBe(false);
    }
});

for (const theme of ["light", "dark"])
  for (const preset of [
    "standard",
    "teal",
    "blue",
    "violet",
    "rose",
    "amber"
  ]) {
    test(`${theme} ${preset} accent provides readable active, hover and focused text`, async ({
      page
    }) => {
      const fixture = await layoutFixture("en");
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-${theme}"><div class="ws-shell"><button class="ws-button ws-inspiration ws-active">Inspiration</button></div></section>`
      );
      await loadHudModules(page, { "hud/theme.js": ["synchronizeHudAccents"] });
      const active = page.locator(".ws-inspiration");
      await page.evaluate(
        preset =>
          window.synchronizeHudAccents(
            document.querySelector(".ws-rolls-dialog"),
            { preset, color: "#000000" }
          ),
        preset
      );
      for (const state of ["active", "hover", "focus"]) {
        if (state === "hover") await active.hover();
        if (state === "focus") {
          await page.mouse.move(0, 0);
          await active.focus();
        }
        const measured = await measureTextContrast(active);
        expect(
          measured.ratio,
          JSON.stringify({ theme, preset, state, ...measured })
        ).toBeGreaterThanOrEqual(4.5);
        await active.evaluate(node => node.blur());
        await page.mouse.move(0, 0);
      }
    });
  }

test("contrast measurement follows changed and transparent ancestor backgrounds", async ({
  page
}) => {
  await page.setContent(
    '<div style="background:white"><span style="color:black;background:rgba(0,0,0,0.1)">Text</span></div>'
  );
  const text = page.locator("span");
  const light = await measureTextContrast(text);
  expect(light.background[0]).toBeGreaterThan(200);
  await page.locator("div").evaluate(node => (node.style.background = "black"));
  const dark = await measureTextContrast(text);
  expect(dark.background).toEqual([0, 0, 0]);
  expect(dark.ratio).toBe(1);
  expect(light.ratio).toBeGreaterThan(dark.ratio);
});

test("contrast measurement includes the selected navigation pseudo-element surface", async ({
  page
}) => {
  await page.setContent(
    '<style>span::after{content:"";position:absolute;inset:0;background:black;z-index:-1}span{position:relative;isolation:isolate;color:white}</style><div style="background:white"><span>Text</span></div>'
  );
  const measured = await measureTextContrast(page.locator("span"), {
    backgroundPseudo: "::after"
  });
  expect(measured.background).toEqual([0, 0, 0]);
  expect(measured.ratio).toBe(21);
});

test("auto layout divider can narrow the player lane to two ability columns and keeps it after resize", async ({
  page
}) => {
  const fixture = await layoutFixture("ru");
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-medium ws-theme-dark" style="width:1100px"><div class="window-content" style="height:700px"><div class="ws-shell">${fixture.bodies["player-combat-footer"]}</div></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/responsive-layout.js": ["watchPlayerLayout"]
  });
  await page.evaluate(() => {
    window.ratio = 0.48;
    const root = document.querySelector(".ws-rolls-dialog");
    window.watcher = window.watchPlayerLayout({ element: root }, () => 450, {
      readMode: () => "auto",
      readRatio: () => window.ratio,
      saveRatio: value => {
        window.ratio = value;
        window.watcher.sync();
      }
    });
  });
  const divider = page.locator(".ws-column-divider");
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x - 800, box.y + 60);
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator(".ws-player-info")
        .evaluate(n => n.getBoundingClientRect().width)
    )
    .toBeLessThan(245);
  expect(
    await page
      .locator(".ws-ability-cards")
      .evaluate(n => getComputedStyle(n).gridTemplateColumns.split(" ").length)
  ).toBe(2);
  await page.evaluate(() => window.watcher.sync());
  expect(
    await page
      .locator(".ws-player-info")
      .evaluate(n => n.getBoundingClientRect().width)
  ).toBeLessThan(245);
  await page.evaluate(() => window.watcher.dispose());
});

test("weight and coins retain one frame and keyboard focus", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark"><div class="ws-shell">${fixture.bodies["player-inventory"]}</div></section>`
  );
  const blocks = page.locator(".ws-inventory-summary");
  await expect(blocks).toHaveCount(1);
  for (const block of await blocks.all()) {
    expect(await block.evaluate(n => getComputedStyle(n).borderTopWidth)).toBe(
      "1px"
    );
    const button = block.locator("button.ws-inventory-summary-content");
    expect(await button.evaluate(n => getComputedStyle(n).borderTopWidth)).toBe(
      "0px"
    );
    await button.focus();
    await expect(button).toBeFocused();
  }
});

test("Graphite uses Configure surfaces, shares accents and fully switches back to native themes", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  for (const scenario of ["player-combat-footer", "gm-actions"])
    for (const width of [320, 900]) {
      await page.setContent(
        `<style>${fixture.baseline}\n${fixture.css}</style><main class="theme-light"><section class="ws-rolls-dialog ws-font-large" style="width:${width}px"><header class="window-header">HUD</header><div class="window-content"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section></main>`
      );
      await loadHudModules(page, {
        "hud/theme.js": ["synchronizeHudTheme", "synchronizeHudAccents"]
      });
      const result = await page.evaluate(() => {
        const root = document.querySelector(".ws-rolls-dialog");
        window.synchronizeHudTheme(root, "graphite");
        window.synchronizeHudAccents(root, {
          preset: "teal",
          color: "#000000"
        });
        const shell = root.querySelector(".ws-shell");
        return {
          dark: root.classList.contains("ws-theme-dark"),
          auto: root.hasAttribute("data-ws-auto-theme"),
          line: getComputedStyle(shell).getPropertyValue("--line").trim(),
          text: getComputedStyle(root).color,
          accent: getComputedStyle(shell).getPropertyValue("--accent").trim(),
          overflow: root.scrollWidth > root.clientWidth + 1
        };
      });
      expect(result).toEqual({
        dark: true,
        auto: false,
        line: "#48464e",
        text: "rgb(240, 239, 237)",
        accent: "#5eead4",
        overflow: false
      });
      await page.evaluate(() =>
        window.synchronizeHudTheme(
          document.querySelector(".ws-rolls-dialog"),
          "light"
        )
      );
      await expect(page.locator(".ws-rolls-dialog")).not.toHaveClass(
        /ws-theme-graphite/
      );
      expect(
        await page
          .locator(".ws-shell")
          .evaluate(n => getComputedStyle(n).getPropertyValue("--line").trim())
      ).toBe("#857b6e");
    }
});

test("fine text size applies exact label pixels and selecting a preset restores its size", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-large"><div class="window-content"><div class="ws-shell">${fixture.bodies["player-combat-footer"]}</div></div></section>`
  );
  await loadHudModules(page, { "hud/theme.js": ["synchronizeHudTypography"] });
  for (const [size, pixels, scale] of [
    ["custom", 12.25, 1.225],
    ["custom", 17.5, 1.75],
    ["medium", 17.5, 1.15],
    ["large", 17.5, 1.3]
  ]) {
    await page.evaluate(
      ({ size, pixels }) =>
        window.synchronizeHudTypography(
          document.querySelector(".ws-rolls-dialog"),
          {
            family: "arial",
            style: "normal",
            size,
            pixels
          }
        ),
      { size, pixels }
    );
    expect(
      await page
        .locator(".ws-player-layout")
        .evaluate(n =>
          Number(getComputedStyle(n).getPropertyValue("--ws-type-scale"))
        )
    ).toBe(scale);
  }
});
