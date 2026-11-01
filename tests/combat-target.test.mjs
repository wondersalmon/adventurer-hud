import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { setSetting } from "../scripts/settings-access.js";
import {
  settingsBackup,
  settingsBackupEntries
} from "../scripts/settings-backup.js";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { itemCollection, fragment, escapeHTML } from "./helpers/rendering.mjs";
import { renderHudTarget } from "../scripts/hud/target.js";

restoreGlobalsAfterEach();

async function targetFixture(values = {}) {
  const f = await hudFixture({
    values: {
      language: "en",
      playerFooter: true,
      showModeNavigation: true,
      ...values
    }
  });
  const scene = { id: "scene", grid: { units: "ft" } };
  const calls = [];
  const makeToken = (id, name, x = 0) => {
    const document = {
      id,
      uuid: `Scene.scene.Token.${id}`,
      parent: scene,
      name,
      x,
      getCenterPoint() {
        return { x: this.x, y: 50, elevation: 0 };
      }
    };
    return { id, document, name, visible: true, isVisible: true };
  };
  const source = makeToken("hero-token", "Hero");
  source.document.actor = f.actor;
  const target = makeToken("enemy", 'Goblin <b> & "scout"', 600);
  const other = makeToken("other", "Another target", 900);
  scene.tokens = itemCollection([
    source.document,
    target.document,
    other.document
  ]);
  canvas.scene = scene;
  canvas.ready = true;
  const toolListeners = new Set();
  ui.controls = {
    render() {},
    control: { name: "tokens" },
    tool: { name: "select" },
    async activate(options) {
      calls.push(["activate", options]);
      this.control = { name: options.control };
      this.tool = { name: options.tool };
      for (const listener of [...toolListeners]) listener();
    },
    addEventListener: (_name, listener) => toolListeners.add(listener),
    removeEventListener: (_name, listener) => toolListeners.delete(listener)
  };
  canvas.grid = {
    measurePath(points) {
      calls.push(["measure", points]);
      return { distance: Math.abs(points[1].x - points[0].x) / 20 };
    }
  };
  canvas.tokens = {
    controlled: [source],
    get: id =>
      ({ [source.id]: source, [target.id]: target, [other.id]: other })[id],
    setTargets: (ids, options) => {
      calls.push(["targets", ids, options]);
      if (options.mode === "replace") {
        game.user.targets.clear();
        return;
      }
      for (const token of game.user.targets) {
        if (ids.includes(token.id)) game.user.targets.delete(token);
      }
    }
  };
  game.user.targets = new Set([target]);
  return { ...f, scene, source, target, other, calls, toolListeners };
}

test("combat target delegates native targeting, preserves other targets and leaves exploration history available", async () => {
  const f = await targetFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.ok(app.element.querySelector(".ws-footer-recent"));
  assert.equal(app.element.querySelector(".ws-footer-target"), null);
  await app.hudActions.combatmode();
  assert.equal(app.element.querySelector(".ws-footer-recent"), null);
  assert.equal(
    app.element.querySelector(".ws-target-name").textContent,
    f.target.name
  );
  assert.equal(app.element.querySelector(".ws-target-name b"), null);
  assert.equal(
    app.element.querySelector(".ws-target-distance").textContent,
    "30 ft"
  );
  await app.hudActions.selecttarget();
  assert.deepEqual(f.calls.at(-1), [
    "activate",
    { control: "tokens", tool: "target", event: undefined }
  ]);
  game.user.targets.add(f.other);
  f.hooks.callAll("targetToken", game.user, f.other, true);
  f.flushFrames();
  assert.equal(app.element.querySelector(".ws-target-count").textContent, "+1");
  assert.equal(
    app.element.querySelector(".ws-target-content > .ws-target-distance"),
    null
  );
  assert.deepEqual(
    [...app.element.querySelectorAll(".ws-target-row .ws-target-distance")].map(
      node => node.textContent
    ),
    ["30 ft", "45 ft"]
  );
  const stale = app.element.querySelector(
    ".ws-target-content > .ws-target-clear"
  );
  await app.hudActions.cleartarget(null, stale);
  assert.deepEqual(
    f.calls.find(call => call[0] === "targets"),
    ["targets", [f.target.id], { mode: "release" }]
  );
  assert.deepEqual([...game.user.targets], [f.other]);
  assert.equal(
    app.element.querySelector(".ws-target-name").textContent,
    f.other.name
  );
  const before = f.calls.filter(call => call[0] === "targets").length;
  await app.hudActions.cleartarget(null, stale);
  assert.equal(f.calls.filter(call => call[0] === "targets").length, before);
  await app.hudActions.normal();
  assert.ok(app.element.querySelector(".ws-footer-recent"));
  assert.equal(app.element.querySelector(".ws-footer-target"), null);
  const count = f.calls.length;
  await app.hudActions.selecttarget();
  await app.hudActions.cleartarget(null, {
    dataset: { targetUuid: f.other.document.uuid }
  });
  assert.equal(f.calls.length, count);
  await app.close();
});

test("target hooks update names, distance, visibility and scene state and release listeners on close", async () => {
  const f = await targetFixture();
  const initialListeners = f.callbacks.size;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.combatmode();
  f.target.document.x = 800;
  f.hooks.callAll("updateToken", f.target.document, { x: 800 });
  f.flushFrames();
  assert.equal(
    app.element.querySelector(".ws-target-distance").textContent,
    "40 ft"
  );
  f.source.document.x = 200;
  f.hooks.callAll("updateToken", f.source.document, { x: 200 });
  f.flushFrames();
  assert.equal(
    app.element.querySelector(".ws-target-distance").textContent,
    "30 ft"
  );
  f.target.name = "Renamed enemy";
  f.hooks.callAll("updateToken", f.target.document, { name: f.target.name });
  f.flushFrames();
  assert.equal(
    app.element.querySelector(".ws-target-name").textContent,
    f.target.name
  );
  f.target.isVisible = false;
  f.hooks.callAll("refreshToken", f.target, { refreshVisibility: true });
  f.flushFrames();
  assert.equal(app.element.querySelector(".ws-target-clear"), null);
  assert.equal(app.element.querySelector(".ws-target-distance"), null);
  assert.doesNotMatch(
    app.element.querySelector(".ws-footer-target").outerHTML,
    /Renamed enemy/
  );
  f.target.isVisible = true;
  f.hooks.callAll("refreshToken", f.target, {});
  f.flushFrames();
  assert.ok(app.element.querySelector(".ws-target-clear"));
  canvas.ready = false;
  f.hooks.callAll("canvasTearDown");
  f.flushFrames();
  assert.equal(app.element.querySelector(".ws-target-select").disabled, true);
  await app.close();
  assert.equal(f.callbacks.size, initialListeners);
  const calls = f.calls.length;
  f.hooks.callAll("targetToken", game.user, f.target, true);
  await app.hudActions.selecttarget();
  assert.equal(f.calls.length, calls);
});

test("target rendering excludes stale, hidden and off-scene tokens and omits ambiguous source distances", async () => {
  const f = await targetFixture();
  const render = () =>
    fragment(
      renderHudTarget({
        actorContext: { actor: f.actor },
        t: key => key,
        escapeHTML
      })
    );
  assert.ok(render().querySelector(".ws-target-distance"));
  for (const invalid of [
    { ...f.target, document: { ...f.target.document } },
    { ...f.target, isVisible: false },
    { ...f.target, document: { ...f.target.document, parent: { id: "other" } } }
  ]) {
    game.user.targets = new Set([invalid]);
    assert.equal(render().querySelector(".ws-target-clear"), null);
  }
  game.user.targets = new Set([f.target]);
  f.target.document.hidden = true;
  assert.equal(render().querySelector(".ws-target-clear"), null);
  f.target.document.hidden = false;
  f.other.document.actor = f.actor;
  canvas.tokens.controlled = [];
  assert.equal(render().querySelector(".ws-target-distance"), null);
  const exact = fragment(
    renderHudTarget({
      actorContext: { actor: f.actor, token: f.source.document },
      t: key => key,
      escapeHTML
    })
  );
  assert.ok(exact.querySelector(".ws-target-distance"));
  f.source.document.actor = { ...f.actor, isToken: true };
  assert.equal(
    fragment(
      renderHudTarget({
        actorContext: { actor: f.actor, token: f.source.document },
        t: key => key,
        escapeHTML
      })
    ).querySelector(".ws-target-distance"),
    null
  );
});

test("target block retains released combat center-slot placement and its target label", async () => {
  const f = await targetFixture({
    panelStates: {
      "Actor.hero": {
        hudLayouts: { "combat:info": { order: ["recent-actions"], hidden: [] } }
      }
    }
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.combatmode();
  const target = app.element.querySelector(
    '.ws-footer-target[data-hud-block="recent-actions"]'
  );
  assert.equal(target.parentElement.dataset.hudLane, "info");
  assert.equal(target.dataset.hudLabel, "Target");
  await app.close();
});

test("toolbar center preferences switch live and independently in both modes and round-trip backups", async () => {
  const f = await targetFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const settings = await new (f.menus.get(
    "configure"
  ).type)()._prepareContext();
  const fields = settings.groups.flatMap(group => group.settings);
  for (const key of ["explorationFooterMode", "combatFooterMode"]) {
    assert.equal(f.registrations.get(key).scope, "user");
    assert.equal(fields.filter(field => field.key === key).length, 1);
    assert.equal(fields.find(field => field.key === key).isSelect, true);
    assert.ok(
      settings.groups
        .find(group => group.id === "panelSections")
        ?.settings.some(field => field.key === key)
    );
    assert.deepEqual(Object.keys(f.registrations.get(key).choices), [
      "recent",
      "target",
      "none"
    ]);
  }
  assert.equal(f.registrations.get("explorationFooterMode").default, "recent");
  assert.equal(f.registrations.get("combatFooterMode").default, "target");
  for (const [mode, setting] of [
    ["regular", "explorationFooterMode"],
    ["combat", "combatFooterMode"]
  ]) {
    if (mode === "combat") await app.hudActions.combatmode();
    for (const [value, selector] of [
      ["target", ".ws-footer-target"],
      ["recent", ".ws-footer-recent"],
      ["none", ".ws-footer-empty"]
    ]) {
      await setSetting(setting, value);
      await waitFor(() => app.element.querySelector(selector));
      assert.equal(app.element.querySelectorAll(selector).length, 1);
      assert.equal(
        app.element.querySelectorAll('[data-hud-block="recent-actions"]')
          .length,
        1
      );
    }
  }
  await setSetting("explorationFooterMode", "target");
  await waitFor(() => app.element.querySelector(".ws-footer-empty"));
  await app.hudActions.normal();
  assert.ok(app.element.querySelector(".ws-footer-target"));
  await app.hudActions.selecttarget();
  assert.deepEqual(f.calls.at(-1), [
    "activate",
    { control: "tokens", tool: "target", event: undefined }
  ]);
  f.target.document.x = 1000;
  f.hooks.callAll("updateToken", f.target.document, { x: 1000 });
  f.flushFrames();
  assert.equal(
    app.element.querySelector(".ws-target-distance").textContent,
    "50 ft"
  );
  const backup = await settingsBackup();
  const restored = new Map(settingsBackupEntries(JSON.stringify(backup)));
  assert.equal(restored.get("explorationFooterMode"), "target");
  assert.equal(restored.get("combatFooterMode"), "none");
  await app.close();
  await f.api.open(f.actor);
  assert.ok(__adventurerHud.app.element.querySelector(".ws-footer-target"));
  await __adventurerHud.app.close();
});

test("HUD targeting restores the previous native control and tool after selecting a target", async () => {
  const f = await targetFixture({ explorationFooterMode: "target" });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await ui.controls.activate({ control: "templates", tool: "circle" });
  const event = { type: "click", shiftKey: true };
  const baseline = f.callbacks.size;
  await app.hudActions.selecttarget(event);
  assert.deepEqual(f.calls.at(-1), [
    "activate",
    { control: "tokens", tool: "target", event }
  ]);
  await app.hudActions.selecttarget(event);
  f.hooks.callAll("targetToken", {}, f.other, true);
  f.hooks.callAll("targetToken", game.user, f.target, false);
  await Promise.resolve();
  assert.equal(ui.controls.tool.name, "target");
  f.hooks.callAll("targetToken", game.user, f.other, true);
  await waitFor(() => ui.controls.tool.name === "circle");
  assert.equal(ui.controls.control.name, "templates");
  assert.equal(f.callbacks.size, baseline);
  assert.equal(f.toolListeners.size, 0);
  const count = f.calls.filter(call => call[0] === "activate").length;
  f.hooks.callAll("targetToken", game.user, f.target, true);
  await Promise.resolve();
  assert.equal(f.calls.filter(call => call[0] === "activate").length, count);
  await app.close();
});

test("toolbar content choices depend on the toolbar and retain separate mode preferences", async () => {
  const f = await targetFixture({
    playerFooter: false,
    explorationFooterMode: "target",
    combatFooterMode: "recent"
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const fields = async () =>
    (
      await new (f.menus.get("configure").type)()._prepareContext()
    ).groups.flatMap(group => group.settings);
  const disabled = await fields();
  for (const key of ["explorationFooterMode", "combatFooterMode"]) {
    const field = disabled.find(value => value.key === key);
    assert.equal(field.disabled, true);
    assert.equal(field.parentKey, "playerFooter");
  }
  assert.ok(!app.element.querySelector(".ws-player-footer"));
  const calls = f.calls.length;
  await app.hudActions.selecttarget();
  assert.equal(f.calls.length, calls);
  await setSetting("playerFooter", true);
  await waitFor(() => app.element.querySelector(".ws-footer-target"));
  for (const key of ["explorationFooterMode", "combatFooterMode"])
    assert.equal(
      (await fields()).find(value => value.key === key).disabled,
      false
    );
  await app.hudActions.combatmode();
  assert.ok(app.element.querySelector(".ws-footer-recent"));
  await setSetting("playerFooter", false);
  await waitFor(() => !app.element.querySelector(".ws-player-footer"));
  await setSetting("playerFooter", true);
  await waitFor(() => app.element.querySelector(".ws-footer-recent"));
  assert.equal(f.current.get("explorationFooterMode"), "target");
  assert.equal(f.current.get("combatFooterMode"), "recent");
  await app.close();
});

test("removed toolbar modes fall back to mode defaults without rewriting saved settings", async () => {
  const f = await targetFixture({
    explorationFooterMode: "checks",
    combatFooterMode: "checks"
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  assert.ok(app.element.querySelector(".ws-footer-recent"));
  await app.hudActions.combatmode();
  assert.ok(app.element.querySelector(".ws-footer-target"));
  assert.equal(f.current.get("explorationFooterMode"), "checks");
  const backup = await settingsBackup();
  backup.settings.explorationFooterMode = "checks";
  backup.settings.combatFooterMode = "checks";
  const normalized = new Map(settingsBackupEntries(JSON.stringify(backup)));
  assert.equal(normalized.get("explorationFooterMode"), "recent");
  assert.equal(normalized.get("combatFooterMode"), "target");
  await app.close();
});

test("manual tool changes, scene teardown and session disposal cancel HUD targeting restoration", async () => {
  const f = await targetFixture({ explorationFooterMode: "target" });
  const initial = f.callbacks.size;
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const baseline = f.callbacks.size;
  await app.hudActions.selecttarget();
  await ui.controls.activate({ control: "tokens", tool: "ruler" });
  f.hooks.callAll("targetToken", game.user, f.target, true);
  await Promise.resolve();
  assert.equal(ui.controls.tool.name, "ruler");
  assert.equal(f.callbacks.size, baseline);
  await app.hudActions.selecttarget();
  f.hooks.callAll("canvasTearDown");
  assert.equal(f.callbacks.size, baseline);
  assert.equal(f.toolListeners.size, 0);
  await app.hudActions.selecttarget();
  await app.close();
  assert.equal(f.callbacks.size, initial);
  assert.equal(f.toolListeners.size, 0);
  const calls = f.calls.length;
  f.hooks.callAll("targetToken", game.user, f.target, true);
  await Promise.resolve();
  assert.equal(f.calls.length, calls);
});

test("Escape cancels a HUD targeting gesture, restores the previous tool and keeps the HUD open", async () => {
  const f = await targetFixture({ explorationFooterMode: "target" });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const baseline = f.callbacks.size;
  await ui.controls.activate({ control: "tokens", tool: "ruler" });
  await app.hudActions.selecttarget();
  let propagated = 0;
  const listener = () => propagated++;
  document.addEventListener("keydown", listener);
  const event = new document.defaultView.Event("keydown", {
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(event, "key", { value: "Escape" });
  document.dispatchEvent(event);
  await waitFor(() => ui.controls.tool.name === "ruler");
  assert.equal(propagated, 0);
  assert.equal(app.rendered, true);
  assert.equal(f.callbacks.size, baseline);
  assert.deepEqual([...game.user.targets], [f.target]);
  const subsequent = new document.defaultView.Event("keydown", {
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(subsequent, "key", { value: "Escape" });
  document.dispatchEvent(subsequent);
  assert.equal(propagated, 1);
  document.removeEventListener("keydown", listener);
  await app.close();
});

test("target list updates distances, retains expansion and removes individual or all native targets", async () => {
  const f = await targetFixture({ explorationFooterMode: "target" });
  game.user.targets.add(f.other);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  app.element.querySelector(".ws-target-list").open = true;
  f.other.document.x = 1200;
  f.hooks.callAll("updateToken", f.other.document, { x: 1200 });
  f.flushFrames();
  assert.equal(app.element.querySelector(".ws-target-list").open, true);
  assert.deepEqual(
    [...app.element.querySelectorAll(".ws-target-row .ws-target-distance")].map(
      node => node.textContent
    ),
    ["30 ft", "60 ft"]
  );
  await app.hudActions.cleartarget(
    null,
    app.element.querySelector(
      `.ws-target-row [data-target-uuid="${f.other.document.uuid}"]`
    )
  );
  assert.deepEqual([...game.user.targets], [f.target]);
  game.user.targets.add(f.other);
  f.hooks.callAll("targetToken", game.user, f.other, true);
  f.flushFrames();
  await app.hudActions.cleartargets();
  assert.deepEqual(
    f.calls.find(call => call[0] === "targets" && call[2].mode === "replace"),
    ["targets", [], { mode: "replace" }]
  );
  assert.equal(game.user.targets.size, 0);
  assert.equal(app.element.querySelectorAll(".ws-target-row").length, 0);
  await app.close();
});
