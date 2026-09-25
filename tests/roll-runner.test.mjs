import assert from "node:assert/strict";
import test from "node:test";

import { createHudRollRunner } from "../scripts/hud/roll-runner.js";

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
