import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { ACTION_COOLDOWN_MS } from "../scripts/hud/action-cooldown.js";

restoreGlobalsAfterEach();

test("AC uses the native sheet breakdown and rejects deferred results after collapse or disposal", async t => {
  let time = 0;
  t.mock.method(performance, "now", () => time);
  const f = await hudFixture();
  let resolve;
  let calls = 0;
  f.actor.getAttributionData = property => {
    assert.equal(property, "attributes.ac");
    calls++;
    return new Promise(done => {
      resolve = done;
    });
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const html =
    '<table><tr><td>10</td><td>Unarmored Defense (Monk)</td></tr><tr><td>4</td><td>Dexterity</td></tr><tr><td>2</td><td>Wisdom</td></tr><tr class="total"><td>16</td><td>Total</td></tr></table>';
  try {
    assert.equal(calls, 0);
    await app.options.actions.togglearmorclass();
    await waitFor(() => calls === 1);
    resolve(html);
    await waitFor(() =>
      app.element.querySelector(".ws-armor-class-details table")
    );
    assert.match(
      app.element.querySelector(".ws-armor-class-details").textContent,
      /Dexterity.*Wisdom.*Total/
    );
    app.refreshFromSettings();
    await waitFor(() => calls === 2);
    time += ACTION_COOLDOWN_MS;
    await app.options.actions.togglearmorclass();
    resolve(html);
    await new Promise(done => setTimeout(done, 0));
    assert.equal(
      app.element.querySelector(".ws-armor-class-details table"),
      null
    );
    assert.equal(
      app.element
        .querySelector(".ws-armor-class-details")
        .hasAttribute("hidden"),
      true
    );
    time += ACTION_COOLDOWN_MS;
    await app.options.actions.togglearmorclass();
    await waitFor(() => calls === 3);
    const oldNode = app.element.querySelector(".ws-armor-class-details");
    await app.close();
    resolve(html);
    await new Promise(done => setTimeout(done, 0));
    assert.equal(oldNode.querySelector("table"), null);
  } finally {
    if (app.rendered) await app.close();
  }
});
