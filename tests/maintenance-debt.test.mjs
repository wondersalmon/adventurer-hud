import test from "node:test";
import assert from "node:assert/strict";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { restoreSettingsBackup } from "../scripts/settings-backup.js";
import {
  saveChangedSettings,
  SettingsSaveError
} from "../scripts/settings-access.js";
import { createHudState } from "../scripts/hud/state.js";
import {
  itemLayoutKey,
  pruneItemLayouts
} from "../scripts/hud/items/item-layout.js";

restoreGlobalsAfterEach();
const backup = settings =>
  JSON.stringify({ module: "adventurer-hud", format: 1, settings });

test("backup failure after a native write rolls back before the next queued save", async () => {
  const hooks = [];
  const f = installSettings({
    onEvent: (name, changes) => hooks.push([name, changes])
  });
  const write = game.settings.set;
  let release, started;
  const blocked = new Promise(resolve => (release = resolve));
  const reached = new Promise(resolve => (started = resolve));
  let failed = false;
  game.settings.set = async (module, key, value) => {
    if (key === "showSearch" && !failed) {
      started();
      await blocked;
    }
    if (key === "fontSize" && value === "medium") {
      assert.equal(f.current.get("fontSize"), "large");
      assert.equal(f.current.get("showSearch"), true);
      assert.equal(
        hooks.filter(([name]) => name === "adventurerHudSettingsChanged")
          .length,
        0
      );
    }
    await write(module, key, value);
    if (key === "showSearch" && !failed) {
      failed = true;
      throw new Error("storage failed after write");
    }
  };
  const restore = restoreSettingsBackup(
    backup({ fontSize: "small", showSearch: false })
  );
  const rejected = assert.rejects(
    restore,
    error =>
      error instanceof SettingsSaveError &&
      error.rollbackFailedKeys.length === 0
  );
  await reached;
  const next = saveChangedSettings([["fontSize", "medium"]]);
  release();
  await Promise.all([rejected, next]);
  assert.equal(f.current.get("fontSize"), "medium");
});

for (const concurrent of [false, true]) {
  test(`backup reports partial recovery and ${concurrent ? "preserves a newer external preference" : "notifies the actual remaining value"}`, async () => {
    const events = [];
    const f = installSettings({
      onEvent: (name, changes) => {
        if (name === "adventurerHudSettingsChanged") events.push(changes);
      }
    });
    const write = game.settings.set;
    game.settings.set = async (module, key, value) => {
      if (key === "showSearch") {
        if (concurrent) f.current.set("fontSize", "medium");
        throw new Error("write denied");
      }
      if (key === "fontSize" && value === "large")
        throw new Error("rollback denied");
      return write(module, key, value);
    };
    await assert.rejects(
      restoreSettingsBackup(backup({ fontSize: "small", showSearch: false })),
      error =>
        error instanceof SettingsSaveError &&
        error.rollbackFailedKeys.join() === "fontSize"
    );
    assert.equal(f.current.get("fontSize"), concurrent ? "medium" : "small");
    assert.equal(
      events.at(-1).get("fontSize"),
      concurrent ? "medium" : "small"
    );
    assert.equal(f.current.get("showSearch"), true);
  });
}

for (const partial of [false, true]) {
  test(`troubleshooting distinguishes ${partial ? "incomplete" : "complete"} rollback from an invalid backup`, async t => {
    t.mock.method(console, "warn", () => {});
    const f = installSettings();
    const write = game.settings.set;
    game.settings.set = async (module, key, value) => {
      if (
        key === "showSearch" ||
        (partial && key === "fontSize" && value === "large")
      )
        throw new Error("write denied");
      return write(module, key, value);
    };
    foundry.applications.api.DialogV2 = {
      prompt: async () => backup({ fontSize: "small", showSearch: false })
    };
    await f.menus
      .get("troubleshooting")
      .type.DEFAULT_OPTIONS.actions.restoresettings.call({
        t: key => key,
        render: async () => {}
      });
    assert.deepEqual(f.notifications, [
      [
        "warn",
        partial
          ? "Troubleshooting.RestorePartial"
          : "Troubleshooting.RestoreRolledBack"
      ]
    ]);
  });
}

test("cleanup removes deleted items/activities across all scopes, without pruning filtered or unavailable entries", () => {
  const a = itemLayoutKey({ id: "a" }),
    b = itemLayoutKey({ id: "b" }),
    deleted = itemLayoutKey({ id: "gone" }),
    activity = itemLayoutKey({ id: "a" }, "disabled"),
    removedActivity = itemLayoutKey({ id: "a" }, "gone");
  const state = createHudState({
    itemLayouts: {
      "combat:action": { order: [deleted, b, a], hidden: [b] },
      "combat:bonus": {
        order: [activity, removedActivity],
        hidden: [activity]
      },
      "spells:1": { order: [deleted], hidden: [deleted] }
    }
  });
  assert.equal(
    pruneItemLayouts(state, [
      { id: "a", activityIds: ["disabled"] },
      { id: "b", activityIds: [] }
    ]),
    true
  );
  assert.deepEqual(state.itemLayouts, {
    "combat:action": { order: [b, a], hidden: [b] },
    "combat:bonus": { order: [activity], hidden: [activity] }
  });
  assert.equal(
    pruneItemLayouts(state, [
      { id: "a", activityIds: ["disabled"] },
      { id: "b", activityIds: [] }
    ]),
    false
  );
});

test("opening and refreshing a real HUD saves cleanup against its full Actor inventory", async () => {
  const f = await hudFixture();
  const keep = itemLayoutKey({ id: "owned" }),
    missing = itemLayoutKey({ id: "deleted" });
  f.actor.items.set("owned", {
    id: "owned",
    name: "Owned item",
    type: "loot",
    system: {}
  });
  f.current.set("panelStates", {
    [f.actor.uuid]: {
      itemLayouts: {
        "combat:action": { order: [missing, keep], hidden: [keep] }
      }
    }
  });
  await f.api.open(f.actor);
  await waitFor(
    () =>
      f.current.get("panelStates")[f.actor.uuid].itemLayouts["combat:action"]
        .order.length === 1
  );
  assert.deepEqual(
    f.current.get("panelStates")[f.actor.uuid].itemLayouts["combat:action"]
      .hidden,
    [keep]
  );
  const app = __adventurerHud.app;
  f.actor.items.delete("owned");
  await app.hudActions.togglefavorites();
  f.flushFrames();
  await waitFor(() => !f.current.get("panelStates")[f.actor.uuid].itemLayouts);
  await app.close();
});
