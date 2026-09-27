import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { hudFixture } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();

test("supported worlds register public API and GM hotkeys enforce role, mode and window state", async () => {
  const fixture = await hudFixture({ isGM: true });
  const bindings = fixture.keybindings;
  assert.equal(typeof game.modules.get("adventurer-hud").api.open, "function");
  assert.equal(bindings.get("openHud").restricted, false);
  const calls = [];
  const app = {
    rendered: true,
    hudActions: {
      gmprevious: () => calls.push("previous"),
      gmnext: () => calls.push("next"),
      endturn: () => calls.push("end")
    }
  };
  globalThis.__adventurerHud = { preset: "gm", app };
  for (const name of ["gmPreviousTurn", "gmNextTurn", "gmEndTurn"]) {
    const binding = bindings.get(name);
    assert.equal(binding.restricted, true);
    assert.equal(binding.repeat, false);
    game.user.isGM = false;
    assert.equal(binding.onDown(), false);
    game.user.isGM = true;
    __adventurerHud.preset = "player";
    assert.equal(binding.onDown(), false);
    __adventurerHud.preset = "gm";
    app.rendered = false;
    assert.equal(binding.onDown(), false);
    app.rendered = true;
    assert.equal(binding.onDown(), true);
  }
  assert.deepEqual(calls, ["previous", "next", "end"]);
  app.hudActions = {};
  assert.equal(bindings.get("gmEndTurn").onDown(), false);
  let closed = 0;
  app.close = () => closed++;
  assert.equal(bindings.get("openHud").onDown(), true);
  assert.equal(closed, 1);
});

for (const isGM of [false, true]) {
  test(`scene HUD control follows visibility and uses the ${isGM ? "GM" : "player"} action`, async () => {
    const fixture = await hudFixture({
      isGM,
      values: { showTokenControl: true, gmEnabled: false }
    });
    let closed = 0;
    globalThis.__adventurerHud = {
      app: { rendered: true, close: () => closed++ }
    };
    const controls = { tokens: { tools: { select: {} } } };
    fixture.hooks.callAll("getSceneControlButtons", controls);
    const control =
      controls.tokens.tools[isGM ? "adventurerGmHud" : "adventurerHud"];
    assert.equal(control.active, true);
    assert.equal(control.order, 1);
    assert.match(control.title, /Hide$/);
    assert.equal(
      control.icon,
      isGM ? "fa-solid fa-dragon" : "fa-solid fa-dice-d20"
    );
    await control.onChange();
    assert.equal(closed, 1);
    assert.equal(game.settings.get("adventurer-hud", "gmEnabled"), isGM);
    __adventurerHud.app.rendered = false;
    fixture.hooks.callAll("getSceneControlButtons", controls);
    assert.match(controls.tokens.tools[control.name].title, /Show$/);
    await game.settings.set("adventurer-hud", "showTokenControl", false);
    const hidden = { tokens: { tools: {} } };
    fixture.hooks.callAll("getSceneControlButtons", hidden);
    assert.deepEqual(hidden.tokens.tools, {});
    let refreshed;
    ui.controls = {
      render: options => {
        refreshed = options;
      }
    };
    fixture.hooks.callAll("adventurerHudVisibilityChanged");
    assert.deepEqual(refreshed, { force: true, reset: true });
  });
}
test("unsupported worlds expose only manual open and register no controls or settings", async t => {
  t.mock.method(console, "error", () => {});
  const fixture = await hudFixture();
  game.system.id = "unsupported";
  const registrations = [];
  game.settings.register = (...args) => registrations.push(args);
  game.settings.registerMenu = (...args) => registrations.push(args);
  game.settings.get = () => {
    throw Error("Unregistered setting read");
  };
  game.keybindings.register = (...args) => registrations.push(args);
  await import("../scripts/adventurer-hud.js?unsupported");
  fixture.hooks.callAll("init");
  fixture.hooks.callAll("ready");
  const controls = { tokens: { tools: {} } };
  fixture.hooks.callAll("getSceneControlButtons", controls);
  fixture.hooks.callAll("controlToken");
  fixture.hooks.callAll("renderSettingsConfig", {}, null);
  assert.deepEqual(registrations, []);
  assert.deepEqual(controls.tokens.tools, {});
  assert.deepEqual(Object.keys(game.modules.get("adventurer-hud").api), [
    "open"
  ]);
  await game.modules.get("adventurer-hud").api.open();
  assert.equal(__adventurerHud.app, undefined);
  assert.deepEqual(fixture.notifications, [
    [
      "error",
      "Adventurer HUD: operation failed: ADVENTURER_HUD.Errors.UnsupportedSystem"
    ]
  ]);
});
test("HUD data reads and native calls stay inside D&D helpers", async () => {
  const hudFiles = (
    await readdir(new URL("../scripts/hud/", import.meta.url))
  ).filter(file => file.endsWith(".js"));
  const files = [
    new URL("../scripts/rolls-hud.js", import.meta.url),
    ...hudFiles.map(file => new URL("../scripts/hud/" + file, import.meta.url))
  ];
  const source = (
    await Promise.all(files.map(file => readFile(file, "utf8")))
  ).join("\n");
  assert.doesNotMatch(
    source,
    /CONFIG\.DND5E|CONFIG\.statusEffects|actor\.system|actor\.roll(?:Ability|Saving|Skill|Tool|Death)|item\.use\(/
  );
});
