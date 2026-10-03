import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { customNpcFixture } from "../tests/helpers/custom-npcs.mjs";
import { createItemPreview } from "../scripts/hud/items/item-preview.js";

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
const translations = Object.fromEntries(
  await Promise.all(
    ["en", "ru"].map(async language => [
      language,
      JSON.parse(
        await readFile(
          new URL(`../lang/${language}.json`, import.meta.url),
          "utf8"
        )
      )
    ])
  )
);

for (const [name, type, count] of [
  ["Humongous Fungus Troll", "epic", 5],
  ["Llyvessa", "villain", 1]
]) {
  test(`${name}: custom categories and complete Features work in narrow GM panels`, async ({
    page
  }) => {
    for (const [language, theme, width] of [
      ["en", "dark", 320],
      ["ru", "light", 270]
    ]) {
      const t = key => translations[language][`ADVENTURER_HUD.${key}`] ?? key;
      const f = customNpcFixture(name, {
        t,
        hudState: { combatCategory: `activation:${type}` }
      });
      const views = { [`activation:${type}`]: f.renderer.combatActions() };
      f.hudState.combatCategory = "features";
      views.features = f.renderer.combatActions();
      f.hudState.showPassiveFeatures = true;
      views.featuresPassive = f.renderer.combatActions();
      f.hudState.showPassiveFeatures = false;
      await page.setContent(
        `<style>${css}</style><main class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px"><div class="ws-shell"><section class="ws-view">${views[`activation:${type}`]}</section></div></main>`
      );
      await page.evaluate(views => {
        window.executed = [];
        const view = document.querySelector(".ws-view");
        view.addEventListener("click", event => {
          const control = event.target.closest("[data-action]");
          if (!control) return;
          if (control.dataset.action === "combatfilter")
            view.innerHTML = views[control.dataset.category] ?? view.innerHTML;
          else if (control.dataset.action === "featurefilter")
            view.innerHTML =
              control.getAttribute("aria-pressed") === "true"
                ? views.features
                : views.featuresPassive;
          else
            window.executed.push([
              control.dataset.action,
              control.dataset.itemId,
              control.dataset.activityId
            ]);
        });
      }, views);
      await expect(page.locator('[data-action="useactivity"]')).toHaveCount(
        count
      );
      const root = page.locator(".ws-rolls-dialog");
      expect(
        await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
      await page
        .locator('[data-action="useactivity"]')
        .first()
        .click({ modifiers: ["Alt"] });
      expect((await page.evaluate(() => window.executed))[0][0]).toBe(
        "useactivity"
      );
      await page.locator('[data-category="features"]').click();
      await expect(
        page.locator('[data-action="featurefilter"]')
      ).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator('[data-action="openitem"]')).toHaveCount(0);
      await page.locator('[data-action="featurefilter"]').focus();
      await page.keyboard.press("Space");
      await expect(
        page.locator('[data-action="featurefilter"]')
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-description-item-id]")).toHaveCount(
        f.actor.items.filter(
          item =>
            item.type === "feat" &&
            !item.system.activities.some(activity => activity.activation?.type)
        ).length
      );
      await expect(page.locator('[data-action="openitem"]')).not.toHaveCount(0);
      await expect(page.locator('[data-action="useactivity"]')).toHaveCount(0);
      await expect(page.locator('[data-action="featurefilter"]')).toHaveText(
        t("Combat.ShowActiveFeatures")
      );
      await page.locator('[data-action="featurefilter"]').click();
      await expect(page.locator("[data-description-item-id]")).toHaveCount(
        f.actor.items.filter(
          item =>
            item.type === "feat" &&
            item.system.activities.some(activity => activity.activation?.type)
        ).length
      );
      expect(
        await root.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
    }
  });
}

async function previewPage(
  page,
  { theme = "dark", width = 320, enabled = true, slow = false } = {}
) {
  await page.setViewportSize({ width: 520, height: 600 });
  await page.setContent(
    `<style>${css}</style><main class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px;margin:8px;overflow:hidden"><div class="ws-shell"><section class="ws-view"><div data-description-item-id="a"><button type="button">Read trait</button></div></section></div></main>`
  );
  await page.addScriptTag({ content: createItemPreview.toString() });
  await page.evaluate(
    ({ enabled, slow }) => {
      window.automatic = enabled;
      window.nativeUses = 0;
      window.errors = [];
      const item = {
        id: "a",
        name: "Passive <img src=x> trait with a long readable title"
      };
      window.preview = createItemPreview({
        element: document.querySelector("main"),
        getItem: () => item,
        enrich: async () => {
          if (slow)
            await new Promise(resolve => (window.resolveDescription = resolve));
          return (
            '<p>Enriched description with <a class="content-link" data-uuid="Actor.example">document link</a>.</p>' +
            "<p>Long description paragraph.</p>".repeat(40)
          );
        },
        enabled: () => window.automatic,
        isActive: () => true,
        t: key =>
          ({
            "Combat.PinDescription": "Pin description",
            "Window.Close": "Close"
          })[key] ?? key,
        onError: error => window.errors.push(error.message)
      });
      document
        .querySelector('[data-description-item-id="a"] button')
        .addEventListener("click", () => window.nativeUses++);
    },
    { enabled, slow }
  );
}

test("hover preview is readable in both themes, stays in the viewport and can be pinned without using an item", async ({
  page
}) => {
  for (const theme of ["dark", "light"]) {
    await previewPage(page, { theme, width: 270 });
    await page.getByRole("button", { name: "Read trait" }).hover();
    const popup = page.locator(".ws-item-preview");
    await expect(popup).toBeVisible();
    await expect(popup.locator("header strong")).toHaveText(
      "Passive <img src=x> trait with a long readable title"
    );
    await expect(popup.locator("img")).toHaveCount(0);
    await expect(popup.locator(".content-link")).toHaveCount(1);
    const rect = await popup.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(520);
    expect(rect.y + rect.height).toBeLessThanOrEqual(600);
    await popup.getByRole("button", { name: "Pin description" }).click();
    await page.mouse.move(510, 590);
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute("role", "dialog");
    expect(await page.evaluate(() => window.nativeUses)).toBe(0);
    await popup.getByRole("button", { name: "Close", exact: true }).click();
    await expect(popup).toHaveCount(0);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
    await page.evaluate(() => window.preview.dispose());
  }
});

test("disabled hover still supports keyboard pinning, Escape and focus restoration", async ({
  page
}) => {
  await previewPage(page, { enabled: false });
  const card = page.getByRole("button", { name: "Read trait" });
  await card.focus();
  await page.waitForTimeout(500);
  await expect(page.locator(".ws-item-preview")).toHaveCount(0);
  await page.keyboard.press("F2");
  await expect(page.locator(".ws-item-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ws-item-preview")).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.evaluate(() => (window.automatic = true));
  await page.keyboard.press("F2");
  await expect(page.locator(".ws-item-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(page.locator(".ws-item-preview")).toHaveCount(0);
  expect(await page.evaluate(() => window.nativeUses)).toBe(0);
});

test("DOM refresh and session disposal remove pinned previews and discard late enrichment", async ({
  page
}) => {
  await previewPage(page);
  await page.getByRole("button", { name: "Read trait" }).focus();
  await page.keyboard.press("F2");
  await expect(page.locator(".ws-item-preview")).toBeVisible();
  await page.evaluate(
    () => (document.querySelector(".ws-view").innerHTML = "<p>New actor</p>")
  );
  await expect(page.locator(".ws-item-preview")).toHaveCount(0);
  await page.evaluate(() => window.preview.dispose());
  await previewPage(page, { slow: true });
  await page.getByRole("button", { name: "Read trait" }).focus();
  await page.keyboard.press("F2");
  await page.evaluate(() => {
    window.preview.dispose();
    window.resolveDescription();
  });
  await expect(page.locator(".ws-item-preview")).toHaveCount(0);
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("unavailable native actions remain readable from the keyboard", async ({
  page
}) => {
  const f = customNpcFixture("Humongous Fungus Troll", {
    hudState: { combatCategory: "activation:epic" }
  });
  const item = f.actor.items.find(item => item.name === "Grasping Tendrils");
  item.canUse = false;
  await page.setContent(
    `<style>${css}</style><main class="ws-rolls-dialog ws-theme-dark" style="width:320px"><div class="ws-shell"><section class="ws-view">${f.renderer.combatActions()}</section></div></main>`
  );
  await page.addScriptTag({ content: createItemPreview.toString() });
  await page.evaluate(
    ({ id, name }) => {
      const item = { id, name };
      window.preview = createItemPreview({
        element: document.querySelector("main"),
        getItem: () => item,
        enrich: async () => "<p>Unavailable action description</p>",
        enabled: () => false,
        isActive: () => true,
        t: key => key,
        onError: error => {
          throw error;
        }
      });
    },
    { id: item.id, name: item.name }
  );
  const card = page.locator(`[data-description-item-id="${item.id}"]`);
  await expect(card.locator(".ws-combat-item")).toBeDisabled();
  await card.focus();
  await page.keyboard.press("F2");
  await expect(page.locator(".ws-item-preview-body")).toHaveText(
    "Unavailable action description"
  );
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
});

test("player menu keeps nonstandard activations under Special", async ({
  page
}) => {
  for (const [language, theme] of [
    ["en", "dark"],
    ["ru", "light"]
  ]) {
    const t = key => translations[language]["ADVENTURER_HUD." + key] ?? key;
    const localized = customNpcFixture("Humongous Fungus Troll", {
      t,
      visibility: { gm: false },
      hudState: { actionMenuOpen: true, combatCategory: "special" }
    });
    [...localized.actor.items.values()].find(item =>
      item.system.activities.some(activity => activity.activation?.type)
    ).system.activities[0].activation.type = "hour";
    await page.setContent(
      `<style>${css}</style><main class="ws-rolls-dialog ws-theme-${theme}" style="width:270px"><div class="ws-shell"><section class="ws-view">${localized.renderer.combatActions()}</section></div></main>`
    );
    await expect(page.locator('[data-category^="activation:"]')).toHaveCount(0);
    await expect(
      page.locator('.ws-action-menu [data-category="special"]')
    ).toBeVisible();
    await expect(page.locator('[data-action="useactivity"]')).not.toHaveCount(
      0
    );
    expect(
      await page
        .locator(".ws-rolls-dialog")
        .evaluate(e => e.scrollWidth <= e.clientWidth + 1)
    ).toBe(true);
  }
});
