import assert from "node:assert/strict";
import test from "node:test";
import {
  changesPath,
  subscribeHudDocuments
} from "../scripts/hud/subscriptions.js";
import { refreshHudShell } from "../scripts/hud/refresh.js";
import {
  captureHudDomState,
  restoreHudDomState
} from "../scripts/hud/window/dom-state.js";
import { installDom, restoreGlobalsAfterEach } from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

test("change paths understand nested, flattened and deleted Foundry fields", () => {
  for (const changes of [
    { system: { tools: {} } },
    { "system.tools.thief": 1 },
    { "system.-=tools": null },
    { "system.attributes": { exhaustion: 1 } },
    { system: null }
  ]) {
    const path = Object.hasOwn(changes, "system.attributes")
      ? "system.attributes.exhaustion"
      : "system.tools";
    assert.equal(changesPath(changes, path), true);
  }
  assert.equal(
    changesPath({ "system.attributes.hp.value": 5 }, "system.tools"),
    false
  );
  assert.equal(changesPath({}, "effects"), false);
});

test("HP, favorites and consumption refresh the HUD without enriching statuses", () => {
  const callbacks = new Map();
  let statuses = 0,
    refreshes = 0;
  const actor = { uuid: "Actor.hero" };
  subscribeHudDocuments({
    actor,
    hooks: { on: (name, callback) => callbacks.set(name, callback), off() {} },
    scheduleRefresh: () => refreshes++,
    onStatusChange: () => statuses++
  });
  callbacks.get("updateActor")(actor, { "system.attributes.hp.value": 4 });
  callbacks.get("updateActor")(actor, { system: { favorites: [] } });
  const item = { type: "weapon", parent: actor };
  callbacks.get("updateItem")(item, { "system.uses.spent": 1 });
  callbacks.get("dnd5e.postActivityConsumption")({ item });
  assert.equal(refreshes, 4);
  assert.equal(statuses, 0);
  callbacks.get("updateActiveEffect")({ parent: actor });
  callbacks.get("updateActor")(actor, { statuses: ["poisoned"] });
  callbacks.get("updateItem")(item, { system: { equipped: true } });
  assert.equal(statuses, 3);
});

test("unchanged GM markup preserves the same nodes; changed markup still preserves expanded tools", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const markup =
    '<details class="ws-gm-encounter-tools"><summary>Setup</summary><button>Start</button></details>';
  refreshHudShell(shell, markup);
  const details = shell.firstElementChild;
  details.open = true;
  refreshHudShell(shell, markup);
  assert.equal(shell.firstElementChild, details);
  assert.equal(details.open, true);
  refreshHudShell(shell, markup.replace("Start", "Ready"));
  assert.notEqual(shell.firstElementChild, details);
  assert.equal(shell.firstElementChild.open, true);
});

test("refresh keeps the GM command menu open and preserves its closed state", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const markup =
    '<details class="ws-gm-more"><summary>More</summary><button>Ping</button></details>';
  refreshHudShell(shell, markup);
  shell.firstElementChild.open = true;
  refreshHudShell(shell, markup.replace("Ping", "Center"));
  assert.equal(shell.firstElementChild.open, true);
  shell.firstElementChild.open = false;
  refreshHudShell(shell, markup);
  assert.equal(shell.firstElementChild.open, false);
});

test("refresh preserves independently collapsed preparation rosters", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const markup =
    '<details class="ws-gm-list" open><summary>Creatures</summary></details><details class="ws-gm-list ws-gm-player-roster" open><summary>Players</summary></details>';
  shell.innerHTML = markup;
  shell.querySelector(".ws-gm-player-roster").open = false;
  const state = captureHudDomState(shell);
  shell.innerHTML = markup;
  restoreHudDomState(shell, state);
  assert.equal(shell.querySelector(".ws-gm-list").open, true);
  assert.equal(shell.querySelector(".ws-gm-player-roster").open, false);
});

test("refresh can restore keyboard focus to the GM menu disclosure", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const markup =
    '<details class="ws-gm-more"><summary id="ws-gm-more-toggle">More</summary></details>';
  shell.innerHTML = markup;
  const summary = shell.querySelector("summary");
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    value: summary
  });
  const state = captureHudDomState(shell);
  shell.innerHTML = markup;
  const replacement = shell.querySelector("summary");
  let focused = false;
  replacement.focus = () => {
    focused = true;
  };
  restoreHudDomState(shell, state);
  assert.equal(focused, true);
});

test("refresh preserves the responsive GM menu state and its accessible disclosure", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const markup =
    '<div class="ws-gm-more"><button class="ws-gm-more-toggle" aria-expanded="false">More</button><div class="ws-gm-more-actions">Ping</div></div>';
  refreshHudShell(shell, markup);
  shell.firstElementChild.classList.add("ws-expanded");
  refreshHudShell(shell, markup.replace("Ping", "Center"));
  assert.equal(shell.firstElementChild.classList.contains("ws-expanded"), true);
  assert.equal(
    shell.querySelector("button").getAttribute("aria-expanded"),
    "true"
  );
  shell.firstElementChild.classList.remove("ws-expanded");
  refreshHudShell(shell, markup);
  assert.equal(
    shell.firstElementChild.classList.contains("ws-expanded"),
    false
  );
  assert.equal(
    shell.querySelector("button").getAttribute("aria-expanded"),
    "false"
  );
});

test("refresh preserves the scroll positions used by player and GM responsive layouts", () => {
  const { document } = installDom();
  const shell = document.createElement("div");
  const selectors = [
    "ws-player-layout",
    "ws-player-info",
    "ws-player-actions",
    "ws-gm-content",
    "ws-gm-combat",
    "ws-gm-body",
    "ws-gm-info",
    "ws-gm-action-column",
    "ws-gm-more-actions"
  ];
  const markup = selectors
    .map(name => `<div class="${name}">Before</div>`)
    .join("");
  refreshHudShell(shell, markup);
  for (const [index, name] of selectors.entries())
    shell.querySelector(`.${name}`).scrollTop = 100 + index;
  refreshHudShell(shell, markup.replaceAll("Before", "After"));
  for (const [index, name] of selectors.entries())
    assert.equal(shell.querySelector(`.${name}`).scrollTop, 100 + index);
});

test("scroll restoration skips zero writes on replaced nodes but resets reused nodes", () => {
  const { document } = installDom();
  const root = document.createElement("div");
  root.innerHTML = '<div class="ws-combat-item-list"></div>';
  const previous = root.firstElementChild;
  previous.scrollTop = 0;
  const state = captureHudDomState(root);
  root.innerHTML = '<div class="ws-combat-item-list"></div>';
  let writes = 0;
  Object.defineProperty(root.firstElementChild, "scrollTop", {
    get: () => 0,
    set: () => writes++
  });
  restoreHudDomState(root, state);
  assert.equal(writes, 0);
  const reusedState = captureHudDomState(root);
  restoreHudDomState(root, reusedState);
  assert.equal(writes, 1);
});
