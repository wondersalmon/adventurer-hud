import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import {
  createHudSectionReveal,
  expandedHudSection,
  revealHudSection
} from "../scripts/hud/window/section-reveal.js";

test("right-column expansion and collapse restore only that column, including combat categories and disabled scrolling", async ({
  page
}) => {
  const { baseline, css } = await layoutFixture("ru");
  for (const action of ["togglefavorites", "combatfilter", "view"]) {
    const attributes =
      action === "combatfilter"
        ? 'class="ws-combat-filter" data-category="features"'
        : action === "view"
          ? 'data-view="skills" data-exploration-section="true"'
          : "";
    const section =
      action === "combatfilter"
        ? "ws-combat-actions"
        : action === "view"
          ? "ws-exploration-section"
          : "ws-favorites";
    const body =
      action === "combatfilter"
        ? "ws-combat-item-list"
        : action === "view"
          ? "ws-exploration-section-body"
          : "ws-favorite-content";
    await page.setContent(
      `<style>${baseline}\n${css}</style><section class="ws-rolls-dialog ws-font-large" style="width:650px"><div class="window-content" style="height:300px"><div class="ws-shell"><div class="ws-player-layout ws-player-columns" style="height:300px"><section class="ws-player-info"><div style="height:900px">Info</div></section><section class="ws-player-actions"><div style="height:180px">Earlier blocks</div><section class="${section}"><button ${attributes} data-action="${action}" aria-expanded="false">Toggle</button><div class="${body}" style="height:620px" hidden>Expanded content</div></section><div style="height:600px">Following blocks</div></section></div></div></div></section>`
    );
    await page.addScriptTag({
      content: `(()=>{${expandedHudSection.toString()};${revealHudSection.toString()};${createHudSectionReveal.toString()};
      const root=document.querySelector('.ws-rolls-dialog'), reveal=createHudSectionReveal();
      window.scrollEnabled=true;
      const button=root.querySelector('[data-action]');
      button.addEventListener('click',()=>{const action=button.dataset.action,before=reveal.capture(root,action,button);const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));button.nextElementSibling.hidden=!open;reveal.finish(root,action,button,before,window.scrollEnabled);});})();
`
    });
    const right = page.locator(".ws-player-actions"),
      left = page.locator(".ws-player-info");
    await page.evaluate(async () => {
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      document.querySelector(".ws-player-info").scrollTop = 35;
      document.querySelector(".ws-player-actions").scrollTop = 60;
    });
    const before = await right.evaluate(node => node.scrollTop);
    expect(before).toBe(60);
    await page.locator(`[data-action="${action}"]`).click();
    expect(
      await right.evaluate(node => node.scrollTop),
      action
    ).toBeGreaterThan(before);
    expect(await left.evaluate(node => node.scrollTop)).toBe(35);
    const headerTop = await page
      .locator(`[data-action="${action}"]`)
      .evaluate(node => node.getBoundingClientRect().top);
    const viewportTop = await right.evaluate(
      node => node.getBoundingClientRect().top
    );
    expect(headerTop).toBeGreaterThanOrEqual(viewportTop);
    await page.locator(`[data-action="${action}"]`).click();
    expect(await right.evaluate(node => node.scrollTop)).toBe(before);
    expect(await left.evaluate(node => node.scrollTop)).toBe(35);
    await page.evaluate(() => {
      window.scrollEnabled = false;
    });
    await page.locator(`[data-action="${action}"]`).click();
    expect(await right.evaluate(node => node.scrollTop)).toBe(before);
  }
});
