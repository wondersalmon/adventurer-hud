import { loadHudModules } from "./module-fixture.mjs";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { layoutFixture } from "./layout-fixture.mjs";
import { createHudState } from "../scripts/hud/state.js";
const strings = JSON.parse(
  await readFile(new URL("../lang/ru.json", import.meta.url), "utf8")
);
const pageErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]));
const fixture = await layoutFixture("ru");

async function setupEditor(page, scenario) {
  await page.setContent(
    `<style>${fixture.baseline}\n${fixture.css}</style><section class="ws-rolls-dialog ws-font-large ws-theme-dark" style="width:640px"><header class="window-header"><b>HUD</b><button data-action="togglepin">Pin</button><button data-action="togglehudedit">Edit</button></header><div class="window-content" style="height:560px;padding:0"><div class="ws-shell">${fixture.bodies[scenario]}</div></div></section>`
  );
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
  await page.waitForFunction(() => Boolean(window.changeHudLayout));
  await page.addScriptTag({
    content: `
    const state=${JSON.stringify(createHudState())};const strings=${JSON.stringify(strings)};
    const root=document.querySelector('.ws-rolls-dialog');
    const sync=()=>{const view=root.querySelector('.ws-player-layout');if(view)applyPlayerLayout(view,root.getBoundingClientRect().width>=600);synchronizeHudLayout(root,state,key=>strings['ADVENTURER_HUD.'+key]||key);};
    const render=()=>window.refreshWholePanel ? window.refreshWholePanel() : sync();window.syncEditorLayout=sync;
    const app={element:root};const actions=createViewActions({actor:{isOwner:true},hudState:state,refreshHud:render,savePanelState:()=>{},visibility:{}});
    root.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target)actions[target.dataset.action]?.call(app,event,target);});
    window.disposeEditorDrag=bindHudLayoutDrag({element:root,isActive:()=>state.hudEditing,move:(event,target)=>actions.hudblockmove.call(app,event,target)});
    window.editorState=state;window.renderEditor=render;
    window.resizeEditor=width=>{root.style.width=width+'px';render();};render();`
  });
  await page.locator('[data-action="togglehudedit"]').click();
}

async function useFullRefresh(page, scenario) {
  await page.addScriptTag({
    content: `
    window.editorState.currentView='skills';window.refreshWholePanel=()=>refreshHudView({app:{rendered:true,element:document.querySelector('.ws-rolls-dialog')},availableViews:()=>({skills:true}),hudState:window.editorState,mode:'regular',renderers:{regular:()=>${JSON.stringify(fixture.bodies[scenario])}},setView:()=>{},title:'HUD',syncLayout:window.syncEditorLayout});`
  });
}

test("full refresh restores moved exploration section scroll after saved layout", async ({
  page
}) => {
  await setupEditor(page, "player-skills");
  await page.locator('[data-action="togglehudedit"]').click();
  await useFullRefresh(page, "player-skills");
  const before = await page.evaluate(() => {
    const root = document.querySelector(".ws-rolls-dialog");
    root.style.width = "900px";
    root.querySelector(".window-content").style.height = "380px";
    window.editorState.hudLayouts = {
      "regular:info": { order: ["tab:skills"], hidden: [] }
    };
    window.syncEditorLayout();
    const info = root.querySelector(".ws-player-info");
    info.scrollTop = 500;
    return info.scrollTop;
  });
  expect(before).toBe(500);
  await page.evaluate(() => window.refreshWholePanel());
  expect(
    await page.locator(".ws-player-info").evaluate(node => node.scrollTop)
  ).toBe(before);
  await expect(
    page.locator('.ws-player-info [data-hud-block="tab:skills"]')
  ).toBeVisible();
});

test("keyboard block moves preserve the exact editor control across full refresh", async ({
  page
}) => {
  await setupEditor(page, "player-skills");
  await useFullRefresh(page, "player-skills");
  const down = page.locator(
    '[data-hud-block="hp"] [data-hud-direction="down"]'
  );
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(down).toBeFocused();
  const up = page.locator('[data-hud-block="hp"] [data-hud-direction="up"]');
  await up.focus();
  await page.keyboard.press("Enter");
  await expect(up).toBeFocused();
});

test("block reset and undo remain keyboard accessible at narrow widths and leave compact rests beside inspiration", async ({
  page
}) => {
  await setupEditor(page, "player-main-footer");
  const identity = page.locator('[data-hud-block="identity"]');
  const undo = page.locator('[data-action="hudlayoutundo"]');
  await expect(undo).toBeDisabled();
  await expect(
    identity.locator(':scope > .ws-hud-block-tools [data-hud-direction="up"]')
  ).toBeEnabled();
  const rests = page.locator('[data-hud-block="rests"]');
  await rests
    .locator(':scope > .ws-hud-block-tools [data-hud-direction="right"]')
    .click();
  expect(await rests.evaluate(node => node.parentElement.dataset.hudLane)).toBe(
    "actions"
  );
  await expect(undo).toBeEnabled();
  await rests
    .locator(':scope > .ws-hud-block-tools [data-action="hudblockreset"]')
    .focus();
  await page.keyboard.press("Enter");
  expect(await rests.evaluate(node => node.parentElement.dataset.hudLane)).toBe(
    "info"
  );
  await undo.focus();
  await page.keyboard.press("Enter");
  expect(await rests.evaluate(node => node.parentElement.dataset.hudLane)).toBe(
    "actions"
  );
  await expect(undo).toBeDisabled();
  await rests
    .locator(':scope > .ws-hud-block-tools [data-action="hudblockreset"]')
    .click();
  await page.evaluate(() => window.resizeEditor(320));
  await expect(page.locator(".ws-mode-navigation")).toBeVisible();
  await page.locator('[data-action="togglehudedit"]').click();
  expect(await rests.evaluate(node => node.parentElement.className)).toBe(
    "ws-actor-inspiration-slot"
  );
  const inspiration = await page
    .locator('[data-action="inspiration"]')
    .boundingBox();
  const rest = await page.locator('[data-action="shortrest"]').boundingBox();
  expect(rest.width).toBeLessThan(36);
  expect(rest.y + rest.height / 2).toBeCloseTo(
    inspiration.y + inspiration.height / 2,
    0
  );
});

test("dragging auto-scrolls the hovered column and stops on center, leave, DOM replacement and disposal", async ({
  page
}) => {
  await setupEditor(page, "player-skills");
  const lane = page.locator(".ws-player-actions");
  await page.evaluate(() => {
    const lane = document.querySelector(".ws-player-actions");
    window.dragSource = document.querySelector('[data-hud-block="tab:skills"]');
    window.dragOverEdge = () => {
      const rect = lane.getBoundingClientRect();
      lane.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          clientY: rect.bottom - 2,
          clientX: rect.left + 30
        })
      );
    };
    window.startTestDrag = () => {
      window.dragSource
        .querySelector(":scope > .ws-hud-block-tools .ws-hud-block-grip")
        .dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            dataTransfer: new DataTransfer()
          })
        );
      window.dragOverEdge();
    };
    window.startTestDrag();
  });
  await expect
    .poll(() => lane.evaluate(node => node.scrollTop))
    .toBeGreaterThan(0);
  for (const reason of ["center", "leave", "replace", "dispose"]) {
    const stopped = await page.evaluate(async reason => {
      const lane = document.querySelector(".ws-player-actions");
      if (reason !== "center") window.startTestDrag();
      if (reason === "center") {
        const rect = lane.getBoundingClientRect();
        lane.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            clientY: rect.top + rect.height / 2
          })
        );
      } else if (reason === "leave")
        lane.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
      else if (reason === "replace")
        window.dragSource.replaceWith(window.dragSource.cloneNode(true));
      else window.disposeEditorDrag();
      const before = lane.scrollTop;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const after = lane.scrollTop;
      if (reason === "replace")
        window.dragSource = lane.querySelector('[data-hud-block="tab:skills"]');
      return after === before;
    }, reason);
    expect(stopped).toBe(true);
  }
});

for (const scenario of [
  "player-combat",
  "gm-actions",
  "player-main",
  "player-skills",
  "player-spells",
  "player-inventory"
]) {
  test(`${scenario} editor supports cross-column drag, keyboard hiding and restoration without clipping`, async ({
    page
  }) => {
    await setupEditor(page, scenario);
    await expect(page.locator(".ws-hud-edit-badge")).toHaveText(
      "Редактирование"
    );
    const identity = page.locator('[data-hud-block="identity"]');
    if (scenario.startsWith("gm-"))
      await page.evaluate(() => window.resizeEditor(1120));
    const exploration =
      !scenario.includes("combat") && !scenario.startsWith("gm-");
    await identity
      .locator(".ws-hud-block-grip")
      .dragTo(
        page.locator(
          `[data-hud-block="${exploration ? "tab:skills" : "actions"}"] > .ws-hud-block-tools`
        )
      );
    expect(
      await identity.evaluate(node => node.parentElement.dataset.hudLane)
    ).toBe("actions");
    const tabKey = scenario.startsWith("gm-")
      ? "tab:action"
      : exploration
        ? "tab:skills"
        : "tab:weapons";
    const tab = page.locator(`[data-hud-block="${tabKey}"]`);
    const movingKey = scenario.startsWith("gm-")
      ? "tab:features"
      : "tab:inventory";
    const moving = page.locator(`[data-hud-block="${movingKey}"]`);
    if (
      (exploration && scenario !== "player-main") ||
      scenario === "player-combat"
    ) {
      // Expanded content can exceed the viewport; arrow controls move the whole section.
      for (let step = 0; step < (scenario === "player-combat" ? 6 : 2); step++)
        await moving
          .locator(':scope > .ws-hud-block-tools [data-hud-direction="up"]')
          .click();
    } else {
      await moving
        .locator(":scope > .ws-hud-block-tools .ws-hud-block-grip")
        .dragTo(tab.locator(":scope > .ws-hud-block-tools"));
    }
    expect(
      await tab.evaluate(node => node.previousElementSibling.dataset.hudBlock)
    ).toBe(movingKey);
    if (exploration) {
      await moving
        .locator(':scope > .ws-hud-block-tools [data-hud-direction="left"]')
        .click();
      expect(
        await moving.evaluate(node => node.parentElement.dataset.hudLane)
      ).toBe("info");
      expect(
        await tab.evaluate(node => node.parentElement.dataset.hudLane)
      ).toBe("actions");
    }
    await tab.locator('[data-action="hudblockhide"]').click();
    await expect(tab).toBeHidden();
    await page.locator(".ws-hud-layout-menu summary").click();
    await page
      .locator(
        `.ws-hud-layout-restore [data-hud-key="${tabKey}"][data-action="hudblockhide"]`
      )
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
      const overlapping = await page
        .locator(".ws-hud-block-tools")
        .evaluateAll(nodes => {
          const boxes = nodes
            .filter(node => node.getClientRects().length)
            .map(node => node.getBoundingClientRect());
          return boxes.some((box, index) =>
            boxes
              .slice(index + 1)
              .some(
                other =>
                  box.left < other.right &&
                  box.right > other.left &&
                  box.top < other.bottom &&
                  box.bottom > other.top
              )
          );
        });
      expect(overlapping).toBe(false);
    }
    await page.locator('[data-action="togglehudedit"]').click();
    await expect(page.locator(".ws-hud-block-tools")).toHaveCount(0);
    await expect(page.locator(".ws-hud-edit-badge")).toHaveCount(0);
  });
}
