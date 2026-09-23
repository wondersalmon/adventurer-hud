import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  createHudState,
  resolveHudMode,
  setForcedMode,
  setRegularView
} from "../scripts/hud/state.js";
import { renderHudMode, renderRegularView } from "../scripts/render/index.js";

test("manual mode is limited to exploration and combat", () => {
  const state = createHudState({ currentView: "skills" });
  assert.equal(state.abilitiesExpanded, true);
  assert.equal(state.proficientSkillsOnly, true);
  assert.equal(state.combatAbilitiesExpanded, false);
  setForcedMode(state, "combat");
  assert.equal(state.forcedMode, "combat");
  assert.equal(state.currentView, "main");

  assert.equal(
    resolveHudMode({
      combatAvailable: true,
      forcedMode: state.forcedMode,
      isActiveCombatant: false
    }),
    "combat"
  );
  setForcedMode(state, "death");
  assert.equal(state.forcedMode, null);
});

test("automatic mode chooses combat for active combatants", () => {
  const base = {
    combatAvailable: true,
    forcedMode: null,
    isActiveCombatant: true
  };
  assert.equal(resolveHudMode(base), "combat");
  assert.equal(
    resolveHudMode({
      ...base,
      combatAvailable: false
    }),
    "regular"
  );
});

test("regular views are validated and rendered on demand", () => {
  const state = createHudState();
  assert.equal(state.inventoryCategory, "equipped");
  assert.equal(setRegularView(state, "skills"), true);
  assert.equal(setRegularView(state, "inventory"), true);
  assert.equal(state.currentView, "inventory");
  assert.equal(setRegularView(state, "skills"), true);
  assert.equal(setRegularView(state, "unknown"), false);
  assert.equal(
    renderRegularView(state.currentView, {
      main: () => "main",
      skills: () => "skills"
    }),
    "skills"
  );
  assert.equal(
    renderHudMode("combat", {
      regular: () => "regular",
      combat: () => "combat"
    }),
    "combat"
  );
});

test("regular HUD places initiative and inspiration beside rests", async () => {
  const source = await readFile(
    new URL("../scripts/hud/regular.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /restControls\(`\$\{combatInitiative\(\)\}\$\{inspirationControl\(\)\}`\)/
  );
});

test("extra-large typography has dedicated styles", async () => {
  const css = await readFile(
    new URL("../styles/adventurer-hud.css", import.meta.url),
    "utf8"
  );

  assert.match(css, /\.ws-font-extralarge \.ws-view/);
});

test("combat HUD renders its own combined ability section", async () => {
  const source = await readFile(
    new URL("../scripts/hud/combat.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /abilitiesSection\("combat"\)/);
});

test("regular HUD exposes inventory filters and item charges", async () => {
  const regularSource = await readFile(
    new URL("../scripts/hud/regular.js", import.meta.url),
    "utf8"
  );
  const combatSource = await readFile(
    new URL("../scripts/hud/combat-items.js", import.meta.url),
    "utf8"
  );

  assert.match(regularSource, /id="ws-inventory"/);
  assert.match(regularSource, /data-action="inventoryfilter"/);
  assert.match(regularSource, /inventoryItems\(hudState\.inventoryCategory\)/);
  assert.match(combatSource, /t\("Inventory\.Charges"\)/);
});

test("HUD mode renderers are split from the application controller", async () => {
  const controller = await readFile(
    new URL("../scripts/rolls-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(controller, /from "\.\/hud\/components\.js"/);
  assert.match(controller, /from "\.\/hud\/actor-picker\.js"/);
  assert.match(controller, /from "\.\/hud\/regular\.js"/);
  assert.match(controller, /from "\.\/hud\/combat\.js"/);
  assert.match(controller, /from "\.\/hud\/actions\.js"/);
  assert.match(controller, /from "\.\/hud\/refresh\.js"/);
  assert.match(controller, /from "\.\/hud\/window-session\.js"/);
  assert.match(controller, /from "\.\/hud\/window-controls\.js"/);
  assert.match(controller, /from "\.\/hud\/geometry\.js"/);
  assert.doesNotMatch(controller, /function normalHTML\(/);
  assert.doesNotMatch(controller, /function combatHTML\(/);
});

test("settings refresh preserves the actor attached to an open HUD", async () => {
  const entrypoint = await readFile(
    new URL("../scripts/adventurer-hud.js", import.meta.url),
    "utf8"
  );
  const controller = await readFile(
    new URL("../scripts/rolls-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(entrypoint, /openRollsHud\(state\.actor \?\? null\)/);
  assert.match(controller, /state\.actor = actor/);
  const session = await readFile(
    new URL("../scripts/hud/window-session.js", import.meta.url),
    "utf8"
  );
  assert.match(session, /state\.actor = null/);
});

test("Token Controls button visibility follows its client setting", async () => {
  const entrypoint = await readFile(
    new URL("../scripts/adventurer-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(entrypoint, /getSetting\(SETTINGS\.showTokenControl\)/);
  assert.match(entrypoint, /ui\.controls\?\.render\(\{ force: true \}\)/);
});
