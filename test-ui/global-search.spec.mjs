import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";
import { itemRendererFixture } from "../tests/helpers/rendering.mjs";
import { createViewActions } from "../scripts/hud/view-actions.js";
import { createHudState } from "../scripts/hud/state.js";
import { captureHudDomState } from "../scripts/hud/window/dom-state.js";
import { refreshHudView } from "../scripts/hud/refresh.js";
import { applyPlayerLayout } from "../scripts/hud/window/responsive-layout.js";

const layoutSource = await readFile(
  new URL("../scripts/hud/window/hud-layout.js", import.meta.url),
  "utf8"
);

for (const language of ["en", "ru"]) {
  test(`${language} typing keeps focus, caret and a search block moved above identity`, async ({
    page
  }) => {
    const fixture = await layoutFixture(language);
    const query = language === "en" ? "Sword" : "Меч";
    const { renderer, hudState } = itemRendererFixture({
      items: [{ id: "sword", name: query, type: "feat" }],
      visibility: { search: true }
    });
    const results = {};
    for (let length = 0; length <= query.length; length++) {
      hudState.searchQuery = query.slice(0, length);
      results[hudState.searchQuery] = renderer.globalSearchPanel();
    }
    await page.setContent(
      `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-large ws-theme-dark" style="width:650px"><header class="window-header"><b>HUD</b><button data-action="togglehudedit">Edit</button></header><div class="window-content" style="height:430px"><div class="ws-shell">${fixture.bodies["player-combat"]}</div></div></section>`
    );
    await page.addScriptTag({
      type: "module",
      content: `${layoutSource};Object.assign(window,{synchronizeHudLayout,changeHudLayout});`
    });
    await page.waitForFunction(() => Boolean(window.changeHudLayout));
    await page.addScriptTag({
      content: `${applyPlayerLayout.toString()};${createViewActions.toString()};${captureHudDomState.toString()};${refreshHudView.toString()};
      const state=${JSON.stringify(createHudState({ renderedMode: "combat" }))}, results=${JSON.stringify(results)}, renderedMarkup=new WeakMap();
      const root=document.querySelector('.ws-rolls-dialog'), app={element:root,rendered:true};
      const render=()=>{applyPlayerLayout(root.querySelector('.ws-player-layout'),true);synchronizeHudLayout(root,state,key=>key);};
      const updateSearch=query=>{state.searchQuery=query;refreshHudView({app,hudState:state,region:'search',mode:'combat',renderers:{search:()=>results[query]||results['']}});};
      const actions=createViewActions({actor:{isOwner:true},hudState:state,refreshHud:render,savePanelState:()=>{},updateSearch,visibility:{}});
      root.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target)actions[target.dataset.action]?.call(app,event,target);});
      root.addEventListener('input',event=>{if(event.target.matches('[data-action="searchitems"]'))updateSearch(event.target.value);});
      render();actions.togglehudedit();actions.hudblockmove.call(app,null,{dataset:{hudKey:'search',hudDestination:'identity'}});actions.togglehudedit();
      window.searchInput=root.querySelector('[data-action="searchitems"]');`
    });
    const input = page.locator('[data-action="searchitems"]');
    await input.focus();
    await input.pressSequentially(query, { delay: 60 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(query);
    expect(await input.evaluate(node => node === window.searchInput)).toBe(
      true
    );
    expect(await input.evaluate(node => node.selectionStart)).toBe(
      query.length
    );
    const panel = page.locator('[data-hud-block="search"]');
    expect(
      await panel.evaluate(node => [
        node.parentElement.dataset.hudLane,
        node.nextElementSibling.dataset.hudBlock
      ])
    ).toEqual(["info", "identity"]);
    await expect(
      page.locator('.ws-search-results .ws-combat-item[data-item-id="sword"]')
    ).toBeVisible();
    await panel.locator('[data-action="clearsearch"]').click();
    await expect(input).toHaveValue("");
    await expect(page.locator(".ws-search-results")).toHaveCount(0);
    expect(
      await panel.evaluate(node => node.nextElementSibling.dataset.hudBlock)
    ).toBe("identity");
    await page.locator(".ws-actor-identity").hover();
    expect(
      await page
        .locator(".ws-actor-identity")
        .evaluate(node => getComputedStyle(node).transform)
    ).toBe("none");
    const bounds = await page.locator(".ws-actor-identity").evaluate(node => ({
      top: node.getBoundingClientRect().top,
      columnTop: node.closest("[data-hud-lane]").getBoundingClientRect().top
    }));
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.columnTop);
  });
}
