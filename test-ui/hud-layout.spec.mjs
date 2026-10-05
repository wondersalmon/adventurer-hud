import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";
import { createHudState } from "../scripts/hud/state.js";
import { createViewActions } from "../scripts/hud/view-actions.js";
import { applyPlayerLayout } from "../scripts/hud/window/responsive-layout.js";
const source = await readFile(
  new URL("../scripts/hud/window/hud-layout.js", import.meta.url),
  "utf8"
);
const strings = JSON.parse(
  await readFile(new URL("../lang/ru.json", import.meta.url), "utf8")
);
const fixture = await layoutFixture("ru");

for (const scenario of ["player-combat", "gm-actions"]) {
  test(`${scenario} editor supports cross-column drag, keyboard hiding and restoration without clipping`, async ({
    page
  }) => {
    await page.setContent(
      `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-large ws-theme-dark" style="width:640px"><header class="window-header"><b>HUD</b><button data-action="togglepin">Pin</button><button data-action="togglehudedit">Edit</button></header><div class="window-content" style="height:560px;padding:0"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section>`
    );
    await page.addScriptTag({
      type: "module",
      content: `${source};Object.assign(window,{synchronizeHudLayout,changeHudLayout,bindHudLayoutDrag});`
    });
    await page.waitForFunction(() => Boolean(window.changeHudLayout));
    await page.addScriptTag({
      content: `${applyPlayerLayout.toString()};${createViewActions.toString()};
      const state=${JSON.stringify(createHudState())};const strings=${JSON.stringify(strings)};
      const root=document.querySelector('.ws-rolls-dialog');
      const render=()=>{const view=root.querySelector('.ws-player-layout');if(view)applyPlayerLayout(view,root.getBoundingClientRect().width>=600);synchronizeHudLayout(root,state,key=>strings['ADVENTURER_HUD.'+key]||key);};
      const app={element:root};const actions=createViewActions({actor:{isOwner:true},hudState:state,refreshHud:render,savePanelState:()=>{},visibility:{}});
      root.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target)actions[target.dataset.action]?.call(app,event,target);});
      bindHudLayoutDrag({element:root,isActive:()=>state.hudEditing,move:(event,target)=>actions.hudblockmove.call(app,event,target)});
      window.resizeEditor=width=>{root.style.width=width+'px';render();};render();`
    });
    await page.locator('[data-action="togglehudedit"]').click();
    await expect(page.locator(".ws-hud-edit-badge")).toHaveText(
      "Редактирование"
    );
    const identity = page.locator('[data-hud-block="identity"]');
    if (scenario.startsWith("gm-"))
      await page.evaluate(() => window.resizeEditor(1120));
    await identity
      .locator(".ws-hud-block-grip")
      .dragTo(page.locator('[data-hud-block="actions"] > .ws-hud-block-tools'));
    expect(
      await identity.evaluate(node => node.parentElement.dataset.hudLane)
    ).toBe("actions");
    const tabKey = scenario.startsWith("gm-") ? "tab:action" : "tab:weapons";
    const tab = page.locator(`[data-hud-block="${tabKey}"]`);
    const movingKey = scenario.startsWith("gm-")
      ? "tab:features"
      : "tab:inventory";
    const moving = page.locator(`[data-hud-block="${movingKey}"]`);
    await moving
      .locator(".ws-hud-block-grip")
      .dragTo(tab.locator(".ws-hud-block-tools"));
    expect(
      await tab.evaluate(node => node.previousElementSibling.dataset.hudBlock)
    ).toBe(movingKey);
    await tab.locator('[data-action="hudblockhide"]').click();
    await expect(tab).toBeHidden();
    await page.locator(".ws-hud-layout-menu summary").click();
    await page
      .locator(`.ws-hud-layout-restore [data-hud-key="${tabKey}"]`)
      .focus();
    await page.keyboard.press("Enter");
    await expect(tab).toBeVisible();
    for (const width of [320, 640, 1120]) {
      await page.evaluate(width => window.resizeEditor(width), width);
      const clipped = await page
        .locator(".ws-hud-block-tools")
        .evaluateAll(nodes =>
          nodes.some(node => node.scrollWidth > node.clientWidth + 2)
        );
      expect(clipped).toBe(false);
    }
    await page.locator('[data-action="togglehudedit"]').click();
    await expect(page.locator(".ws-hud-block-tools")).toHaveCount(0);
    await expect(page.locator(".ws-hud-edit-badge")).toHaveCount(0);
  });
}
