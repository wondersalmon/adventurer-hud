import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

test("HUD animation groups play normally and stop with reduced motion", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await page.setContent(`<style>${fixture.baseline}${fixture.css}</style>
    <section id="health" class="ws-rolls-dialog ws-theme-dark ws-hp-feedback" data-hp-feedback="damage">
      <button class="ws-health-button"><span class="ws-health-track"><span class="ws-health-fill"></span><span class="ws-health-temp-fill"></span></span></button>
      <span class="ws-status-new"></span><button class="ws-companion-turn"></button><button class="ws-gm-start"></button>
    </section>
    <section id="initiative" class="ws-rolls-dialog ws-initiative-rolled"><button class="ws-header-initiative"><strong>20</strong></button></section>
    <section id="turn" class="ws-rolls-dialog ws-turn-arrival"></section>
    <section id="request" class="ws-rolls-dialog ws-initiative-flash"></section>
    <section class="ws-rolls-dialog"><div class="ws-tray-mimic"><span class="ws-tray-face"></span></div>
      <div class="ws-tray-nat20"><span class="ws-tray-fortune"><span class="ws-tray-rune">20</span><span class="ws-tray-sparks"></span></span></div>
      <div class="ws-tray-nat1"><span class="ws-tray-face"></span></div>
    </section>`);
  const animated = [
    [".ws-health-fill", null, "ws-health-normal-change"],
    [".ws-health-temp-fill", null, "ws-health-temp-change"],
    [".ws-health-button", "::after", "ws-health-delta"],
    [".ws-health-track", "::before", "ws-health-damage-trail"],
    [".ws-status-new", null, "ws-status-arrival"],
    [".ws-companion-turn", "::after", "ws-companion-turn-glow"],
    [".ws-gm-start", "::after", "ws-gm-start-alert"],
    [".ws-header-initiative", null, "ws-initiative-result"],
    [".ws-header-initiative strong", null, "ws-initiative-value"],
    ["#turn", null, "ws-turn-panel-glow"],
    ["#request", null, "ws-initiative-request"],
    [".ws-tray-mimic .ws-tray-face", null, "ws-tray-mimic"],
    [".ws-tray-nat20", null, "ws-tray-gold"],
    [".ws-tray-fortune", null, "ws-tray-fortune"],
    [".ws-tray-rune", "::before", "ws-tray-ring"],
    [".ws-tray-sparks", null, "ws-tray-sparks"],
    [".ws-tray-nat1 .ws-tray-face", null, "ws-tray-crack"]
  ];
  for (const reduced of [false, true]) {
    await page.emulateMedia({
      reducedMotion: reduced ? "reduce" : "no-preference"
    });
    const names = await page.evaluate(
      rows =>
        rows.map(
          ([selector, pseudo]) =>
            getComputedStyle(document.querySelector(selector), pseudo)
              .animationName
        ),
      animated
    );
    expect(names).toEqual(
      animated.map(([, , name]) => (reduced ? "none" : name))
    );
  }
});

test("native character HP updates animate the rendered bar and flash during turn arrival, then clean up", async ({
  page
}) => {
  const fixture = await layoutFixture("en");
  await page.setContent(
    `<style>${fixture.baseline}${fixture.css}</style><section class="ws-rolls-dialog ws-theme-dark" style="position:relative;width:400px"><header class="window-header"><span class="window-title">Character</span></header><div class="ws-shell"></div></section>`
  );
  await loadHudModules(page, {
    "hud/window/window-session.js": ["activateHudWindow"],
    "hud/health-bar.js": ["renderHealthBar"],
    "hud/refresh.js": ["createRefreshScheduler", "refreshHudShell"],
    "settings-schema.js": ["getSettingDefaults"]
  });
  await page.evaluate(async () => {
    const values = window.getSettingDefaults();
    const hooks = new Map();
    window.Hooks = {
      on(name, fn) {
        const id = Symbol(name);
        hooks.set(id, { name, fn });
        return id;
      },
      off(_name, id) {
        hooks.delete(id);
      },
      callAll(name, ...args) {
        for (const hook of hooks.values())
          if (hook.name === name) hook.fn(...args);
      }
    };
    window.game = {
      user: { isGM: false },
      settings: { get: (_module, key) => values[key] },
      i18n: { localize: key => key },
      combat: null
    };
    window.CONFIG = { statusEffects: [] };
    const actor = { id: "hero", uuid: "Actor.hero", isOwner: true };
    let hp = { value: 20, max: 20, temp: 0 };
    let turn = false;
    const root = document.querySelector(".ws-rolls-dialog");
    const shell = root.querySelector(".ws-shell");
    const render = () =>
      window.refreshHudShell(
        shell,
        window.renderHealthBar({
          hp,
          canEdit: true,
          formatMod: String,
          t: key => key
        })
      );
    render();
    const app = {
      element: root,
      rendered: true,
      position: { width: 400, height: 400 },
      render: async () => {},
      updatePinControl() {},
      addEventListener() {},
      hudActions: {}
    };
    const scheduler = window.createRefreshScheduler(render);
    await window.activateHudWindow({
      actor,
      app,
      state: {},
      visibility: {},
      readVisibility: () => ({}),
      refreshHud: render,
      refreshScheduler: scheduler,
      readHp: () => hp,
      isPlayersTurn: () => turn,
      isCurrentCombatant: () => true
    });
    window.effectsApp = app;
    window.updateCharacterHp = next => {
      hp = { ...hp, ...next };
      window.Hooks.callAll("updateActor", actor, {
        system: { attributes: { hp: next } }
      });
    };
    window.startCharacterTurn = () => {
      turn = true;
      window.Hooks.callAll("updateCombat");
    };
  });
  const root = page.locator(".ws-rolls-dialog");
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "none"
  );
  await page.evaluate(() => {
    window.startCharacterTurn();
    window.updateCharacterHp({ value: 8 });
  });
  await expect(root).toHaveClass(/ws-damage-flash/);
  await expect(root).toHaveCSS("animation-name", "ws-hp-damage");
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "ws-health-normal-change"
  );
  const samples = await page.locator(".ws-health-fill").evaluate(node => {
    const animation = node.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const before = node.getBoundingClientRect().width;
    animation.currentTime = 650;
    const after = node.getBoundingClientRect().width;
    return {
      before,
      after,
      ratio: after / node.parentElement.getBoundingClientRect().width
    };
  });
  expect(samples.before).toBeGreaterThan(samples.after);
  expect(samples.ratio).toBeCloseTo(0.4, 2);
  await page.evaluate(() => window.updateCharacterHp({ value: 16 }));
  await expect(root).toHaveClass(/ws-heal-flash/);
  await expect(root).toHaveCSS("animation-name", "ws-hp-heal");
  const glow = await root.evaluate(node => {
    const animation = node
      .getAnimations()
      .find(animation => animation.animationName === "ws-hp-heal");
    animation.pause();
    animation.currentTime = 500;
    return {
      shadow: getComputedStyle(node).boxShadow,
      outline: getComputedStyle(node).outlineColor
    };
  });
  expect(glow.shadow).not.toBe("none");
  expect(glow.outline).toContain("150, 231, 113");
  await page.evaluate(() => {
    window.effectsApp.applySetting("hpAnimation", "bar");
    window.updateCharacterHp({ value: 10 });
  });
  await expect(root).toHaveAttribute("data-hp-animation", "bar");
  await expect(root).not.toHaveClass(/ws-heal-flash|ws-damage-flash/);
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "ws-health-normal-change"
  );
  await expect
    .poll(() =>
      page
        .locator(".ws-health-button")
        .evaluate(node => getComputedStyle(node, "::after").animationName)
    )
    .toBe("none");
  await page.evaluate(() => {
    window.effectsApp.applySetting("hpAnimation", "off");
    window.updateCharacterHp({ value: 9 });
  });
  await expect(root).not.toHaveClass(/ws-hp-feedback/);
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "none"
  );
  await page.evaluate(() => {
    window.effectsApp.applySetting("hpAnimation", "full");
    window.updateCharacterHp({ value: 8 });
  });
  await expect(root).toHaveClass(/ws-hp-feedback/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).not.toHaveClass(
    /ws-hp-feedback|ws-heal-flash|ws-damage-flash/
  );
  await expect(root).toHaveCSS("animation-name", "none");
  await expect(page.locator(".ws-health-fill")).toHaveCSS(
    "animation-name",
    "none"
  );
  await page.evaluate(() =>
    window.effectsApp.applySetting("showVisualEffects", false)
  );
  await expect(root).not.toHaveClass(
    /ws-hp-feedback|ws-heal-flash|ws-damage-flash|ws-turn-arrival/
  );
  await page.evaluate(() => {
    window.updateCharacterHp({ value: 4 });
    window.effectsApp.disposeHudSession();
  });
  await expect(root).not.toHaveClass(
    /ws-hp-feedback|ws-heal-flash|ws-damage-flash/
  );
});
