import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { installSettings } from "../tests/helpers/foundry.mjs";
import { loadHudModules } from "./module-fixture.mjs";
import { measureTextContrast } from "./contrast.mjs";

const engine = Handlebars.create();
engine.registerHelper("checked", value => (value ? "checked" : ""));
const template = engine.compile(
  await readFile(new URL("../templates/settings.hbs", import.meta.url), "utf8")
);
const css = (
  await Promise.all(
    ["adventurer-hud", "combat", "responsive", "dialogs"].map(name =>
      readFile(new URL(`../styles/${name}.css`, import.meta.url), "utf8")
    )
  )
).join("\n");
const integrityTemplate = await readFile(
  new URL("../templates/integrity.hbs", import.meta.url),
  "utf8"
);
for (const language of ["en", "ru"]) {
  const strings = JSON.parse(
    await readFile(new URL(`../lang/${language}.json`, import.meta.url), "utf8")
  );
  for (const isGM of [false, true]) {
    for (const theme of ["dark", "light"])
      for (const width of [360, 650, 820])
        test(`${language} ${isGM ? "GM" : "player"} Configure categories preserve edits, keyboard navigation and footer (${theme}, ${width}px)`, async ({
          page
        }) => {
          await page.route(
            /https:\/\/adventurer-hud.test\/CHANGELOG(?:\.ru)?\.md$/,
            route =>
              route.fulfill({
                contentType: "text/plain",
                headers: { "Access-Control-Allow-Origin": "*" },
                body: "# Changelog\n\n## 2.2.0\n- Current release. [Guide](docs/player-guide.md) [Unsafe](javascript:alert)\n\n## 2.1.0\n- Older release.\n\n## 1.4.1\n- Legacy release."
              })
          );
          await page.route(
            "https://adventurer-hud.test/modules/adventurer-hud/lang/*.json",
            async route => {
              const locale = route.request().url().endsWith("ru.json")
                ? "ru"
                : "en";
              await route.fulfill({
                contentType: "application/json",
                headers: { "Access-Control-Allow-Origin": "*" },
                body: await readFile(
                  new URL(`../lang/${locale}.json`, import.meta.url),
                  "utf8"
                )
              });
            }
          );
          const f = installSettings({
            isGM,
            values: {
              language: "auto",
              showCompanions: false,
              gmEnabled: false
            }
          });
          globalThis.CONFIG = {
            statusEffects: [
              {
                id: "flying",
                name: "Flying",
                img: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M12 17L2 3v9l7 9h6l7-9V3z'/%3E%3C/svg%3E"
              },
              { id: "thinking", name: "Thinking" },
              { id: "hovering", name: "Hovering" },
              { id: "poisoned", name: "Poisoned" }
            ],
            DND5E: { conditionTypes: { poisoned: {} } }
          };
          f.current.set("hiddenEffects", ["status:thinking"]);
          game.modules = new Map([["adventurer-hud", { version: "2.2.0" }]]);
          foundry.utils.getRoute = path => path;
          globalThis.fetch = async path => ({
            ok: true,
            json: async () =>
              JSON.parse(
                await readFile(
                  new URL(
                    `../lang/${path.includes("ru.json") ? "ru" : "en"}.json`,
                    import.meta.url
                  ),
                  "utf8"
                )
              )
          });
          game.i18n.lang = language;
          game.i18n.localize = key => strings[key] ?? key;
          game.actors = [
            {
              uuid: "Actor.rook",
              name: "Rook",
              type: "character",
              isOwner: true
            },
            {
              uuid: "Actor.hero",
              name: "Hero",
              type: "character",
              isOwner: true
            }
          ];
          const context = await new (f.menus.get(
            "configure"
          ).type)()._prepareContext();
          const body = template(context);
          await page.addScriptTag({
            path: "node_modules/handlebars/dist/handlebars.min.js"
          });
          await page.setViewportSize({ width: width + 30, height: 750 });
          await page.setContent(
            `<style>body{margin:10px;font:14px Arial}*{box-sizing:border-box}.adventurer-hud-settings{width:${width}px;height:680px;display:flex;flex-direction:column}.window-header{padding:12px;flex:0 0 auto}.window-content{flex:1}input,select,button{font:inherit}.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900}.form-fields{min-width:0}${css}</style><section class="adventurer-hud-settings"><header class="window-header">Adventurer HUD<button class="header-control icon fa-solid" data-action="close"></button><button class="header-control icon fa-solid" data-action="toggleControls"></button></header><div class="window-content">${body}</div></section>`
          );
          await page
            .locator(".ws-settings-form")
            .evaluate(
              (node, theme) => (node.dataset.settingsTheme = theme),
              theme
            );
          await page
            .locator('[name="theme"]')
            .selectOption(theme, { force: true });
          await page.evaluate(
            ({
              values,
              isGM,
              integrityTemplate,
              strings,
              language,
              config
            }) => {
              class ApplicationV2 {
                async render() {
                  this.rendered = true;
                  window.lastOpenedSettings = this;
                  return this;
                }
              }
              window.foundry = {
                utils: {
                  escapeHTML: value =>
                    window.Handlebars.Utils.escapeExpression(value),
                  getRoute: path =>
                    /CHANGELOG(?:\.ru)?\.md$/.test(path)
                      ? `https://adventurer-hud.test/${path.split("/").at(-1)}`
                      : `https://adventurer-hud.test/${path}`
                },
                applications: {
                  handlebars: {
                    renderTemplate: async (_path, data) =>
                      window.Handlebars.compile(integrityTemplate)(data)
                  },
                  api: {
                    ApplicationV2,
                    HandlebarsApplicationMixin: Base => class extends Base {}
                  }
                }
              };
              const menus = new Map();
              window.Hooks = { callAll() {} };
              window.game = {
                actors: [
                  {
                    uuid: "Actor.rook",
                    name: "Rook",
                    type: "character",
                    isOwner: true
                  },
                  {
                    uuid: "Actor.hero",
                    name: "Hero",
                    type: "character",
                    isOwner: true
                  }
                ],
                modules: new Map([["adventurer-hud", { version: "2.2.0" }]]),
                user: { isGM },
                i18n: {
                  lang: language,
                  localize: key => strings[key] ?? key,
                  format: (key, data) =>
                    (strings[key] ?? key).replace(
                      /\{([^{}]+)\}/g,
                      (match, name) => data[name] ?? match
                    )
                },
                settings: {
                  registerMenu: (_module, key, value) => menus.set(key, value),
                  get: (_module, key) => values[key],
                  set: async (_module, key, value) => (values[key] = value)
                }
              };
              window.CONFIG = config;
              window.settingsMenus = menus;
            },
            {
              values: Object.fromEntries(f.current),
              isGM,
              integrityTemplate,
              strings,
              language,
              config: globalThis.CONFIG
            }
          );
          await loadHudModules(page, {
            "settings-applications.js": ["registerSettingsMenus"]
          });
          await page.evaluate(async () => {
            window.registerSettingsMenus();
            const App = window.settingsMenus.get("configure").type;
            const app = new App();
            app.element = document.querySelector(".adventurer-hud-settings");
            await app._prepareContext();
            app._onRender({}, {});
            app._onRender({}, {});
            app.element.addEventListener("click", event => {
              const action =
                event.target.closest("[data-action]")?.dataset.action;
              App.DEFAULT_OPTIONS.actions[action]?.call(app);
            });
            window.settingsApp = app;
          });
          for (const control of await page
            .locator(".window-header .header-control")
            .all()) {
            expect(
              await control.evaluate(node => getComputedStyle(node).fontFamily)
            ).toContain("Font Awesome");
            expect(
              await control.evaluate(
                node => node.getBoundingClientRect().height
              )
            ).toBe(28);
          }
          const search = page.locator("[data-settings-search]");
          await expect(search).toBeFocused();
          await search.fill(language === "en" ? "акцент" : "accent");
          await expect(
            page.locator("[data-settings-search-results] button").first()
          ).toBeVisible();
          expect(
            await page.locator("[data-settings-search-results] button").count()
          ).toBeGreaterThan(0);
          await page
            .locator("[data-settings-search-results] button")
            .first()
            .click();
          await expect(page.locator(".ws-settings-search-match")).toHaveCount(
            1
          );
          await page.locator("[data-settings-search-clear]").click();
          await expect(search).toHaveValue("");
          await expect(page.locator(".ws-settings-search-match")).toHaveCount(
            0
          );
          const tab = id => page.locator(`[data-settings-tab="${id}"]`);
          const panel = id => page.locator(`[data-settings-panel="${id}"]`);
          await search.fill("backup");
          await page
            .locator("[data-settings-search-results] button")
            .filter({
              hasText: strings["ADVENTURER_HUD.Troubleshooting.BackupSection"]
            })
            .click();
          await expect(
            panel("troubleshooting").locator(
              '[data-troubleshooting-section="backup"]'
            )
          ).toHaveAttribute("open", "");
          await expect(
            panel("troubleshooting").locator('[data-action="backupsettings"]')
          ).toBeFocused();
          await page.locator("[data-settings-search-clear]").click();
          await tab("behavior").click();
          const openingPolicy = page.locator('[name="hudActorSelection"]');
          await expect(openingPolicy).toHaveValue("assigned");
          await expect(page.locator('[name="hudPreferredActor"]')).toHaveCount(
            0
          );
          await expect(openingPolicy.locator("option")).toHaveText([
            strings["ADVENTURER_HUD.Settings.hudActorSelection.Assigned"],
            strings["ADVENTURER_HUD.Settings.hudActorSelection.Prompt"],
            strings["ADVENTURER_HUD.Settings.hudActorSelection.Last"],
            "Rook",
            "Hero"
          ]);
          await expect(
            page.locator('.ws-settings-nav [name="language"]')
          ).toHaveCount(0);
          await expect(
            page.locator('[data-settings-panel="behavior"] [name="language"]')
          ).toHaveCount(1);
          await expect(page.locator('[name="showFavoriteMode"]')).toHaveCount(
            0
          );
          expect((await search.boundingBox()).width).toBeLessThanOrEqual(240);
          const saveStatus = page.locator("[data-settings-save-status]");
          await expect(saveStatus).toBeVisible();
          const savedColor = await saveStatus.evaluate(
            node => getComputedStyle(node, "::before").backgroundColor
          );
          await openingPolicy.selectOption("Actor.rook");
          await expect(openingPolicy).toHaveValue("Actor.rook");
          await openingPolicy.selectOption("last");
          await expect(
            page.locator("[data-settings-save-status]")
          ).toHaveAttribute("data-state", "unsaved");
          expect(
            await saveStatus.evaluate(
              node => getComputedStyle(node, "::before").backgroundColor
            )
          ).not.toBe(savedColor);
          await openingPolicy.selectOption("assigned");
          await expect(
            page.locator("[data-settings-save-status]")
          ).toHaveAttribute("data-state", "saved");

          await expect(tab("changelog")).toHaveClass(
            /ws-settings-changelog-new/
          );
          expect(
            await page
              .locator(".ws-settings-nav")
              .evaluate(node => getComputedStyle(node).scrollbarColor)
          ).toBe(
            await page
              .locator(".ws-settings-content")
              .evaluate(node => getComputedStyle(node).scrollbarColor)
          );
          // Native Foundry buttons center their contents by default.
          await page.addStyleTag({
            content:
              'button{justify-content:center;margin:0 2px;height:32px;text-align:center} input[type="search"]::-webkit-search-cancel-button{display:inline-block;width:12px;height:12px;background:white}'
          });
          await search.fill(language === "en" ? "effect" : "эффект");
          const resultButtons = page.locator(
            "[data-settings-search-results] button"
          );
          expect(await resultButtons.count()).toBeGreaterThan(0);
          for (const result of await resultButtons.all()) {
            expect(
              await result.evaluate(n => {
                const r = n.getBoundingClientRect();
                return (
                  getComputedStyle(n).textAlign === "left" &&
                  [...n.children].every(c => {
                    const b = c.getBoundingClientRect();
                    return (
                      b.left >= r.left &&
                      b.right <= r.right + 1 &&
                      b.bottom <= r.bottom + 1 &&
                      getComputedStyle(c).textAlign === "left"
                    );
                  })
                );
              })
            ).toBe(true);
          }
          await expect(search).toHaveAttribute("type", "text");
          await expect(search).toHaveAttribute("role", "searchbox");
          await expect(
            page.locator(".ws-settings-search-controls button")
          ).toHaveCount(1);
          await page.locator("[data-settings-search-clear]").click();
          if (width > 560) {
            const positions = await page
              .locator(
                '.ws-settings-nav button:visible:not([data-settings-parent]:not([data-settings-parent=""]))'
              )
              .evaluateAll(nodes =>
                nodes.map(node => ({
                  icon: node.querySelector("i").getBoundingClientRect().left,
                  label: node.querySelector("span").getBoundingClientRect().left
                }))
              );
            for (const position of positions) {
              const first = positions[0];
              expect(position.icon).toBeCloseTo(first.icon, 1);
              expect(position.label).toBeCloseTo(first.label, 1);
            }
          }
          await expect(page.locator(".ws-settings-nav-divider")).toHaveCount(1);
          expect(
            await page
              .locator('[data-settings-tab="help"]')
              .evaluate(node =>
                node.previousElementSibling.classList.contains(
                  "ws-settings-nav-divider"
                )
              )
          ).toBe(true);
          expect(
            await page
              .locator(".ws-settings-nav button")
              .evaluateAll(nodes =>
                nodes.map(
                  node => node.dataset.settingsTab ?? node.dataset.action
                )
              )
          ).toEqual([
            "behavior",
            "windowLayout",
            "appearance",
            "appearanceTheme",
            "appearanceAnimations",
            "quickAccess",
            "panelSections",
            "panelItems",
            "effects",
            "cardDetails",
            "companions",
            ...(isGM
              ? [
                  "gm",
                  "gmWindow",
                  "gmSelection",
                  "gmActions",
                  "gmCards",
                  "world"
                ]
              : []),
            "help",
            "changelog",
            "troubleshooting"
          ]);
          await page
            .locator(".adventurer-hud-settings")
            .evaluate(n => (n.style.fontSize = "20px"));
          for (const label of await page
            .locator(".ws-settings-nav button:visible span")
            .all()) {
            expect(
              await label.evaluate(n => n.scrollWidth <= n.clientWidth + 1)
            ).toBe(true);
          }
          await page
            .locator(".adventurer-hud-settings")
            .evaluate(n => (n.style.fontSize = "14px"));
          const accent = () =>
            page
              .locator(".adventurer-hud-settings")
              .evaluate(node =>
                getComputedStyle(node)
                  .getPropertyValue("--ws-settings-accent")
                  .trim()
              );
          expect(await accent()).toBe(
            theme === "light" ? "#81570f" : "#c19a58"
          );
          await tab("changelog").click();
          await expect(tab("changelog")).not.toHaveClass(
            /ws-settings-changelog-new/
          );
          await expect(
            page.locator('[data-changelog-version="2.2.0"]')
          ).toHaveAttribute("open", "");
          await expect(
            page.locator('[data-changelog-version="2.1.0"]')
          ).not.toHaveAttribute("open", "");
          await expect(
            page.locator('[data-changelog-version="1.4.1"]')
          ).toHaveCount(0);
          await expect(
            panel("changelog").getByRole("link", { name: "Guide", exact: true })
          ).toHaveAttribute(
            "href",
            "https://github.com/wondersalmon/adventurer-hud/blob/main/docs/player-guide.md"
          );
          await expect(
            panel("changelog").locator('a[href^="javascript:"]')
          ).toHaveCount(0);
          await page
            .locator('[data-changelog-version="2.1.0"] summary')
            .click();
          await expect(
            page.locator('[data-changelog-version="2.1.0"]')
          ).toHaveAttribute("open", "");
          await tab("help").click();
          await expect(
            panel("help").locator('a[href$="/CHANGELOG.md"]')
          ).toHaveCount(0);
          await tab("changelog").click();
          await expect(
            page.locator('[data-changelog-version="2.1.0"]')
          ).toHaveAttribute("open", "");
          const layoutTab = tab("windowLayout");
          const heightBefore = await layoutTab.evaluate(
            n => n.getBoundingClientRect().height
          );
          await layoutTab.click();
          await tab("quickAccess").click();
          await expect(panel("panelSections")).toBeVisible();
          for (const [key, defaultValue] of [
            ["explorationFooterMode", "recent"],
            ["combatFooterMode", "target"]
          ]) {
            const footerSelect = page.locator(`[name="${key}"]`);
            await expect(footerSelect).toBeVisible();
            await expect(footerSelect.locator("option")).toHaveCount(3);
            await footerSelect.selectOption("none");
            await expect(footerSelect).toHaveValue("none");
            await footerSelect.selectOption(defaultValue);
          }
          const footerEnabled = page.locator('[name="playerFooter"]');
          await footerEnabled.uncheck();
          for (const key of ["explorationFooterMode", "combatFooterMode"])
            await expect(page.locator(`[name="${key}"]`)).toBeDisabled();
          await footerEnabled.check();
          for (const [key, value] of [
            ["explorationFooterMode", "recent"],
            ["combatFooterMode", "target"]
          ]) {
            await expect(page.locator(`[name="${key}"]`)).toBeEnabled();
            await expect(page.locator(`[name="${key}"]`)).toHaveValue(value);
          }
          await layoutTab.click();
          expect(
            await layoutTab.evaluate(n => n.getBoundingClientRect().height)
          ).toBe(heightBefore);
          await expect(tab("cardDetails")).toBeHidden();
          await tab("quickAccess").click();
          await expect(tab("quickAccess")).toHaveAttribute(
            "aria-expanded",
            "true"
          );
          await expect(tab("effects")).toBeVisible();
          await tab("cardDetails").click();
          const playerMode = page.locator('[name="cardDetails"]');
          const playerPreview = page.locator(
            '[data-card-preview="cardDetailFields"]'
          );
          await playerMode.selectOption("off");
          await expect(playerPreview.locator(".ws-spell-meta")).toHaveCount(0);
          await playerMode.selectOption("all");
          await expect(
            playerPreview.locator(".ws-spell-components")
          ).toHaveCount(1);
          await playerMode.selectOption("custom");
          await page
            .locator('[name="cardDetailFields"][value="components"]')
            .uncheck();
          await expect(playerMode).toHaveValue("custom");
          await expect(
            playerPreview.locator(".ws-spell-components")
          ).toHaveCount(0);
          await expect(playerPreview.locator("[data-action]")).toHaveCount(0);
          if (isGM) {
            await tab("gm").click();
            await expect(tab("cardDetails")).toBeHidden();
            await tab("gmCards").click();
            const mode = page.locator('[name="gmCardDetails"]');
            await expect(mode).toBeEnabled();
            await mode.selectOption("basic");
            expect(
              await page.locator('[name="gmCardDetailFields"]:checked').count()
            ).toBe(5);
            await mode.selectOption("custom");
            await page
              .locator('[name="gmCardDetailFields"][value="range"]')
              .check();
            await expect(mode).toHaveValue("custom");
          } else
            await expect(page.locator('[name="gmCardDetails"]')).toHaveCount(0);
          await tab("appearance").click();
          await expect(tab("appearanceTheme")).toBeVisible();
          await expect(tab("appearanceAnimations")).toBeVisible();
          await tab("appearanceAnimations").click();
          await expect(
            page.locator(".ws-settings-appearance-preview")
          ).toBeVisible();
          await expect(
            page.locator('[name="showVisualEffects"]')
          ).toBeVisible();
          await expect(page.locator('[name="theme"]')).toBeHidden();
          await tab("appearanceTheme").click();
          expect(
            await panel("appearanceTheme")
              .locator(".form-fields > select")
              .evaluateAll(nodes => nodes.map(node => node.name))
          ).toEqual([
            "theme",
            "accentPreset",
            "fontSize",
            "fontFamily",
            "fontStyle"
          ]);
          await expect(
            page.locator('[name="language"] [value="en"]')
          ).toHaveText("English");
          const size = page.locator('[name="fontSize"]');
          const fineSize = page.locator('[name="fontSizePx"]');
          await size.selectOption("medium");
          await expect(fineSize).toHaveValue("11.5");
          await fineSize.evaluate(node => {
            node.value = "12.25";
            node.dispatchEvent(new Event("input", { bubbles: true }));
          });
          for (const selector of [
            "[data-theme-preview]",
            "[data-appearance-preview]"
          ]) {
            await expect(page.locator(selector)).toHaveClass(/ws-font-custom/);
            expect(
              await page
                .locator(selector)
                .evaluate(node =>
                  node.style.getPropertyValue("--ws-custom-type-scale")
                )
            ).toBe("1.225");
          }
          await expect(size).toHaveValue("custom");
          await size.selectOption("large");
          await expect(fineSize).toHaveValue("13");
          const themeChoice = page.locator('[name="theme"]');
          await expect(themeChoice.locator("option")).toHaveCount(6);
          await expect(themeChoice.locator('[value="light"]')).toHaveText(
            "Foundry Light"
          );
          await expect(themeChoice.locator('[value="dark"]')).toHaveText(
            "Foundry Dark"
          );
          const preset = page.locator('[name="accentPreset"]');
          const color = page.locator('[name="accentColor"]');
          await expect(preset).toHaveValue("standard");
          await expect(preset.locator("option")).toHaveCount(8);
          await expect(preset.locator('[value="standard"]')).toHaveText(
            strings["ADVENTURER_HUD.Settings.accentPreset.standard"]
          );
          await expect(preset.locator('[value="foundry"]')).toHaveText(
            strings["ADVENTURER_HUD.Settings.accentPreset.foundry"]
          );
          await expect(color).toBeHidden();
          await expect(color).toBeDisabled();
          await expect(color).toHaveValue("#0f766e");
          await preset.selectOption("custom");
          await expect(color).toBeEnabled();
          await expect(color).toBeVisible();
          await color.evaluate(node => {
            node.value = "#5eead4";
            node.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await expect(color.locator("xpath=..").locator("output")).toHaveText(
            "#5EEAD4"
          );
          expect(await accent()).toBe("#5eead4");
          for (const text of await page
            .locator('.ws-settings-nav [aria-selected="true"]')
            .all()) {
            const { ratio: contrast } = await measureTextContrast(text, {
              backgroundPseudo: "::after"
            });
            expect(contrast).toBeGreaterThanOrEqual(4.5);
          }

          const surfaces = () =>
            page
              .locator(".adventurer-hud-settings")
              .evaluate(node =>
                [node, node.querySelector(".window-header")].map(
                  element => getComputedStyle(element).backgroundColor
                )
              );
          const previousSurfaces = await surfaces();
          await preset.selectOption("blue");
          const blueSurfaces = await surfaces();
          for (let index = 0; index < blueSurfaces.length; index++)
            expect(blueSurfaces[index]).toBe(previousSurfaces[index]);
          expect(await accent()).toBe(
            theme === "light" ? "#1d4ed8" : "#93c5fd"
          );
          await preset.selectOption("teal");
          const tealSurfaces = await surfaces();
          for (let index = 0; index < tealSurfaces.length; index++)
            expect(tealSurfaces[index]).toBe(blueSurfaces[index]);
          expect(await accent()).toBe(
            theme === "light" ? "#0c6861" : "#5eead4"
          );
          await expect(color).toBeDisabled();
          await expect(color).toHaveValue("#5eead4");
          await preset.selectOption("custom");
          await expect(color).toBeEnabled();
          await page.locator('[name="theme"]').selectOption("light");
          await tab("behavior").click();
          await page.locator('[name="autoOpenHud"]').check();
          await tab("windowLayout").click();
          const range = page.locator('[name="twoColumnWidth"]');
          await expect(range).toBeDisabled();
          await page.locator('[name="twoColumnMode"]').selectOption("manual");
          await expect(
            page.locator('[data-mechanics-preview="twoColumnMode"]')
          ).toHaveCount(0);
          if (isGM) {
            await tab("gm").click();
            await page.locator('[name="gmEnabled"]').check();
            await tab("gmActions").click();
            const actionExample = page.locator(
              '[data-mechanics-preview="gmActionDisplay"]'
            );
            for (const mode of ["all", "types", "items"]) {
              await page.locator('[name="gmActionDisplay"]').selectOption(mode);
              await expect(actionExample).toHaveAttribute("data-mode", mode);
              await expect(
                actionExample.locator(".ws-mechanics-example-tabs span")
              ).toHaveCount(mode === "items" ? 2 : 0);
              await expect(
                actionExample.locator(".ws-mechanics-example-group")
              ).toHaveCount(mode === "all" ? 0 : 2);
              expect(
                await actionExample.evaluate(
                  node => node.scrollWidth <= node.clientWidth + 1
                )
              ).toBe(true);
            }
            await page
              .locator('[name="gmActionDisplay"]')
              .selectOption("types");
            await tab("gm").click();
            await page.locator('[name="gmEnabled"]').uncheck();
            await tab("windowLayout").click();
          }
          await expect(range).toBeEnabled();
          await range.focus();
          await page.keyboard.press("ArrowRight");
          await expect(
            panel("windowLayout").locator(".ws-settings-range output")
          ).toHaveText("460");
          await page.keyboard.press("End");
          await expect(
            panel("windowLayout").locator(".ws-settings-range output")
          ).toHaveText("1200");
          expect(
            await range.evaluate(node =>
              node.style.getPropertyValue("--ws-settings-progress")
            )
          ).toBe("100%");
          await page.keyboard.press("Home");
          await expect(
            panel("windowLayout").locator(".ws-settings-range output")
          ).toHaveText("450");
          expect(
            await range.evaluate(node =>
              node.style.getPropertyValue("--ws-settings-progress")
            )
          ).toBe("0%");
          if (isGM && language === "ru" && width === 820) {
            await range.evaluate(node => {
              node.value = "820";
              node.dispatchEvent(new Event("input", { bubbles: true }));
            });
            await range
              .locator('xpath=ancestor::div[contains(@class,"form-group")]')
              .screenshot({
                path: `dev/test-results/slider-teal-${theme}-preview.png`
              });
          }
          await tab("companions").click();
          for (const field of await page
            .locator('[data-parent-key="showCompanions"]')
            .all())
            await expect(field).toBeDisabled();
          await page.locator('[name="showCompanions"]').check();
          for (const field of await page
            .locator('[data-parent-key="showCompanions"]')
            .all())
            await expect(field).toBeEnabled();
          await tab("appearance").click();
          await expect(page.locator('[name="theme"]')).toHaveValue("light");
          await expect(color).toHaveValue("#5eead4");
          await expect(preset).toHaveValue("custom");
          if (isGM && language === "ru" && width === 820) {
            await page
              .locator(".ws-settings-content")
              .evaluate(node => (node.scrollTop = 0));
            await page.locator(".adventurer-hud-settings").screenshot({
              path: `dev/test-results/accent-presets-${theme}-preview.png`
            });
          }
          await tab("behavior").click();
          await expect(page.locator('[name="autoOpenHud"]')).toBeChecked();
          await tab("appearance").focus();
          await page.keyboard.press("ArrowDown");
          await expect(tab("panelSections")).toBeFocused();
          await expect(panel("panelSections")).toBeVisible();
          await page.keyboard.press("End");
          await expect(tab("troubleshooting")).toBeFocused();
          await expect(panel("troubleshooting")).toBeVisible();
          await page.keyboard.press("ArrowUp");
          await expect(tab("changelog")).toBeFocused();
          await page.keyboard.press("ArrowUp");
          await expect(tab("help")).toBeFocused();
          await expect(panel("help")).toBeVisible();
          if (isGM && language === "ru" && width === 820 && theme === "dark")
            await page.locator(".adventurer-hud-settings").screenshot({
              path: "dev/test-results/documentation-preview.png"
            });
          await expect(
            panel("help").locator('a[href*="beta-testing"]')
          ).toHaveCount(0);
          await expect(
            panel("help").locator('[data-action="troubleshooting"]')
          ).toHaveCount(0);
          const links = panel("help").locator("a");
          await expect(links).toHaveCount(isGM ? 7 : 6);
          for (const link of await links.all()) {
            expect(await link.getAttribute("href")).toMatch(
              /^https:\/\/(?:github.com\/wondersalmon\/adventurer-hud(?:\/|$)|www.reddit.com\/message\/compose\/\?to=Outrageous_Cash1694&subject=Adventurer%20HUD%20Feedback$)/
            );
            await expect(link).toHaveAttribute("rel", "noopener noreferrer");
          }
          await expect(
            panel("help").locator('[data-guide-file="layout-guide"]')
          ).toHaveAttribute(
            "href",
            `https://github.com/wondersalmon/adventurer-hud/blob/main/docs/layout-guide${language === "ru" ? ".ru" : ""}.md`
          );
          await expect(page.locator("[data-settings-apply]")).toBeVisible();
          expect(
            await page
              .locator(".adventurer-hud-settings")
              .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
          ).toBe(true);
          await tab("quickAccess").click();
          await tab("effects").click();
          await expect
            .poll(() =>
              page.evaluate(() => window.settingsApp.effectsController.loaded)
            )
            .toBe(true);
          await expect(page.locator('[name="statusFilter"]')).toHaveValue(
            "custom"
          );
          await page
            .locator('[name="statusFilter"]')
            .selectOption("conditions");
          const thinking = page.locator(
            '[name="hiddenEffects"][value="status:thinking"]'
          );
          const flying = page.locator(
            '[name="hiddenEffects"][value="status:flying"]'
          );
          await expect(flying.locator("..").locator("img")).toHaveAttribute(
            "src",
            /^data:image\/svg\+xml,/
          );
          await expect(thinking.locator("..").locator("i")).toHaveClass(
            /fa-wand-magic-sparkles/
          );
          const hovering = page.locator(
            '[name="hiddenEffects"][value="status:hovering"]'
          );
          const poisoned = page.locator(
            '[name="hiddenEffects"][value="status:poisoned"]'
          );
          const boxes = await Promise.all(
            [flying, hovering, poisoned].map(field =>
              field.locator("..").boundingBox()
            )
          );
          if (width === 820) {
            expect(boxes[0].y).toBe(boxes[1].y);
            expect(boxes[1].y).toBe(boxes[2].y);
            expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
            expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
          } else if (width === 650) {
            expect(boxes[0].y).toBe(boxes[1].y);
            expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
          } else expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
          await expect(thinking).toBeChecked();
          await expect(flying).toBeChecked();
          await expect(hovering).toBeChecked();
          await expect(poisoned).not.toBeChecked();
          await flying.uncheck();
          await expect(page.locator('[name="statusFilter"]')).toHaveValue(
            "custom"
          );
          await poisoned.check();
          await page.locator("[data-effect-search]").fill("Poison");
          await expect(thinking.locator("..")).toBeHidden();
          await expect(thinking).toBeChecked();
          await page.locator("[data-effect-search]").fill("");
          const saveEffects = async () =>
            page.evaluate(async () => {
              const app = window.settingsApp;
              await app.constructor.DEFAULT_OPTIONS.form.handler.call(
                app,
                null,
                null,
                {
                  object: {
                    statusFilter: app.element.querySelector(
                      '[name="statusFilter"]'
                    ).value
                  }
                }
              );
              return {
                filter: game.settings.get("adventurer-hud", "statusFilter"),
                hidden: game.settings.get("adventurer-hud", "hiddenEffects")
              };
            });
          expect(await saveEffects()).toEqual({
            filter: "custom",
            hidden: ["status:hovering", "status:poisoned", "status:thinking"]
          });
          await page
            .locator('[name="statusFilter"]')
            .selectOption("conditions");
          await expect(flying).toBeChecked();
          await expect(poisoned).not.toBeChecked();
          expect(await saveEffects()).toEqual({
            filter: "conditions",
            hidden: []
          });
          if (language === "en" && !isGM && theme === "dark" && width === 650) {
            await page.evaluate(async () => {
              await window.settingsApp._prepareContext();
              const list = document.querySelector("[data-hidden-effects-list]");
              for (let i = 0; i < 201; i++) {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.name = "hiddenEffects";
                input.value = "effect:Extra" + i;
                input.dataset.standardStatus = "false";
                input.dataset.testExtra = "true";
                list.append(input);
              }
            });
            await page.locator('[name="statusFilter"]').selectOption("all");
            await page
              .locator('[name="statusFilter"]')
              .selectOption("conditions");
            expect(
              await page
                .locator('[name="statusFilter"]')
                .evaluate(node => node.checkValidity())
            ).toBe(true);
            expect(await saveEffects()).toEqual({
              filter: "conditions",
              hidden: []
            });
            await flying.uncheck();
            await expect(page.locator('[name="statusFilter"]')).toHaveValue(
              "custom"
            );
            expect(
              await page
                .locator('[name="statusFilter"]')
                .evaluate(node => node.validationMessage)
            ).toContain("200");
            expect(
              await page
                .locator('[name="statusFilter"]')
                .evaluate(node => node.checkValidity())
            ).toBe(false);
            await page.locator('[data-action="showalleffects"]').click();
            expect(
              await page
                .locator('[name="statusFilter"]')
                .evaluate(node => node.checkValidity())
            ).toBe(true);
            expect(await saveEffects()).toEqual({ filter: "all", hidden: [] });
            await page
              .locator("[data-test-extra]")
              .evaluateAll(nodes => nodes.forEach(node => node.remove()));
          }
          await page.locator('[name="statusFilter"]').selectOption("all");
          await expect(thinking).not.toBeChecked();
          await expect(flying).not.toBeChecked();
          await expect(hovering).not.toBeChecked();
          expect(await saveEffects()).toEqual({ filter: "all", hidden: [] });
          await flying.check();
          await expect(page.locator('[name="statusFilter"]')).toHaveValue(
            "custom"
          );
          if (isGM && language === "ru" && width === 820 && theme === "dark")
            await page.locator(".adventurer-hud-settings").screenshot({
              path: "dev/test-results/effect-checklist-preview.png"
            });
          await page.locator('[data-action="showalleffects"]').click();
          await expect(thinking).not.toBeChecked();
          await expect(flying).not.toBeChecked();
          await expect(page.locator('[name="statusFilter"]')).toHaveValue(
            "all"
          );
          expect(await saveEffects()).toEqual({ filter: "all", hidden: [] });
          for (const row of await panel("panelSections")
            .locator(".form-group")
            .all())
            expect(
              await row.evaluate(
                node => node.scrollWidth <= node.clientWidth + 1
              )
            ).toBe(true);
          await page
            .locator(".ws-settings-content")
            .evaluate(node => (node.scrollTop = node.scrollHeight));
          await expect(page.locator("[data-settings-apply]")).toBeInViewport();
          await page
            .locator('.ws-settings-nav [data-settings-tab="troubleshooting"]')
            .focus();
          await page.keyboard.press("Enter");
          await expect(panel("troubleshooting")).toBeVisible();
          await panel("troubleshooting")
            .locator('[data-troubleshooting-section="report"] > summary')
            .click();
          await expect(
            panel("troubleshooting").locator('[data-action="record"]')
          ).toBeVisible();
          expect(
            await page.evaluate(() => window.lastOpenedSettings)
          ).toBeUndefined();
          await expect(page.locator(".ws-troubleshooting-footer")).toHaveCount(
            0
          );
          // Search includes lazy tools and standalone sections in either language.
          for (const [query, section] of [
            ["backup", "backup"],
            ["резерв", "backup"],
            ["reset setti", "resets"],
            ["сброс", "resets"]
          ]) {
            await tab("appearance").click();
            await search.fill(query);
            await page
              .locator("[data-settings-search-results] button")
              .filter({
                hasText:
                  strings[
                    "ADVENTURER_HUD.Troubleshooting." +
                      (section === "backup" ? "BackupSection" : "Resets")
                  ]
              })
              .click();
            const target = panel("troubleshooting").locator(
              `[data-troubleshooting-section="${section}"]`
            );
            await expect(target).toHaveAttribute("open", "");
            await expect(target).toHaveClass(/ws-settings-search-match/);
            await expect(target.locator("button").first()).toBeFocused();
          }
          await search.fill("change");
          await page
            .locator("[data-settings-search-results] button")
            .filter({
              hasText: strings["ADVENTURER_HUD.Settings.Changelog.Name"]
            })
            .click();
          await expect(panel("changelog")).toBeVisible();
          await expect(panel("changelog").locator("h2")).toHaveClass(
            /ws-settings-search-match/
          );
          await page.locator("[data-settings-search-clear]").click();
          await expect(page.locator('[name="accentPreset"]')).toHaveValue(
            "custom"
          );
          await tab("quickAccess").click();
          await expect(panel("panelSections")).toBeVisible();
          await expect(page.locator('[name="accentPreset"]')).toHaveValue(
            "custom"
          );
          await page.evaluate(() => window.settingsApp._onClose({}));
        });
  }
}
