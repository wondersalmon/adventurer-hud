import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { diagnosticReport } from "../scripts/diagnostics.js";
import { createHpDialogController } from "../scripts/hud/hp-dialog.js";
import { createRefreshScheduler } from "../scripts/hud/refresh.js";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { fragment } from "./helpers/rendering.mjs";

restoreGlobalsAfterEach();

test("empty diagnostic export explains the absence of errors and still downloads environment information", async () => {
  const { menus, notifications } = installSettings();
  let data;
  foundry.utils = {
    saveDataToFile: value => {
      data = JSON.parse(value);
    }
  };
  const C = menus.get("integrity").type;
  const app = new C();
  app.t = key => key;
  await C.DEFAULT_OPTIONS.actions.export.call(app);
  assert.deepEqual(data.events, []);
  assert.ok(data.environment);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], "info");
  assert.match(
    notifications[0][1],
    /DownloadRequestedEmpty.*adventurer-hud-diagnostics-.*\.json/
  );
});

test("export waits for the native downloader before reporting a result", async () => {
  const { menus, notifications } = installSettings();
  let resolveDownload;
  foundry.utils = {
    saveDataToFile: () =>
      new Promise(resolve => {
        resolveDownload = resolve;
      })
  };
  const C = menus.get("integrity").type;
  const app = new C();
  app.t = key => key;
  const pending = C.DEFAULT_OPTIONS.actions.export.call(app);
  assert.deepEqual(notifications, []);
  resolveDownload();
  await pending;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], "info");
});

for (const outcome of ["rejection", "refusal"]) {
  test(`diagnostic export reports asynchronous ${outcome} instead of announcing a download`, async t => {
    t.mock.method(console, "error", () => {});
    const { menus, notifications } = installSettings();
    foundry.utils = {
      saveDataToFile: async () => {
        if (outcome === "rejection")
          throw new Error("asynchronous download unavailable");
        return false;
      }
    };
    const C = menus.get("integrity").type;
    const app = new C();
    await C.DEFAULT_OPTIONS.actions.export.call(app);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0][0], "error");
    assert.equal(diagnosticReport().events.at(-1).scope, "diagnostics.export");
  });
}

test("HP dialog and background refresh failures are reported and remain recoverable", async t => {
  t.mock.method(console, "error", () => {});
  const { notifications } = installSettings();
  installDom();
  let options;
  foundry.applications.api.DialogV2 = class {
    constructor(value) {
      options = value;
    }
    render() {
      return this;
    }
  };
  const { openHpDialog } = createHpDialogController({
    actor: {},
    adapter: {
      combatStats: () => ({ hp: { value: 10, temp: 0, max: 20 } }),
      updateHp: async () => {
        throw new Error("HP update failed");
      }
    },
    DialogV2: foundry.applications.api.DialogV2,
    t: key => key
  });
  openHpDialog();
  const button = {
    form: {
      elements: { namedItem: name => ({ value: name === "value" ? "-2" : "" }) }
    }
  };
  await assert.rejects(
    options.buttons[0].callback({}, button),
    /HP update failed/
  );
  let frame;
  let fail = true,
    refreshed = 0;
  const scheduler = createRefreshScheduler(
    () => {
      if (fail) throw new Error("refresh failed");
      refreshed++;
    },
    {
      requestFrame: callback => {
        frame = callback;
        return 1;
      },
      cancelFrame() {}
    }
  );
  scheduler.schedule();
  assert.doesNotThrow(() => frame());
  fail = false;
  scheduler.schedule();
  frame();
  assert.equal(refreshed, 1);
  assert.equal(notifications.length, 2);
  assert.ok(
    diagnosticReport().events.some(entry => entry.scope === "hud.hp.save")
  );
  assert.ok(
    diagnosticReport().events.some(entry => entry.scope === "hud.refresh")
  );
});

test("diagnostics deduplicate bursts, bound the log and do not include world documents", async t => {
  t.mock.method(console, "error", () => {});
  const { notifications } = installSettings();
  game.version = "14.test";
  game.modules = new Map([
    ["adventurer-hud", { id: "adventurer-hud", active: true, version: "test" }]
  ]);
  game.world = { name: "PRIVATE WORLD" };
  game.user.name = "PRIVATE USER";
  game.actors = [{ name: "PRIVATE HERO" }];
  const { reportFailure, diagnosticReport } =
    await import("../scripts/diagnostics.js?bounded-test");
  const error = new Error(
    "Failed https://example.test/file?token=PRIVATE_TOKEN"
  );
  for (let index = 0; index < 20; index++) reportFailure("hud.test", error);
  let report = diagnosticReport();
  assert.equal(report.events.length, 1);
  assert.equal(report.events[0].count, 20);
  assert.equal(notifications.length, 1);
  assert.equal(report.events[0].message, "Failed https://example.test/file");
  assert.equal(report.environment.foundry, "14.test");
  assert.equal(report.environment.module, "test");
  assert.ok(report.events[0].stack.includes("Error:"));
  report.events[0].count = 0;
  assert.equal(diagnosticReport().events[0].count, 20);
  for (let index = 0; index < 110; index++)
    reportFailure(`test.${index}`, new Error(`error ${index}`), {
      notify: false
    });
  report = diagnosticReport();
  assert.equal(report.events.length, 100);
  assert.equal(report.events[0].scope, "test.10");
  assert.equal(report.events.at(-1).scope, "test.109");
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|notified|world|actors/);
});

test("settings export delegates a readable report to the native Foundry downloader", async () => {
  const { menus } = installSettings();
  let saved;
  foundry.utils = {
    saveDataToFile: (...args) => {
      saved = args;
    }
  };
  const C = menus.get("integrity").type;
  const app = new C();
  app.report = {
    issues: [
      {
        code: "MissingFile",
        detail: "templates/rolls-hud.hbs",
        repairable: false
      }
    ]
  };
  await C.DEFAULT_OPTIONS.actions.export.call(app);
  const [data, mime, filename] = saved;
  assert.equal(mime, "application/json");
  assert.match(filename, /^adventurer-hud-diagnostics-.*\.json$/);
  assert.equal(JSON.parse(data).schemaVersion, 1);
  assert.deepEqual(JSON.parse(data).integrity, app.report);
  assert.ok(data.includes("\n  "));
  const context = await app._prepareContext();
  const source = await readFile(
    new URL("../templates/integrity.hbs", import.meta.url),
    "utf8"
  );
  const root = fragment(Handlebars.compile(source)(context));
  assert.equal(
    root.querySelector('[data-action="export"]').getAttribute("type"),
    "button"
  );
});

test("repair and export failures reach both the journal and the user", async t => {
  t.mock.method(console, "error", () => {});
  const { menus, notifications } = installSettings({
    values: { showSearch: "broken" }
  });
  const C = menus.get("integrity").type;
  const app = new C();
  app.report = {
    issues: [{ code: "InvalidSetting", detail: "showSearch", repairable: true }]
  };
  game.settings.set = async () => {
    throw new Error("repair storage unavailable");
  };
  await C.DEFAULT_OPTIONS.actions.repair.call(app);
  assert.equal(app.failure, true);
  assert.equal(app.busy, false);
  assert.match(app.context.summary, /Integrity.Failed/);
  foundry.utils = {
    saveDataToFile() {
      throw new Error("download unavailable");
    }
  };
  await C.DEFAULT_OPTIONS.actions.export.call(app);
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every(([level]) => level === "error"));
  const scopes = diagnosticReport().events.map(entry => entry.scope);
  assert.ok(scopes.includes("integrity.repair"));
  assert.ok(scopes.includes("diagnostics.export"));
});
