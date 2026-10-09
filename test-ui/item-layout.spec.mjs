import { loadHudModules } from "./module-fixture.mjs";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHudState } from "../scripts/hud/state.js";

const css = (
  await Promise.all(
    ["adventurer-hud", "combat", "shared", "responsive"].map(name =>
      readFile(new URL(`../styles/${name}.css`, import.meta.url), "utf8")
    )
  )
).join("\n");
const strings = JSON.parse(
  await readFile(new URL("../lang/ru.json", import.meta.url), "utf8")
);

test("shared player/GM editor supports drag, arrows, hiding and keyboard restoration at narrow widths", async ({
  page
}) => {
  const state = createHudState();
  const entries = ["Eldritch Blast", "Unarmed Strike", "Dodge"].map(
    (name, index) => ({
      key: `item-${index}`,
      name,
      html: `<div class="ws-combat-item-card"><button type="button" class="ws-combat-item ws-button" data-action="useitem"><span class="ws-combat-item-content"><strong>${name}</strong><small>Attack +7 · 1d10</small></span></button></div>`
    })
  );
  await loadHudModules(page, {
    "hud/items/item-layout.js": ["renderItemLayout", "moveItemLayout"],
    "hud/view-actions.js": ["createViewActions"],
    "hud/items/item-layout-interactions.js": ["bindItemLayoutInteractions"],
    "hud/refresh.js": ["refreshHudShell"],
    "hud/window/dom-state.js": ["captureHudDomState", "restoreHudDomState"],
    "hud/window/responsive-layout.js": ["applyPlayerLayout"]
  });
  await page.setContent(`<style>${css}</style><section class="ws-rolls-dialog ws-theme-dark ws-font-large" style="width:310px"><button data-action="togglehudedit" id="edit">Edit HUD</button><div id="order-list"></div></section><script>
      const state=${JSON.stringify(state)}, entries=${JSON.stringify(entries)}, strings=${JSON.stringify(strings)};
      const root=document.getElementById('order-list');
      const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
      const render=()=>{root.innerHTML=renderItemLayout({entries, scope:'combat:action',hudState:state,escapeHTML,t:key=>strings['ADVENTURER_HUD.'+key]||key});};
      const actions=createViewActions({actor:{isOwner:true},hudState:state,currentMode:()=> 'combat',refreshHud:render,savePanelState:()=>{},visibility:{}});
      let uses=0;
      root.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target)return;if(target.dataset.action==='useitem'){uses++;return;}actions[target.dataset.action]?.(event,target);});
      bindItemLayoutInteractions({element:root,isActive:()=>true,move:(event,target)=>actions.dropitemlayout(event,target)});
      document.getElementById('edit').addEventListener('click',()=>actions.togglehudedit());
      window.layoutUses=()=>uses;
      render();
      </script>`);
  await loadHudModules(page, {
    "hud/window/hud-layout.js": [
      "synchronizeHudLayout",
      "changeHudLayout",
      "bindHudLayoutDrag",
      "resetHudBlock",
      "undoHudLayout",
      "captureHudLayoutUndo",
      "rememberHudLayoutChange"
    ],
    "hud/view-actions.js": ["createViewActions"],
    "hud/refresh.js": ["refreshHudView", "refreshHudShell"],
    "hud/window/dom-state.js": ["captureHudDomState", "restoreHudDomState"],
    "hud/window/responsive-layout.js": ["applyPlayerLayout"],
    "hud/items/item-layout.js": ["renderItemLayout", "moveItemLayout"],
    "hud/items/item-layout-interactions.js": ["bindItemLayoutInteractions"]
  });
  await page.waitForFunction(() => Boolean(window.captureHudLayoutUndo));
  await page.locator('[data-action="togglehudedit"]').click();
  await page.locator(".ws-combat-item").first().click();
  expect(await page.evaluate(() => window.layoutUses())).toBe(0);
  await page.locator('[data-action="moveitemdown"]').first().click();
  await expect(page.locator(".ws-organized-entry").first()).toHaveAttribute(
    "data-layout-key",
    "item-1"
  );
  await page
    .locator(".ws-item-drag")
    .first()
    .dragTo(page.locator(".ws-organized-entry").last());
  await expect(page.locator(".ws-organized-entry").last()).toHaveAttribute(
    "data-layout-key",
    "item-1"
  );
  await page.locator('[data-action="toggleitemhidden"]').first().click();
  await expect(page.locator(".ws-organized-entry")).toHaveCount(2);
  await expect(page.locator('[data-action="togglehiddenitems"]')).toBeVisible();
  await page.locator('[data-action="togglehudedit"]').click();
  await expect(page.locator(".ws-organized-entry")).toHaveCount(2);
  await expect(page.locator('[data-action="togglehiddenitems"]')).toHaveCount(
    0
  );
  await page.locator('[data-action="togglehudedit"]').click();
  await page.locator('[data-action="togglehiddenitems"]').click();
  await expect(page.locator(".ws-organized-entry")).toHaveCount(2);
  await expect(page.locator(".ws-item-layout-restore")).toHaveCount(1);
  await page
    .locator('.ws-item-layout-restore [data-action="toggleitemhidden"]')
    .focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-action="togglehudedit"]').click();
  await expect(page.locator(".ws-organized-entry")).toHaveCount(3);
  await page.locator(".ws-combat-item").first().click();
  expect(await page.evaluate(() => window.layoutUses())).toBe(1);
  for (const width of [270, 320, 600]) {
    await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
      node.style.width = `${width}px`;
    }, width);
    await page.locator('[data-action="togglehudedit"]').click();
    const clipped = await page
      .locator(".ws-item-organization")
      .evaluate(root =>
        [
          ...root.querySelectorAll(
            "button,.ws-item-layout-controls,.ws-organized-entry"
          )
        ].some(node => node.scrollWidth > node.clientWidth + 2)
      );
    expect(clipped).toBe(false);
    await page.locator('[data-action="togglehudedit"]').click();
  }
});

for (const language of ["en", "ru"]) {
  for (const width of [320, 650]) {
    test(`long lists retain scrolling, keyboard activation and editing (${language}, ${width}px)`, async ({
      page
    }) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const translations = JSON.parse(
        await readFile(
          new URL(`../lang/${language}.json`, import.meta.url),
          "utf8"
        )
      );
      for (const theme of ["dark", "light"]) {
        await page.setContent(
          `<style>${css}</style><section class="ws-rolls-dialog ws-theme-${theme}" style="width:${width}px"><button id="edit" data-action="togglehudedit">${translations["ADVENTURER_HUD.ItemLayout.Edit"] || "Edit HUD"}</button><div class="ws-shell ws-combat-item-list" style="height:350px;overflow:auto"></div></section>`
        );
        await loadHudModules(page, {
          "hud/view-actions.js": ["createViewActions"],
          "hud/items/item-layout.js": ["renderItemLayout"],
          "hud/refresh.js": ["refreshHudShell"]
        });
        await page.addScriptTag({
          content: `
          (() => {
          ;;
          ;
          const renderedMarkup = new WeakMap(), state = ${JSON.stringify(createHudState())};
          const strings=${JSON.stringify(translations)}, root=document.querySelector('.ws-shell');
          const uses=[], entries=Array.from({length:500},(_,index)=>({key:'item-'+index,name:'Item '+index,html:'<div class="ws-combat-item-card"><button type="button" class="ws-combat-item ws-button" data-action="useitem" data-item-id="item-'+index+'"><span class="ws-combat-item-content"><strong>Item '+index+'</strong><small>Attack +7 · 1d10</small></span></button></div>'}));
          const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
          const render=()=>refreshHudShell(root,renderItemLayout({entries,scope:'combat:action',hudState:state,escapeHTML,t:key=>strings['ADVENTURER_HUD.'+key]||key})+'<span>'+uses.length+'</span>');
          const actions=createViewActions({actor:{isOwner:true},hudState:state,currentMode:()=> 'combat',refreshHud:render,savePanelState:()=>{},visibility:{}});
          root.addEventListener('click',event=>{const button=event.target.closest('[data-action="useitem"]');if(button&&!state.hudEditing){uses.push(button.dataset.itemId);render();}});
          document.getElementById('edit').addEventListener('click',()=>actions.togglehudedit());
          window.longListUses=()=>uses; render();
          })();
        `
        });
        expect(errors).toEqual([]);
        await expect(page.locator('[data-action="useitem"]')).toHaveCount(500);
        const last = page.locator('[data-item-id="item-499"]');
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
        await last.click();
        await expect(last).toBeInViewport();
        await last.focus();
        await page.keyboard.press("Enter");
        expect(await page.evaluate(() => window.longListUses())).toEqual([
          "item-499",
          "item-499"
        ]);
        await page.locator("#edit").click();
        await expect(page.locator(".ws-item-drag")).toHaveCount(500);
        expect(
          await page
            .locator(".ws-organized-entry")
            .last()
            .evaluate(node => getComputedStyle(node).contentVisibility)
        ).toBe("visible");
        await page.locator('[data-action="useitem"]').last().click();
        expect(await page.evaluate(() => window.longListUses())).toHaveLength(
          2
        );
      }
    });
  }
}
