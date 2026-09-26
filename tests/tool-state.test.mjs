import assert from "node:assert/strict";
import test from "node:test";

import { createHudToolState } from "../scripts/hud/tool-state.js";
import { createLatestRefresh } from "../scripts/hud/async-refresh.js";

test("tool refresh keeps the latest result when requests finish out of order", async () => {
  const previousGame = globalThis.game;
  const previousFromUuid = globalThis.fromUuid;
  globalThis.game = { i18n: { localize: value => value } };
  globalThis.fromUuid = async () => null;

  const pending = [];
  let loads = 0;
  const adapter = {
    getTools: async () => {
      loads++;
      if (loads === 1) return [{ id: "first", isMusic: false }];
      return new Promise(resolve => pending.push(resolve));
    }
  };
  let refreshes = 0;
  try {
    const { toolState, refreshTools } = await createHudToolState({
      actor: {},
      adapter,
      isRendered: () => true,
      scheduleRefresh: () => refreshes++
    });
    const first = refreshTools();
    const second = refreshTools();
    pending[1]([{ id: "latest", isMusic: true }]);
    await second;
    pending[0]([{ id: "stale", isMusic: false }]);
    await first;

    assert.deepEqual(
      toolState.tools.map(tool => tool.id),
      ["latest"]
    );
    assert.deepEqual(
      toolState.instruments.map(tool => tool.id),
      ["latest"]
    );
    assert.equal(refreshes, 1);
  } finally {
    globalThis.game = previousGame;
    globalThis.fromUuid = previousFromUuid;
  }
});

test("async refresh discards data after session close and remains usable after errors", async () => {
  const pending = [];
  const applied = [];
  const errors = [];
  let current = true;
  const refresh = createLatestRefresh({
    load: () =>
      new Promise((resolve, reject) => pending.push({ resolve, reject })),
    apply: value => applied.push(value),
    isCurrent: () => current,
    onError: error => errors.push(error.message)
  });
  const closed = refresh();
  current = false;
  pending[0].resolve("old actor");
  await closed;
  assert.deepEqual(applied, []);
  current = true;
  const failed = refresh();
  pending[1].reject(new Error("load failed"));
  await failed;
  const recovered = refresh();
  pending[2].resolve("new data");
  await recovered;
  assert.deepEqual(errors, ["load failed"]);
  assert.deepEqual(applied, ["new data"]);
});
