import assert from "node:assert/strict";
import test from "node:test";

import { createHudRollRunner } from "../scripts/hud/roll-runner.js";
import { createActionCooldown } from "../scripts/hud/action-cooldown.js";
import {
  installDom,
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

for (const outcome of ["success", "cancelled", "error"]) {
  test(`busy controls survive replacement and preserve native disabled states after ${outcome}`, async () => {
    installSettings();
    const { document } = installDom();
    const root = document.createElement("section");
    root.innerHTML =
      '<header class="window-header"><span class="window-title">HUD</span></header><main></main>';
    const replace = () => {
      root.querySelector("main").innerHTML =
        '<button data-action="useitem">Use</button><button data-action="useitem" disabled>Unavailable</button>';
    };
    replace();
    let resolve, reject;
    const runner = createHudRollRunner({
      getApp: () => ({ element: root, rendered: true }),
      refreshHud() {},
      refreshScheduler: { cancel() {} },
      canStartMutation: () => true,
      t: key => key
    });
    const operation = runner.performRoll(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    const completed =
      outcome === "error"
        ? assert.rejects(operation, /cancelled by system/)
        : operation;
    replace();
    runner.syncControls();
    assert.ok(
      [...root.querySelectorAll("button")].every(button => button.disabled)
    );
    assert.equal(root.getAttribute("aria-busy"), "true");
    assert.equal(
      root.querySelector("[data-hud-action-feedback]").textContent,
      "Actions.Pending"
    );
    let duplicate = false;
    await runner.performRoll(() => {
      duplicate = true;
    });
    assert.equal(duplicate, false);
    if (outcome === "error") reject(new Error("cancelled by system"));
    else resolve(outcome === "cancelled" ? null : true);
    await completed;
    assert.deepEqual(
      [...root.querySelectorAll("button")].map(button => button.disabled),
      [false, true]
    );
    assert.equal(root.querySelector("[data-hud-action-feedback]"), null);
    assert.equal(root.hasAttribute("aria-busy"), false);
    runner.dispose();
  });
}

test("overlapping actor and scene runners retain a shared lock until both finish", async () => {
  installSettings();
  const { document } = installDom();
  const root = document.createElement("section");
  root.innerHTML =
    '<header class="window-header"></header><button data-action="gmhidden">Hide</button>';
  const create = () =>
    createHudRollRunner({
      getApp: () => ({ element: root, rendered: true }),
      refreshHud() {},
      refreshScheduler: { cancel() {} },
      canStartMutation: () => true
    });
  const actor = create(),
    scene = create();
  let endActor, endScene;
  const first = actor.performRoll(
    () =>
      new Promise(resolve => {
        endActor = resolve;
      })
  );
  const second = scene.performRoll(
    () =>
      new Promise(resolve => {
        endScene = resolve;
      })
  );
  endActor();
  await first;
  assert.equal(root.querySelector("button").disabled, true);
  assert.equal(root.getAttribute("aria-busy"), "true");
  endScene();
  await second;
  assert.equal(root.querySelector("button").disabled, false);
  actor.dispose();
  scene.dispose();
});

test("cooldown feedback explains rejected clicks and disposal clears its timer and label", async () => {
  installSettings();
  const { document } = installDom();
  const root = document.createElement("section");
  root.innerHTML = '<header class="window-header"></header>';
  let time = 0,
    calls = 0;
  const runner = createHudRollRunner({
    getApp: () => ({ element: root, rendered: true }),
    refreshHud() {},
    refreshScheduler: { cancel() {} },
    canStartMutation: createActionCooldown({ now: () => time })
  });
  await runner.performRoll(() => ++calls);
  assert.equal(
    root.querySelector("[data-hud-action-feedback]").textContent,
    "Actions.Cooldown"
  );
  await runner.performRoll(() => ++calls);
  assert.equal(calls, 1);
  time = 666;
  runner.syncControls();
  assert.equal(root.querySelector("[data-hud-action-feedback]"), null);
  await runner.performRoll(() => ++calls);
  runner.dispose();
  assert.equal(root.querySelector("[data-hud-action-feedback]"), null);
  await runner.performRoll(() => ++calls);
  assert.equal(calls, 2);
});

test("roll runner blocks overlapping actions and refreshes after completion", async () => {
  const buttons = [{ disabled: false }, { disabled: false }];
  const app = {
    rendered: true,
    element: { querySelectorAll: () => buttons }
  };
  let resolveFirst;
  let cancelCount = 0;
  let refreshCount = 0;
  const runner = createHudRollRunner({
    getApp: () => app,
    refreshHud: () => {
      refreshCount++;
      buttons.forEach(button => {
        button.disabled = false;
      });
    },
    refreshScheduler: { cancel: () => cancelCount++ }
  });

  const first = runner.performRoll(
    () => new Promise(resolve => (resolveFirst = resolve))
  );
  assert.equal(
    buttons.every(button => button.disabled),
    true
  );
  let secondRan = false;
  await runner.performAndRefresh(() => {
    secondRan = true;
  });
  assert.equal(secondRan, false);

  resolveFirst("done");
  assert.equal(await first, "done");
  assert.equal(cancelCount, 1);
  assert.equal(refreshCount, 1);
  assert.equal(
    buttons.every(button => !button.disabled),
    true
  );
});

test("roll runner refreshes after a rejected native action", async () => {
  let refreshed = 0;
  const runner = createHudRollRunner({
    getApp: () => ({
      rendered: true,
      element: { querySelectorAll: () => [] }
    }),
    refreshHud: () => refreshed++,
    refreshScheduler: { cancel: () => {} }
  });

  await assert.rejects(
    runner.performRoll(() => Promise.reject(new Error("native failure"))),
    /native failure/
  );
  assert.equal(refreshed, 1);
});

for (const outcome of ["success", "cancelled", "failure"]) {
  test(`roll controls recover after ${outcome} when unchanged markup skips rendering`, async () => {
    const buttons = [{ disabled: false }, { disabled: true }];
    const runner = createHudRollRunner({
      getApp: () => ({
        rendered: true,
        element: { querySelectorAll: () => buttons }
      }),
      refreshHud() {},
      refreshScheduler: { cancel() {} },
      canStartMutation: () => true
    });
    const perform = () =>
      runner.performRoll(async () => {
        assert.equal(buttons[0].disabled, true);
        assert.equal(buttons[1].disabled, true);
        if (outcome === "failure") throw new Error("native failure");
        return outcome === "cancelled" ? null : "done";
      });
    if (outcome === "failure") await assert.rejects(perform, /native failure/);
    else await perform();
    assert.equal(buttons[0].disabled, false);
    assert.equal(buttons[1].disabled, true);
    await runner.performRoll(() => "next roll");
    assert.equal(buttons[0].disabled, false);
    assert.equal(buttons[1].disabled, true);
  });
}

test("cooldown blocks sequential actions of different types until the configured interval, including after failure", async () => {
  const { createActionCooldown, ACTION_COOLDOWN_MS } =
    await import("../scripts/hud/action-cooldown.js");
  let time = 0,
    count = 0;
  const runner = createHudRollRunner({
    getApp: () => null,
    refreshHud: () => {},
    refreshScheduler: { cancel() {} },
    canStartMutation: createActionCooldown({ now: () => time })
  });
  await runner.performRoll(() => ++count);
  time = ACTION_COOLDOWN_MS - 1;
  await runner.performAndRefresh(() => ++count);
  assert.equal(count, 1);
  time = ACTION_COOLDOWN_MS;
  await assert.rejects(
    runner.performAndRefresh(() => {
      count++;
      throw Error("failed");
    }),
    /failed/
  );
  await runner.performRoll(() => ++count);
  assert.equal(count, 2);
  time = ACTION_COOLDOWN_MS * 2;
  await runner.performRoll(() => ++count);
  assert.equal(count, 3);
});
