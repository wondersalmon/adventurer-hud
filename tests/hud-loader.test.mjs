import assert from "node:assert/strict";
import test from "node:test";
import { createHudLoader } from "../scripts/hud-loader.js";

test("concurrent openings share one import and delegate original arguments to the existing queue", async () => {
  let loads = 0,
    resolve;
  const loaded = new Promise(done => {
    resolve = done;
  });
  const calls = [];
  const open = createHudLoader({
    load: () => {
      loads++;
      return loaded;
    }
  });
  const actor = {},
    navigation = {};
  const first = open(actor, navigation),
    second = open(null);
  await Promise.resolve();
  assert.equal(loads, 1);
  resolve({
    openRollsHud: (...args) => {
      calls.push(args);
      return calls.length;
    }
  });
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.equal(calls[0][0], actor);
  assert.equal(calls[0][1], navigation);
  assert.deepEqual(calls[1], [null]);
  assert.equal(await open(actor), 3);
  assert.equal(loads, 1);
});

test("failed loading is reported and a later open can retry", async () => {
  const failure = new Error("load failed"),
    errors = [];
  let attempts = 0;
  const open = createHudLoader({
    load: async () => {
      if (++attempts === 1) throw failure;
      return { openRollsHud: () => "opened" };
    },
    onError: error => errors.push(error)
  });
  assert.equal(await open(), undefined);
  assert.deepEqual(errors, [failure]);
  assert.equal(await open(), "opened");
  assert.equal(attempts, 2);
});

test("native opening errors keep their rejection and do not discard the loaded module", async () => {
  const failure = new Error("open failed");
  let loads = 0;
  const open = createHudLoader({
    load: async () => {
      loads++;
      return {
        openRollsHud: () => {
          throw failure;
        }
      };
    },
    onError: () => assert.fail("Not an import failure")
  });
  await assert.rejects(open(), error => error === failure);
  await assert.rejects(open(), error => error === failure);
  assert.equal(loads, 1);
});
