import assert from "node:assert/strict";
import test from "node:test";

import { createHudToolState } from "../scripts/hud/tool-state.js";

test("tool refresh keeps the latest result when requests finish out of order", async () => {
  const previousGame = globalThis.game;
  const previousFromUuid = globalThis.fromUuid;
  globalThis.game = { i18n: { localize: value => value } };
  globalThis.fromUuid = async () => null;

  const pending = [];
  let loads = 0;
  const adapter = {
    capabilities: { tools: true },
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
      cache: new Map(),
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
