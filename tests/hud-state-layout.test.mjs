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

test("one forced mode replaces the former three-flag state", () => {
  const state = createHudState({ currentView: "skills" });
  assert.equal(state.abilityChecksExpanded, true);
  assert.equal(state.combatAbilityChecksExpanded, false);
  assert.equal(state.combatSavingThrowsExpanded, true);
  setForcedMode(state, "combat");
  assert.equal(state.forcedMode, "combat");
  assert.equal(state.currentView, "main");

  assert.equal(
    resolveHudMode({
      automaticCombatMode: false,
      combatAvailable: true,
      deathActive: false,
      deathAvailable: true,
      forcedMode: state.forcedMode,
      isActiveCombatant: false
    }),
    "combat"
  );
});

test("automatic mode priority remains death, combat, regular", () => {
  const base = {
    automaticCombatMode: true,
    combatAvailable: true,
    deathAvailable: true,
    forcedMode: null,
    isActiveCombatant: true
  };
  assert.equal(resolveHudMode({ ...base, deathActive: true }), "death");
  assert.equal(resolveHudMode({ ...base, deathActive: false }), "combat");
  assert.equal(
    resolveHudMode({
      ...base,
      automaticCombatMode: false,
      deathActive: false
    }),
    "regular"
  );
});

test("manual death mode remains available before death saves are active", () => {
  assert.equal(
    resolveHudMode({
      automaticCombatMode: false,
      combatAvailable: true,
      deathActive: false,
      deathAvailable: true,
      forcedMode: "death",
      isActiveCombatant: false
    }),
    "death"
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

test("regular HUD keeps initiative beside the actor controls", async () => {
  const source = await readFile(
    new URL("../scripts/hud/regular.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /actorHeader\(`\$\{combatInitiative\(\)\}\$\{inspirationControl\(\)\}`\)/
  );
});

test("extra-large typography and resource shortcut keys have dedicated styles", async () => {
  const css = await readFile(
    new URL("../styles/adventurer-hud.css", import.meta.url),
    "utf8"
  );
  const source = await readFile(
    new URL("../scripts/hud/combat.js", import.meta.url),
    "utf8"
  );

  assert.match(css, /\.ws-font-extralarge \.ws-view/);
  assert.match(source, /ws-resource-shortcuts ws-shortcuts/);
  assert.match(source, /<kbd>\$\{t\("Combat\.ResourceConsumeKeys"\)\}<\/kbd>/);
});

test("combat HUD renders its own collapsed check section", async () => {
  const source = await readFile(
    new URL("../scripts/hud/combat.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /abilityChecksSection\("combat"\)/);
});

test("regular HUD exposes inventory filters and item charges", async () => {
  const regularSource = await readFile(
    new URL("../scripts/hud/regular.js", import.meta.url),
    "utf8"
  );
  const combatSource = await readFile(
    new URL("../scripts/hud/combat.js", import.meta.url),
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
  assert.match(controller, /from "\.\/hud\/regular\.js"/);
  assert.match(controller, /from "\.\/hud\/combat\.js"/);
  assert.match(controller, /from "\.\/hud\/death-saves\.js"/);
  assert.doesNotMatch(controller, /function normalHTML\(/);
  assert.doesNotMatch(controller, /function combatHTML\(/);
  assert.doesNotMatch(controller, /function deathHTML\(/);
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
  assert.match(controller, /state\.actor = null/);
});

test("Token Controls button visibility follows its client setting", async () => {
  const entrypoint = await readFile(
    new URL("../scripts/adventurer-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(entrypoint, /getSetting\(SETTINGS\.showTokenControl\)/);
  assert.match(entrypoint, /ui\.controls\?\.render\(\{ force: true \}\)/);
});

test("pinned HUD ignores only close-key requests", async () => {
  const controller = await readFile(
    new URL("../scripts/rolls-hud.js", import.meta.url),
    "utf8"
  );

  assert.match(controller, /if \(pinned && options\.closeKey\)/);
  assert.match(controller, /return super\.close\(options\)/);
  assert.match(controller, /menu\.before\(control\)/);
  assert.match(controller, /control\.setAttribute\("aria-pressed"/);
  assert.doesNotMatch(controller, /controls:\s*\[\s*\{\s*icon:\s*pinned/s);
});
