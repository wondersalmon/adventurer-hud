import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import {
  createDiagnosticStore,
  DIAGNOSTIC_LIMITS
} from "../scripts/diagnostic-store.js";
import { diagnosticContext } from "../scripts/diagnostic-context.js";
import {
  diagnosticReport,
  recordDiagnostic,
  beginDiagnostic,
  reportFailure,
  diagnosticRef,
  startDiagnosticRecording,
  stopDiagnosticRecording,
  clearDiagnostics,
  subscribeDiagnostics,
  exportDiagnosticReport
} from "../scripts/diagnostics.js";
restoreGlobalsAfterEach();
afterEach(() => clearDiagnostics());

function actor(uuid = "Actor.secret") {
  return {
    uuid,
    type: "character",
    isOwner: true,
    name: "PRIVATE HERO",
    system: { secret: "PRIVATE SYSTEM" }
  };
}

test("report excludes private documents, search text, world settings and raw errors by default", t => {
  clearDiagnostics();
  installSettings();
  installDom();
  t.mock.method(console, "error", () => {});
  const hero = actor();
  const root = document.createElement("div");
  root.innerHTML = '<input data-action="searchitems" value="PRIVATE SEARCH">';
  globalThis.__adventurerHud = {
    actor: hero,
    preset: "player",
    session: {},
    app: {
      rendered: true,
      element: root,
      position: { width: 320, height: 600 }
    }
  };
  game.world = { name: "PRIVATE WORLD" };
  let visited = false;
  game.actors = {
    values() {
      visited = true;
      throw new Error("must not enumerate world");
    }
  };
  const error = new Error(
    "PRIVATE HERO https://secret.server/path?key=PRIVATE_TOKEN Actor.secret"
  );
  error.stack =
    "Error: PRIVATE HERO\n at x (https://secret.server/modules/adventurer-hud/scripts/hud/actions.js:10:5)\n at PRIVATE (C:\\Users\\PRIVATE\\data.js:1:2)";
  reportFailure("hud.action.useitem", error, { notify: false });
  recordDiagnostic("hud.card", {
    actor: diagnosticRef(hero, "actor"),
    name: "PRIVATE NAME",
    description: true,
    searchQuery: "PRIVATE SEARCH",
    system: hero.system
  });
  const report = diagnosticReport();
  assert.equal(visited, false);
  assert.equal(report.context.panel.searchActive, true);
  assert.equal(report.context.panel.width, 320);
  assert.equal(report.context.panel.height, 600);
  __adventurerHud.app.position = { width: 450, height: 350 };
  const resizedReport = diagnosticReport();
  assert.equal(resizedReport.context.panel.width, 450);
  assert.equal(resizedReport.context.panel.height, 350);
  assert.doesNotMatch(
    JSON.stringify(report),
    /PRIVATE|secret.server|Actor.secret|searchQuery/
  );
  assert.deepEqual(report.events[0].frames, [
    { package: "adventurer-hud", file: "actions.js", line: 10, column: 5 }
  ]);
  assert.equal(report.events[0].message, undefined);
  const opted = diagnosticReport({
    includeErrorText: true,
    comment: "I expected PRIVATE RESULT"
  });
  assert.match(opted.events[0].message, /PRIVATE HERO/);
  assert.doesNotMatch(
    opted.events[0].message,
    /secret.server|PRIVATE_TOKEN|Actor.secret/
  );
  assert.equal(opted.comment, "I expected PRIVATE RESULT");
});

test("token aliases distinguish synthetic instances and deny unobservable or hidden documents", () => {
  clearDiagnostics();
  installSettings();
  const base = actor(),
    first = actor("Scene.secret.Token.first.Actor.secret"),
    second = actor("Scene.secret.Token.second.Actor.secret");
  const a = diagnosticRef(first, "actor"),
    b = diagnosticRef(second, "actor"),
    replaced = diagnosticRef({ ...first }, "actor");
  assert.notEqual(a.ref, b.ref);
  assert.equal(a.ref, replaced.ref);
  assert.notEqual(a.instance, replaced.instance);
  assert.equal(
    diagnosticRef({
      uuid: "Actor.hidden",
      isOwner: false,
      isObservable: false
    }),
    null
  );
  assert.equal(
    diagnosticRef(
      { uuid: "Scene.secret.Token.hidden", actor: base, hidden: true },
      "token"
    ),
    null
  );
  assert.doesNotMatch(JSON.stringify([a, b, replaced]), /secret|Scene|Actor/);
});

test("failed operation keeps its snapshot and session while export reflects the later HUD", () => {
  clearDiagnostics();
  installSettings();
  globalThis.__adventurerHud = {
    actor: actor(),
    session: {},
    preset: "player"
  };
  const trace = beginDiagnostic("hud.token.focus", {
    actor: diagnosticRef(__adventurerHud.actor, "actor")
  });
  const first = diagnosticContext().actor;
  __adventurerHud.session = {};
  trace.finish("rejected", "token-not-on-scene");
  __adventurerHud.actor = actor("Actor.later");
  const report = diagnosticReport();
  assert.equal(report.problem.context.actor.ref, first.ref);
  assert.notEqual(report.context.actor.ref, first.ref);
  assert.equal(report.history[0].operation, report.history[1].operation);
  assert.equal(report.history[0].session, report.history[1].session);
  report.problem.context.actor.ref = "changed";
  assert.equal(diagnosticReport().problem.context.actor.ref, first.ref);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.refusals, 1);
});

test("record, mark, stop and clear retain useful history and release the timeout", () => {
  clearDiagnostics();
  installSettings();
  recordDiagnostic("hud.refresh", { phase: "off" }, { detailed: true });
  assert.equal(diagnosticReport().recordingEvents.length, 0);
  let notices = 0;
  const unsubscribe = subscribeDiagnostics(() => notices++);
  startDiagnosticRecording();
  recordDiagnostic("hud.refresh", { phase: "applied" }, { detailed: true });
  stopDiagnosticRecording({ mark: true });
  const marked = diagnosticReport();
  assert.equal(marked.recording.active, false);
  assert.equal(marked.recording.reason, "user-mark");
  assert.equal(marked.problem.reason, "user-mark");
  assert.equal(marked.recordingEvents.length, 1);
  recordDiagnostic("hud.refresh", { phase: "after" }, { detailed: true });
  assert.equal(diagnosticReport().recordingEvents.length, 1);
  unsubscribe();
  clearDiagnostics();
  assert.equal(notices, 2);
  assert.equal(diagnosticReport().recording, null);
  assert.deepEqual(diagnosticReport().history, []);
});

test("recorder bounds each buffer, reports eviction, expires at ten minutes and preserves time ordering", () => {
  let now = 1000;
  const store = createDiagnosticStore({ now: () => now, monotonic: () => now });
  store.start();
  for (let i = 0; i < 1700; i++) {
    now++;
    store.record(
      { scope: "hud.action", data: { count: i } },
      { detailed: i >= 160 }
    );
  }
  const result = store.snapshot();
  assert.equal(result.history.length, 150);
  assert.equal(result.recordingEvents.length, 1500);
  assert.equal(result.dropped.history, 10);
  assert.equal(result.dropped.recording, 40);
  assert.ok(
    result.recordingEvents[1].elapsed > result.recordingEvents[0].elapsed
  );
  now = 1000 + DIAGNOSTIC_LIMITS.duration;
  assert.equal(store.active, false);
  assert.equal(store.snapshot().recording.reason, "timeout");
  store.record({ scope: "late" }, { detailed: true });
  assert.equal(store.snapshot().recordingEvents.length, 1500);
  store.clear();
  assert.equal(store.snapshot().history.length, 0);
});

test("combined recorder memory stays bounded and identical event bursts coalesce", () => {
  const store = createDiagnosticStore();
  store.start();
  for (let i = 0; i < 20; i++)
    store.record(
      { scope: "same", data: { phase: "refresh" } },
      { detailed: true }
    );
  assert.equal(store.snapshot().recordingEvents.length, 1);
  assert.equal(store.snapshot().recordingEvents[0].count, 20);
  for (let i = 0; i < 400; i++)
    store.failure({ scope: "error." + i, message: "x".repeat(18000) }, null);
  const result = store.snapshot();
  assert.ok(result.memoryBytes <= DIAGNOSTIC_LIMITS.bytes);
  assert.ok(result.dropped.memory > 0);
  assert.ok(result.events.length <= 100);
});

test("collector and subscriber failures cannot interrupt a HUD operation", () => {
  clearDiagnostics();
  installSettings();
  const failing = {
    get data() {
      throw new Error("collector failure");
    }
  };
  assert.doesNotThrow(() => recordDiagnostic("hud.action", failing));
  const remove = subscribeDiagnostics(() => {
    throw new Error("UI failure");
  });
  assert.doesNotThrow(() => startDiagnosticRecording());
  remove();
  globalThis.__adventurerHud = {
    get actor() {
      throw new Error("bad actor");
    }
  };
  assert.deepEqual(diagnosticContext(), { unavailable: true });
  assert.doesNotThrow(() =>
    recordDiagnostic(
      "hud.action",
      {},
      { outcome: "rejected", reason: "no-permission" }
    )
  );
});

test("cancelled export retains recorded evidence and retry uses the native downloader", async () => {
  clearDiagnostics();
  installSettings();
  startDiagnosticRecording();
  recordDiagnostic(
    "hud.vision.availability",
    { missing: ["Token.initializeVisionSource"] },
    { outcome: "rejected", reason: "vision-unsupported" }
  );
  stopDiagnosticRecording({ mark: true });
  foundry.utils = { saveDataToFile: async () => false };
  await assert.rejects(exportDiagnosticReport(), /not started/);
  assert.equal(diagnosticReport().summary.refusals, 1);
  let data;
  foundry.utils.saveDataToFile = async text => {
    data = JSON.parse(text);
  };
  await exportDiagnosticReport();
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.problem.reason, "user-mark");
  assert.ok(
    data.history.some(e =>
      e.data.missing?.includes("Token.initializeVisionSource")
    )
  );
});

test("troubleshooting actions preview escaped report text and preserve optional comment", async () => {
  clearDiagnostics();
  const { menus } = installSettings();
  installDom();
  const C = menus.get("troubleshooting").type;
  const app = new C();
  app.element = document.createElement("div");
  app.element.innerHTML =
    '<textarea data-diagnostic-comment></textarea><input type="checkbox" data-diagnostic-errors>';
  app.element.querySelector("textarea").value =
    "<script>PRIVATE COMMENT</script>";
  await C.DEFAULT_OPTIONS.actions.record.call(app);
  assert.equal((await app._prepareContext()).recording, true);
  await C.DEFAULT_OPTIONS.actions.mark.call(app);
  await C.DEFAULT_OPTIONS.actions.preview.call(app);
  const context = await app._prepareContext();
  assert.equal(context.recording, false);
  assert.match(context.preview, /PRIVATE COMMENT/);
  const { readFile } = await import("node:fs/promises");
  const { default: Handlebars } = await import("handlebars");
  const html = Handlebars.compile(
    await readFile(
      new URL("../templates/integrity.hbs", import.meta.url),
      "utf8"
    )
  )(context);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  let saved;
  foundry.utils = {
    saveDataToFile: text => {
      saved = JSON.parse(text);
    }
  };
  await C.DEFAULT_OPTIONS.actions.export.call(app);
  assert.equal(saved.comment, "<script>PRIVATE COMMENT</script>");
  await C.DEFAULT_OPTIONS.actions.cleardiagnostics.call(app);
  const cleared = await app._prepareContext();
  assert.equal(cleared.diagnosticComment, "");
  assert.equal(cleared.preview, "");
});

test("automatic timeout notifies the recording indicator without another HUD action", t => {
  clearDiagnostics();
  installSettings();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let updates = 0;
  const remove = subscribeDiagnostics(() => updates++);
  startDiagnosticRecording();
  t.mock.timers.tick(DIAGNOSTIC_LIMITS.duration);
  assert.equal(diagnosticReport().recording.active, false);
  assert.equal(diagnosticReport().recording.reason, "timeout");
  assert.equal(updates, 2);
  remove();
});

test("a marked problem survives later refusals and errors before export", t => {
  clearDiagnostics();
  installSettings();
  t.mock.method(console, "error", () => {});
  globalThis.__adventurerHud = { actor: actor("Actor.first"), session: {} };
  startDiagnosticRecording();
  stopDiagnosticRecording({ mark: true });
  const original = diagnosticReport().problem;
  __adventurerHud.actor = actor("Actor.later");
  recordDiagnostic(
    "hud.action",
    {},
    { outcome: "rejected", reason: "no-permission" }
  );
  reportFailure("hud.later", new Error("later"), { notify: false });
  assert.deepEqual(diagnosticReport().problem, original);
});

test("correlation metadata never exports an accidental document payload", () => {
  clearDiagnostics();
  installSettings();
  const secret = {
    name: "PRIVATE DOCUMENT",
    system: { value: "PRIVATE VALUE" }
  };
  recordDiagnostic(
    "hud.action",
    { session: secret, actor: secret },
    { operation: secret }
  );
  const report = diagnosticReport();
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  assert.equal(report.history[0].operation, null);
  assert.equal(report.history[0].session, "unknown");
});
