import assert from "node:assert/strict";
import test from "node:test";
import { bindRatMemory } from "../scripts/hud/rat-memory.js";
import { prepareSettingsGroups } from "../scripts/settings-form.js";
import { getConfigureSettingGroups } from "../scripts/settings-schema.js";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hudFixture } from "./helpers/hud.mjs";
import { syncHeaderEditControl } from "../scripts/hud/window/window-controls.js";

restoreGlobalsAfterEach();

for (const stop of [false, true]) {
  test(`clear all forgets the initial records and ${stop ? "stops when the session changes" : "preserves newly arriving memories"}`, async () => {
    installSettings();
    const { document } = installDom();
    const root = document.createElement("div");
    root.innerHTML =
      '<header class="window-header"><button data-action="toggleControls"></button></header>';
    document.body.append(root);
    let records = ["one", "two"].map(id => ({
      id,
      name: id,
      label: "Last position"
    }));
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const calls = [];
    const listeners = new Set();
    let active = true;
    const api = {
      version: 1,
      list: () => records,
      subscribe: fn => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      ping() {},
      center() {},
      async forget(id) {
        calls.push(id);
        if (id === "one") await gate;
        records = records.filter(record => record.id !== id);
        listeners.forEach(fn => fn());
      }
    };
    game.modules = new Map([
      ["probably-just-a-rat", { active: true, api: { memory: api } }]
    ]);
    const binding = bindRatMemory({
      app: { element: root, rendered: true },
      t: key => key,
      isActive: () => active
    });
    const toggle = root.querySelector("[data-rat-memory-toggle]");
    toggle.click();
    assert.equal(root.querySelector('[data-memory-action="close"]'), null);
    assert.ok(
      root
        .querySelector('[data-memory-action="forget"]')
        .classList.contains("fa-eraser")
    );
    root.querySelector('[data-memory-action="clear"]').click();
    assert.equal(
      root.querySelector('[data-memory-action="clear"]').disabled,
      true
    );
    assert.ok(
      [...root.querySelectorAll('[data-memory-action="forget"]')].every(
        button => button.disabled
      )
    );
    records = [
      ...records,
      { id: "new", name: "New memory", label: "Last position" }
    ];
    listeners.forEach(fn => fn());
    root.querySelector('[data-memory-action="clear"]').click();
    if (stop) active = false;
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, stop ? ["one"] : ["one", "two"]);
    assert.ok(records.some(record => record.id === "new"));
    if (!stop) {
      assert.equal(root.querySelectorAll("[data-memory-id]").length, 1);
      toggle.click();
      assert.equal(root.querySelector(".ws-rat-memory"), null);
    }
    binding.dispose();
  });
}

test("live HUD settings remove and restore the header control and close releases the provider", async () => {
  const f = await hudFixture();
  const listeners = new Set();
  const api = {
    version: 1,
    list: () => [],
    subscribe: fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ping() {},
    center() {},
    forget() {}
  };
  game.modules.set("probably-just-a-rat", {
    active: true,
    api: { memory: api }
  });
  await f.api.open(f.actor);
  const app = globalThis.__adventurerHud.app;
  assert.ok(app.element.querySelector("[data-rat-memory-toggle]"));
  await game.settings.set("adventurer-hud", "showRatMemory", false);
  assert.equal(app.element.querySelector("[data-rat-memory-toggle]"), null);
  assert.equal(listeners.size, 0);
  await game.settings.set("adventurer-hud", "showRatMemory", true);
  assert.ok(app.element.querySelector("[data-rat-memory-toggle]"));
  await app.close();
  assert.equal(listeners.size, 0);
});
test("Rat preference appears only for an active module without clearing the saved choice", () => {
  const f = installSettings({ values: { showRatMemory: false } });
  const module = { active: false };
  game.modules = new Map([["probably-just-a-rat", module]]);
  const groups = () =>
    prepareSettingsGroups({
      groups: getConfigureSettingGroups(),
      readValue: key => game.settings.get("adventurer-hud", key),
      t: key => key
    }).flatMap(group => group.settings);
  assert.equal(
    groups().some(setting => setting.key === "showRatMemory"),
    false
  );
  module.active = true;
  assert.equal(
    groups().find(setting => setting.key === "showRatMemory").value,
    false
  );
  module.active = false;
  assert.equal(
    groups().some(setting => setting.key === "showRatMemory"),
    false
  );
  assert.equal(f.writes.length, 0);
});

test("header memory renders safe names, forwards modifiers, updates on notifications and disposes listeners", async () => {
  installSettings();
  const { document } = installDom();
  let records = [
    { id: "one", name: "<img onerror=alert(1)>", label: "Seen round 3" }
  ];
  const listeners = new Set(),
    calls = [];
  const api = {
    version: 1,
    list: () => records,
    subscribe: fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ping: (...args) => calls.push(args),
    center: () => {},
    forget: () => {
      records = [];
      for (const fn of listeners) fn();
    }
  };
  game.modules = new Map([
    ["probably-just-a-rat", { active: true, api: { memory: api } }]
  ]);
  const root = document.createElement("div");
  root.innerHTML =
    '<header class="window-header"><button data-action="toggleControls"></button></header>';
  document.body.append(root);
  const edit = syncHeaderEditControl({
    document,
    header: root.querySelector("header"),
    enabled: true,
    editing: false,
    label: "Edit"
  });
  const editClasses = edit.className;
  const binding = bindRatMemory({
    app: { element: root, rendered: true },
    t: key => key
  });
  assert.equal(listeners.size, 1);
  const toggle = root.querySelector("[data-rat-memory-toggle]");
  assert.ok(toggle);
  assert.equal(toggle.textContent, "");
  assert.ok(toggle.classList.contains("fa-mouse-field"));
  assert.equal(edit.className, editClasses);
  assert.ok(edit.classList.contains("fa-pen-to-square"));
  toggle.click();
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.equal(
    root.querySelector(".ws-rat-memory-record strong").textContent,
    records[0].name
  );
  const ping = root.querySelector('[data-memory-action="ping"]');
  const event = new document.defaultView.Event("click", { bubbles: true });
  event.altKey = true;
  ping.dispatchEvent(event);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls[0][0], "one");
  assert.equal(calls[0][1], event);
  root.querySelector('[data-memory-action="forget"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(
    root.querySelector(".ws-rat-memory").textContent,
    /Memory.Empty/
  );
  assert.equal(toggle.getAttribute("aria-label"), "Memory.Title · 0");
  binding.dispose();
  assert.equal(listeners.size, 0);
  assert.equal(root.querySelector("[data-rat-memory-toggle]"), null);
  assert.equal(root.querySelector(".ws-rat-memory"), null);
});
