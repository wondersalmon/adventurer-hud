import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { hudFixture } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
restoreGlobalsAfterEach();
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
    ["error", "Rolls HUD: ADVENTURER_HUD.Errors.UnsupportedSystem"]
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
