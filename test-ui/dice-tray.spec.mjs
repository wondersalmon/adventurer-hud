import { bindHudDiceTray } from "../scripts/hud/window/window-session.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";

const controller = (
  await readFile(
    new URL("../scripts/hud/dice-tray.js", import.meta.url),
    "utf8"
  )
).replace(/^import .*;\r?\n/gm, "");
const native = await readFile(
  new URL("../scripts/dnd5e/dice-tray.js", import.meta.url),
  "utf8"
);

for (const language of ["en", "ru"]) {
  test(`${language} dice popover stays inside narrow/wide light/dark windows and supports keyboard/native gestures`, async ({
    page
  }) => {
    const f = await layoutFixture(language);
    const strings = JSON.parse(
      await readFile(
        new URL(`../lang/${language}.json`, import.meta.url),
        "utf8"
      )
    );
    await page.setViewportSize({ width: 900, height: 800 });
    await page.setContent(
      `<style>${f.baseline}\n${f.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="position:absolute;left:20px;top:20px;width:650px;height:500px"><header class="window-header">HUD</header><div class="window-content" style="height:470px"><div class="ws-shell">${f.bodies["player-combat-footer"]}</div></div></section>`
    );
    await page.addScriptTag({
      type: "module",
      content: `${native}\n${controller}
${bindHudDiceTray.toString()}
      const strings=${JSON.stringify(strings)}, root=document.querySelector('.ws-rolls-dialog');
      window.trayCalls=[]; window.foundry={dice:{Roll:class {constructor(formula){this.total=9;this.dice=window.trayDice||[];window.trayCalls.push(formula);}async evaluate(){}async toMessage(data,options){window.trayChat={data,options};}}}};
      window.CONFIG={ChatMessage:{documentClass:{getSpeaker:()=>({actor:'hero'})}}};window.game={audio:{interface:new AudioContext(),locked:false,globalMute:false},settings:{get:(_module,key)=>key==='globalInterfaceVolume'?0.3:'gm'}};
      const audio=game.audio.interface, originalOscillator=audio.createOscillator.bind(audio);window.trayAudioStarted=0;
      audio.createOscillator=()=>{window.trayAudioStarted++;return originalOscillator();};
      document.addEventListener('keydown',()=>void audio.resume(),{once:true});
      const reportFailure=()=>{};const app={element:root};
      bindHudDiceTray({app,actor:{isOwner:true,getRollData:()=>({})},t:key=>strings['ADVENTURER_HUD.'+key]||key,isActive:()=>true,load:()=>Promise.resolve({bindDiceTray})});
      window.closeTray=()=>app.closeDiceTray(); window.trayReady=true;`
    });
    await page.waitForFunction(() => window.trayReady);
    for (const width of [320, 650]) {
      for (const theme of ["light", "dark"]) {
        await page.locator(".ws-rolls-dialog").evaluate(
          (node, { width, theme }) => {
            node.style.width = width + "px";
            node.className = `ws-rolls-dialog ws-theme-${theme}`;
          },
          { width, theme }
        );
        const toggle = page.locator('[data-dice-tray="toggle"]');
        await toggle.click();
        const tray = page.locator(".ws-dice-tray");
        await expect(tray).toBeVisible();
        await expect(tray).toHaveAttribute(
          "aria-label",
          strings["ADVENTURER_HUD.DiceTray.Title"]
        );
        const rootBox = await page.locator(".ws-rolls-dialog").boundingBox();
        const box = await tray.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(rootBox.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(
          rootBox.x + rootBox.width + 1
        );
        expect(box.y).toBeGreaterThanOrEqual(rootBox.y - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(
          rootBox.y + rootBox.height + 1
        );
        expect(
          await tray.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        const rollButton = tray.locator('[data-dice-tray="roll"]');
        await expect(rollButton).toBeDisabled();
        await expect(rollButton).toHaveAttribute(
          "title",
          strings["ADVENTURER_HUD.DiceTray.Empty"]
        );
        await rollButton.hover();
        const title = tray.locator('[data-dice-tray="mimic"]');
        await title.focus();
        for (let click = 0; click < 5; click++)
          await page.keyboard.press("Enter");
        await expect(tray).toHaveClass(/ws-tray-mimic/);
        expect(
          await page.evaluate(() => window.trayAudioStarted)
        ).toBeGreaterThan(0);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await tray.screenshot({
          path: `dev/test-results/mimic-${language}-${theme}-${width}.png`
        });
        expect(
          await tray
            .locator(".ws-tray-face")
            .evaluate(node => getComputedStyle(node).animationName)
        ).toBe("none");
        for (const result of [20, 1]) {
          const soundCount = await page.evaluate(() => window.trayAudioStarted);
          await page.evaluate(value => {
            window.trayDice = [
              { faces: 20, results: [{ result: value, active: true }] }
            ];
          }, result);
          await tray.locator('[data-die="20"]').click({ modifiers: ["Shift"] });
          await expect(tray).toHaveClass(new RegExp(`ws-tray-nat${result}`));
          await expect
            .poll(() => page.evaluate(() => window.trayAudioStarted))
            .toBe(soundCount + (result === 20 ? 4 : 2));
          await expect(tray.locator("[data-dice-result]")).toContainText(
            strings[`ADVENTURER_HUD.DiceTray.Natural${result}`]
          );
          expect(
            await tray.evaluate(node => getComputedStyle(node).animationName)
          ).toBe("none");
          await tray.screenshot({
            path: `dev/test-results/natural-${result}-${language}-${theme}-${width}.png`
          });
        }
        await page.evaluate(() => {
          window.trayDice = [];
        });
        await page.emulateMedia({ reducedMotion: "no-preference" });
        const die = tray.locator('[data-die="20"]');
        await die.click();
        await die.click();
        await die.click({ button: "right" });
        await expect(die.locator("small")).toHaveText("1");
        await expect(rollButton).toBeEnabled();
        await expect(rollButton).not.toHaveAttribute("title");
        expect(
          await die.evaluate(node => getComputedStyle(node).borderTopStyle)
        ).toBe("solid");
        expect(
          await die.evaluate(node => getComputedStyle(node).backgroundColor)
        ).not.toBe("rgba(0, 0, 0, 0)");
        const dieBox = await die.boundingBox();
        const countBox = await die.locator("small").boundingBox();
        expect(countBox.y + countBox.height).toBeLessThanOrEqual(
          dieBox.y + dieBox.height
        );
        await tray.screenshot({
          path: `dev/test-results/dice-${language}-${theme}-${width}.png`
        });
        await die.click({ modifiers: ["Shift"] });
        await expect
          .poll(() => page.evaluate(() => window.trayCalls.at(-1)))
          .toBe("1d20");
        await expect(die.locator("small")).toHaveText("0");
        await die.click({ modifiers: ["Alt"] });
        await expect
          .poll(() => page.evaluate(() => window.trayCalls.at(-1)))
          .toBe("2d20kh");
        await die.click({ modifiers: ["Control"] });
        await expect
          .poll(() => page.evaluate(() => window.trayCalls.at(-1)))
          .toBe("2d20kl");
        await die.click();
        await tray.locator("input").fill("-2");
        await tray.locator("input").press("Enter");
        await expect
          .poll(() => page.evaluate(() => window.trayCalls.at(-1)))
          .toBe("1d20 + (-2)");
        await expect(die.locator("small")).toHaveText("0");
        await expect(tray.locator("input")).toHaveValue("-2");
        expect(
          await page.evaluate(() => window.trayChat.options.messageMode)
        ).toBe("gm");
        await tray.locator('[data-dice-tray="clear"]').click();
        await expect(die.locator("small")).toHaveText("0");
        await die.click({ button: "right" });
        await expect(die.locator("small")).toHaveText("0");
        await title.focus();
        await page.keyboard.press("Shift+Tab");
        await expect(tray.locator("[data-dice-visibility]")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(tray).toHaveCount(0);
        await expect(toggle).toBeFocused();
        await toggle.click();
        await page.mouse.click(5, 5);
        await expect(tray).toHaveCount(0);
      }
    }
  });
}
