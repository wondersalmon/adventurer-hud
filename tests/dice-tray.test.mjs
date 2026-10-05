import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { installDom, restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { bindHudDiceTray } from "../scripts/hud/window/window-session.js";
import {
  diceTrayFormula,
  playDiceTraySound
} from "../scripts/hud/dice-tray.js";
import { rollDiceTray } from "../scripts/dnd5e/dice-tray.js";

restoreGlobalsAfterEach();

test("tray gestures, formula, clear and native chat respect visibility; close and session replacement release the popover", async () => {
  const f = await hudFixture({ values: { playerFooter: true } });
  const calls = [];
  let rolledDice = [];
  foundry.dice = {
    Roll: class {
      constructor(formula, data) {
        calls.push(["formula", formula, data]);
        this.total = 9;
        this.dice = rolledDice;
      }
      async evaluate() {
        calls.push(["evaluate"]);
      }
      async toMessage(data, options) {
        calls.push(["chat", data, options]);
      }
    }
  };
  CONFIG.ChatMessage = {
    documentClass: { getSpeaker: ({ actor }) => ({ actor: actor.id }) }
  };
  f.actor.getRollData = () => ({ bonus: 3 });
  const get = game.settings.get;
  game.settings.get = (module, key) =>
    module === "core" ? "private" : get(module, key);
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  app.element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 650,
    height: 500,
    right: 650,
    bottom: 500
  });
  const button = app.element.querySelector('[data-dice-tray="toggle"]');
  button.getBoundingClientRect = () => ({
    left: 550,
    top: 460,
    right: 580,
    bottom: 490
  });
  const dispatch = (target, type = "click", options = {}) => {
    const event = new document.defaultView.Event(type, {
      bubbles: true,
      cancelable: true
    });
    Object.assign(event, options);
    target.dispatchEvent(event);
  };
  dispatch(button);
  await waitFor(() => app.element.querySelector(".ws-dice-tray"));
  const tray = app.element.querySelector(".ws-dice-tray");
  tray.getBoundingClientRect = () => ({ width: 320, height: 250 });
  const die = tray.querySelector('[data-die="6"]');
  dispatch(die);
  dispatch(die);
  dispatch(die, "contextmenu");
  assert.equal(die.querySelector("small").textContent, "1");
  const input = tray.querySelector("input");
  input.value = "-2";
  dispatch(input, "input");
  dispatch(tray.querySelector('[data-dice-tray="roll"]'));
  await waitFor(() => calls.some(call => call[0] === "chat"));
  assert.deepEqual(
    calls.find(call => call[0] === "formula"),
    ["formula", "1d6 + (-2)", { bonus: 3 }]
  );
  assert.deepEqual(
    calls.find(call => call[0] === "chat"),
    ["chat", { speaker: { actor: f.actor.id } }, { messageMode: "private" }]
  );
  await waitFor(() => die.querySelector("small").textContent === "0");
  assert.equal(input.value, "-2");
  for (const [options, formula] of [
    [{ shiftKey: true }, "1d6"],
    [{ altKey: true }, "2d6kh"],
    [{ ctrlKey: true }, "2d6kl"]
  ]) {
    const before = calls.filter(call => call[0] === "chat").length;
    dispatch(die, "click", options);
    await waitFor(
      () => calls.filter(call => call[0] === "chat").length > before
    );
    assert.equal(
      calls.filter(call => call[0] === "formula").at(-1)[1],
      formula
    );
    assert.equal(die.querySelector("small").textContent, "0");
  }
  for (const [dice, expected] of [
    [
      [
        {
          faces: 20,
          results: [
            { result: 20, active: true },
            { result: 1, active: false, discarded: true }
          ]
        }
      ],
      "ws-tray-nat20"
    ],
    [
      [
        {
          faces: 20,
          results: [
            { result: 1, active: true },
            { result: 20, discarded: true }
          ]
        }
      ],
      "ws-tray-nat1"
    ],
    [
      [
        {
          faces: 20,
          results: [
            { result: 20, rerolled: true },
            { result: 8, active: true }
          ]
        }
      ],
      null
    ],
    [[{ faces: 6, results: [{ result: 1, active: true }] }], null],
    [
      [
        {
          faces: 20,
          results: [
            { result: 1, active: true },
            { result: 20, active: true }
          ]
        }
      ],
      "both"
    ]
  ]) {
    rolledDice = dice;
    const before = calls.filter(call => call[0] === "chat").length;
    dispatch(tray.querySelector('[data-die="20"]'), "click", { altKey: true });
    await waitFor(
      () => calls.filter(call => call[0] === "chat").length > before
    );
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(
      tray.classList.contains("ws-tray-nat20"),
      expected === "ws-tray-nat20" || expected === "both"
    );
    assert.equal(
      tray.classList.contains("ws-tray-nat1"),
      expected === "ws-tray-nat1" || expected === "both"
    );
  }
  const beforeMimic = calls.length;
  for (let click = 0; click < 5; click++)
    dispatch(tray.querySelector('[data-dice-tray="mimic"]'));
  await waitFor(() => tray.classList.contains("ws-tray-mimic"));
  assert.equal(calls.length, beforeMimic);
  dispatch(tray.querySelector('[data-dice-tray="clear"]'));
  dispatch(die, "contextmenu");
  assert.equal(die.querySelector("small").textContent, "0");
  assert.equal(input.value, "");
  dispatch(tray, "keydown", { key: "Escape" });
  assert.equal(app.element.querySelector(".ws-dice-tray"), null);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  dispatch(button);
  await app.hudActions.togglefavorites();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(app.element.querySelector(".ws-dice-tray"), null);
  await app.close();
});

test("native dice reject ownership loss or replaced session after asynchronous evaluation", async () => {
  let current = true;
  let messages = 0;
  let release;
  globalThis.foundry = {
    dice: {
      Roll: class {
        evaluate() {
          return new Promise(resolve => {
            release = resolve;
          });
        }
        toMessage() {
          messages++;
        }
      }
    }
  };
  const actor = { isOwner: true, getRollData: () => ({}) };
  const pending = rollDiceTray(actor, "1d20", () => current);
  current = false;
  release();
  await pending;
  assert.equal(messages, 0);
  current = true;
  const lostOwnership = rollDiceTray(actor, "1d20", () => current);
  actor.isOwner = false;
  release();
  await lostOwnership;
  assert.equal(messages, 0);
  assert.equal(await rollDiceTray(actor, "1d6", () => true), undefined);
  assert.equal(
    diceTrayFormula({ 6: 2, 20: 1 }, "@bonus"),
    "2d6 + 1d20 + (@bonus)"
  );
});

for (const change of [
  "none",
  "dispose",
  "window",
  "ownership",
  "session",
  "button"
]) {
  test(`lazy tray loads once and rejects stale completion: ${change}`, async () => {
    const { document } = installDom();
    const root = document.createElement("section");
    root.innerHTML = '<button data-dice-tray="toggle">Dice</button>';
    document.body.append(root);
    const app = { element: root },
      actor = { isOwner: true };
    let active = true,
      loads = 0,
      binds = 0,
      releases = 0,
      resolve;
    const dispose = bindHudDiceTray({
      app,
      actor,
      t: key => key,
      isActive: () => active,
      load: () => {
        loads++;
        return new Promise(done => {
          resolve = done;
        });
      }
    });
    const button = root.firstElementChild;
    button.click();
    button.click();
    await waitFor(() => loads === 1);
    if (change === "dispose") dispose();
    if (change === "window") app.element = document.createElement("section");
    if (change === "ownership") actor.isOwner = false;
    if (change === "session") active = false;
    if (change === "button") button.remove();
    resolve({
      bindDiceTray: () => {
        binds++;
        return () => releases++;
      }
    });
    await new Promise(done => setTimeout(done, 0));
    assert.equal(loads, 1);
    assert.equal(binds, change === "none" ? 1 : 0);
    dispose();
    assert.equal(releases, change === "none" ? 1 : 0);
  });
}

test("native tray result observer follows chat and rejects ownership/session loss during chat", async () => {
  let current = true;
  const actor = { isOwner: true, getRollData: () => ({}) };
  let observed = 0;
  let invalidate = () => {};
  const calls = [];
  globalThis.foundry = {
    dice: {
      Roll: class {
        total = 25;
        dice = [{ faces: 20, results: [{ result: 20, active: true }] }];
        async evaluate() {
          calls.push("evaluate");
        }
        async toMessage() {
          calls.push("chat");
          invalidate();
        }
      }
    }
  };
  globalThis.CONFIG = {
    ChatMessage: { documentClass: { getSpeaker: () => ({}) } }
  };
  globalThis.game = { settings: { get: () => "private" } };
  const onResult = roll => {
    observed++;
    calls.push("result");
    assert.equal(roll.dice[0].results[0].result, 20);
  };
  assert.equal(
    await rollDiceTray(actor, "1d20+5", () => current, onResult),
    25
  );
  assert.deepEqual(calls, ["evaluate", "chat", "result"]);
  invalidate = () => {
    current = false;
  };
  await rollDiceTray(actor, "1d20", () => current, onResult);
  assert.equal(observed, 1);
  current = true;
  invalidate = () => {
    actor.isOwner = false;
  };
  await rollDiceTray(actor, "1d20", () => current, onResult);
  assert.equal(observed, 1);
});

test("tray sounds use native interface context, obey mute/volume/lock and release only owned nodes", () => {
  const nodes = [];
  let volume = 0.5;
  const parameter = () => ({
    setValueAtTime(value) {
      this.initial = value;
    },
    linearRampToValueAtTime(value) {
      this.peak = value;
    },
    exponentialRampToValueAtTime() {}
  });
  const context = {
    state: "running",
    currentTime: 2,
    destination: {},
    createOscillator() {
      const oscillator = {
        frequency: parameter(),
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        }
      };
      nodes.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = {
        gain: parameter(),
        connect() {},
        disconnect() {
          this.disconnected = true;
        }
      };
      nodes.push(gain);
      return gain;
    }
  };
  globalThis.game = {
    audio: { interface: context, locked: false, globalMute: false },
    settings: {
      get: (module, key) => {
        assert.equal(module, "core");
        assert.equal(key, "globalInterfaceVolume");
        return volume;
      }
    }
  };
  for (const [effect, count] of [
    ["ws-tray-nat20", 4],
    ["ws-tray-nat1", 2],
    ["ws-tray-mimic", 2]
  ]) {
    nodes.length = 0;
    const stop = playDiceTraySound(effect);
    assert.equal(nodes.filter(node => node.started).length, count);
    assert.equal(
      nodes.find(node => node.gain).gain.peak,
      effect === "ws-tray-nat1" ? 0.045 : 0.0275
    );
    if (effect === "ws-tray-nat1")
      assert.equal(nodes[0].frequency.initial, 620);
    stop();
    stop();
    assert.ok(nodes.every(node => node.disconnected));
  }
  nodes.length = 0;
  playDiceTraySound("ws-tray-nat20");
  const oscillator = nodes[0];
  oscillator.onended();
  assert.equal(oscillator.disconnected, true);
  assert.equal(nodes[1].disconnected, true);
  for (const reason of ["mute", "lock", "suspended", "zero"]) {
    nodes.length = 0;
    game.audio.globalMute = reason === "mute";
    game.audio.locked = reason === "lock";
    context.state = reason === "suspended" ? "suspended" : "running";
    volume = reason === "zero" ? 0 : 0.5;
    playDiceTraySound("ws-tray-nat20")();
    assert.equal(nodes.length, 0);
  }
});
