import assert from "node:assert/strict";
import test from "node:test";
import { ChangelogSettingsController } from "../scripts/settings-changelog.js";
import { installDom, restoreGlobalsAfterEach } from "./helpers/foundry.mjs";

restoreGlobalsAfterEach();

function fixture(language = "en") {
  const { document, window } = installDom();
  const root = document.createElement("form");
  root.innerHTML =
    '<select data-changelog-language><option value="en">English</option><option value="ru">Русский</option></select><main class="ws-settings-content"><div data-changelog-list></div></main>';
  document.body.append(root);
  globalThis.foundry = { utils: { getRoute: path => `/prefix/${path}` } };
  const errors = [];
  const requests = [];
  globalThis.fetch = (path, options) =>
    new Promise((resolve, reject) =>
      requests.push({ path, options, resolve, reject })
    );
  const controller = new ChangelogSettingsController(root, {
    version: "2.2.0",
    language,
    t: key => key,
    onError: error => errors.push(error)
  });
  return {
    root,
    window,
    errors,
    requests,
    controller,
    host: root.querySelector("[data-changelog-list]"),
    select: root.querySelector("select"),
    scroll: root.querySelector("main")
  };
}

const answer = (request, source) =>
  request.resolve({ ok: true, text: async () => source });
const english =
  "## 2.2.0\n### Settings\n- **Colors:** Updated.\n#### Details\n[Guide](docs/player-guide.md)\n## 2.1.0\nOld notes";
const russian = "## 2.2.0\n### Настройки\n- **Цвета:** Обновлены.";

test("changelog lazily selects HUD language, preserves expansion and scroll when switching", async () => {
  const f = fixture("ru");
  assert.equal(f.select.value, "ru");
  assert.equal(f.requests.length, 0);
  const initial = f.controller.load();
  assert.match(
    f.requests[0].path,
    /prefix\/modules\/adventurer-hud\/CHANGELOG.ru.md$/
  );
  answer(f.requests[0], russian);
  await initial;
  f.host.querySelector("details").open = false;
  f.host.scrollTop = 25;
  f.scroll.scrollTop = 83;
  const switched = f.controller.setLanguage("en");
  answer(f.requests[1], english);
  await switched;
  assert.equal(
    f.host.querySelector('details[data-changelog-version="2.2.0"]').open,
    false
  );
  assert.equal(f.host.scrollTop, 25);
  assert.equal(f.scroll.scrollTop, 83);
  assert.equal(f.host.querySelector("h4").textContent, "Settings");
  assert.equal(f.host.querySelector("h5").textContent, "Details");
  assert.match(
    f.host.querySelector("a").href,
    /blob\/main\/docs\/player-guide.md$/
  );
  f.controller.dispose();
});

test("rapid language changes reject stale success and stale failures", async () => {
  const f = fixture();
  const first = f.controller.load();
  const second = f.controller.setLanguage("ru");
  const third = f.controller.setLanguage("en");
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(f.requests[1].options.signal.aborted, true);
  answer(f.requests[2], english);
  await third;
  answer(f.requests[0], "## 2.2.0\nStale English");
  f.requests[1].reject(new Error("stale failure"));
  await Promise.all([first, second]);
  assert.match(f.host.textContent, /Settings/);
  assert.doesNotMatch(f.host.textContent, /Stale/);
  assert.deepEqual(f.errors, []);
  f.controller.dispose();
});

test("failed notes retry, selector changes load, and disposal rejects late work and removes listeners", async () => {
  const f = fixture();
  const first = f.controller.load();
  f.requests[0].resolve({ ok: false, status: 404 });
  await first;
  assert.equal(f.host.textContent, "Settings.Changelog.Error");
  assert.equal(f.errors.length, 1);
  const retry = f.controller.load();
  answer(f.requests[1], english);
  await retry;
  f.select.querySelector('[value="ru"]').selected = true;
  f.select.dispatchEvent(new f.window.Event("change"));
  const pending = f.controller.loading;
  assert.equal(f.requests.length, 3);
  f.controller.dispose();
  assert.equal(f.requests[2].options.signal.aborted, true);
  answer(f.requests[2], russian);
  await pending;
  assert.match(f.host.textContent, /Settings/);
  f.select.querySelector('[value="en"]').selected = true;
  f.select.dispatchEvent(new f.window.Event("change"));
  await f.controller.load();
  assert.equal(f.requests.length, 3);
});
