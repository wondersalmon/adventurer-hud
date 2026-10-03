import assert from "node:assert/strict";
import test from "node:test";
import { installDom, restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { createItemPreview } from "../scripts/hud/items/item-preview.js";

restoreGlobalsAfterEach();
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { document, window: view } = installDom();
  view.innerWidth = 900;
  view.innerHeight = 600;
  const create = document.createElement.bind(document);
  t.mock.method(document, "createElement", tag => {
    const node = create(tag);
    node.getBoundingClientRect = () => ({
      left: 20,
      right: 60,
      top: 30,
      height: 100
    });
    return node;
  });
  const element = document.createElement("main");
  element.innerHTML =
    '<div data-description-item-id="a"><button>A</button></div><div data-description-item-id="b"><button>B</button></div>';
  document.body.append(element);
  for (const card of element.children)
    card.getBoundingClientRect = () => ({ left: 20, right: 60, top: 30 });
  const items = new Map([
    ["a", { name: "A <img src=x>", id: "a" }],
    ["b", { name: "B", id: "b" }]
  ]);
  const calls = [],
    errors = [];
  const preview = createItemPreview({
    element,
    getItem: id => items.get(id),
    enrich: async item => {
      calls.push(item.id);
      return '<p>Readable <a class="content-link" data-uuid="Actor.test">link</a></p>';
    },
    enabled: () => true,
    isActive: () => true,
    t: key => key,
    onError: error => errors.push(error),
    ...options
  });
  t.after(() => preview.dispose());
  const event = (id, type, properties = {}) => {
    const target = element.querySelector(
      `[data-description-item-id="${id}"] button`
    );
    const event = new view.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
  };
  return { document, element, items, calls, errors, preview, event };
}

test("preview enriches only after hover delay, escapes names and preserves enriched links", async t => {
  const f = fixture(t);
  f.event("a", "mouseover");
  t.mock.timers.tick(399);
  await settle();
  assert.equal(f.calls.length, 0);
  t.mock.timers.tick(1);
  await settle();
  const popup = f.element.querySelector(".ws-item-preview");
  assert.ok(popup);
  assert.equal(
    popup.querySelector("header strong").textContent,
    "A <img src=x>"
  );
  assert.equal(popup.querySelector("img"), null);
  assert.equal(popup.querySelector(".content-link").dataset.uuid, "Actor.test");
  assert.equal(
    f.element
      .querySelector('[data-description-item-id="a"]')
      .getAttribute("aria-describedby"),
    popup.id
  );
  assert.deepEqual(f.errors, []);
});

test("leaving before delay avoids enrichment and hover cannot use the item", async t => {
  const f = fixture(t);
  f.event("a", "mouseover");
  f.event("a", "mouseout");
  t.mock.timers.tick(1000);
  await settle();
  assert.deepEqual(f.calls, []);
  assert.equal(f.element.querySelector(".ws-item-preview"), null);
});

test("disabling hover still permits an explicit pinned F2 preview and Escape cleans it", async t => {
  const f = fixture(t, { enabled: () => false });
  f.event("a", "focusin");
  t.mock.timers.tick(500);
  await settle();
  assert.equal(f.calls.length, 0);
  assert.equal(f.event("a", "keydown", { key: "F2" }).defaultPrevented, true);
  await settle();
  assert.equal(
    f.element.querySelector(".ws-item-preview").getAttribute("role"),
    "dialog"
  );
  f.event("a", "mouseout");
  t.mock.timers.tick(500);
  assert.ok(f.element.querySelector(".ws-item-preview"));
  assert.equal(
    f.event("a", "keydown", { key: "Escape" }).defaultPrevented,
    true
  );
  assert.equal(f.element.querySelector(".ws-item-preview"), null);
  assert.equal(
    f.element
      .querySelector('[data-description-item-id="a"]')
      .hasAttribute("aria-describedby"),
    false
  );
  assert.equal(
    f.event("a", "keydown", { key: "Enter" }).defaultPrevented,
    false
  );
});

for (const change of ["dispose", "replace", "remove", "ownership"]) {
  test(`late description cannot show after ${change}`, async t => {
    let resolve;
    const f = fixture(t, {
      enrich: () =>
        new Promise(done => {
          resolve = done;
        })
    });
    if (change === "ownership") f.items.get("a").isOwner = true;
    f.event("a", "keydown", { key: "F2" });
    if (change === "dispose") f.preview.dispose();
    if (change === "replace") f.items.set("a", { name: "Replacement" });
    if (change === "ownership") f.items.get("a").isOwner = false;
    if (change === "remove")
      f.element.querySelector('[data-description-item-id="a"]').remove();
    resolve("<p>Late</p>");
    await settle();
    assert.equal(f.element.querySelector(".ws-item-preview"), null);
    assert.deepEqual(f.errors, []);
  });
}

test("a slower first description cannot overwrite a newer card", async t => {
  const pending = new Map();
  const f = fixture(t, {
    enrich: item => new Promise(resolve => pending.set(item.id, resolve))
  });
  f.event("a", "mouseover");
  t.mock.timers.tick(400);
  f.event("b", "mouseover");
  t.mock.timers.tick(400);
  pending.get("b")("<p>B</p>");
  await settle();
  pending.get("a")("<p>A</p>");
  await settle();
  assert.equal(
    f.element.querySelector(".ws-item-preview header strong").textContent,
    "B"
  );
});

test("enrichment failure is reported and dispose removes all event routes and timers", async t => {
  const failure = new Error("Enrichment failed");
  const f = fixture(t, {
    enrich: async () => {
      throw failure;
    }
  });
  f.event("a", "keydown", { key: "F2" });
  await settle();
  assert.deepEqual(f.errors, [failure]);
  assert.equal(f.element.querySelector(".ws-item-preview"), null);
  f.preview.dispose();
  f.event("a", "mouseover");
  f.event("a", "keydown", { key: "F2" });
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(f.errors.length, 1);
});
