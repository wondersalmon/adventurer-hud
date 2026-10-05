import test from "node:test";
import assert from "node:assert/strict";
import { hudFixture, waitFor } from "./helpers/hud.mjs";
import { fixture } from "./helpers/companions.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { createHudState } from "../scripts/hud/state.js";
import {
  panelStateSnapshot,
  panelStateForActor
} from "../scripts/hud/panel-state.js";
import {
  synchronizeHudLayout,
  changeHudLayout
} from "../scripts/hud/window/hud-layout.js";
import { fragment } from "./helpers/rendering.mjs";

restoreGlobalsAfterEach();

for (const gm of [false, true]) {
  test(`${gm ? "GM" : "player"} block layouts move across columns, hide/restore and survive a fresh render without losing native controls`, () => {
    const html = gm
      ? '<div id="ws-combat"><div class="ws-gm-body"><section class="ws-gm-info"><div class="ws-gm-identity">Actor</div><div class="ws-combat-stats"><button data-action="edithp">HP</button></div><section class="ws-gm-saves">Saves</section></section><section class="ws-gm-action-column"><div class="ws-combat-actions">Actions</div></section></div></div>'
      : '<div id="ws-main" class="ws-player-layout"><section class="ws-player-info"><div class="ws-actor-header">Actor</div><div class="ws-health-stack"><button data-action="edithp">HP</button></div><section class="ws-ability-table">Saves</section></section><section class="ws-player-actions"><div class="ws-exploration-nav">Actions</div></section></div>';
    const root = fragment(html),
      state = createHudState({ hudEditing: true });
    root.ownerDocument.body.append(root);
    const sync = () => synchronizeHudLayout(root, state, key => key);
    sync();
    const key = gm ? "stats" : "hp";
    const hp = root.querySelector(`[data-hud-block="${key}"]`);
    const native = hp.querySelector('[data-action="edithp"]');
    assert.equal(
      changeHudLayout(
        root,
        state,
        hp.querySelector('[data-hud-direction="column"]')
      ),
      true
    );
    sync();
    assert.equal(native.isConnected, true);
    assert.equal(hp.parentElement.dataset.hudLane, "actions");
    assert.equal(
      changeHudLayout(
        root,
        state,
        hp.querySelector('[data-action="hudblockhide"]'),
        true
      ),
      true
    );
    sync();
    assert.equal(hp.classList.contains("ws-hud-block-hidden"), true);
    assert.equal(root.querySelectorAll(".ws-hud-layout-restore").length, 1);
    const saved = panelStateSnapshot(state);
    assert.equal(saved.hudEditing, undefined);
    root.innerHTML = html;
    const loaded = createHudState(panelStateForActor({ hero: saved }, "hero"));
    synchronizeHudLayout(root, loaded, key => key);
    assert.equal(
      root.querySelector(`[data-hud-block="${key}"]`).parentElement.dataset
        .hudLane,
      "actions"
    );
    assert.ok(
      root
        .querySelector(`[data-hud-block="${key}"]`)
        .classList.contains("ws-hud-block-hidden")
    );
    assert.equal(root.querySelector(".ws-hud-layout-menu"), null);
    loaded.hudEditing = true;
    synchronizeHudLayout(root, loaded, key => key);
    changeHudLayout(
      root,
      loaded,
      root.querySelector(".ws-hud-layout-restore button"),
      true
    );
    synchronizeHudLayout(root, loaded, key => key);
    assert.equal(
      root
        .querySelector(`[data-hud-block="${key}"]`)
        .classList.contains("ws-hud-block-hidden"),
      false
    );
  });
}

test("header editor sits beside pin, saves block settings and survives refresh; unowned actors cannot edit", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const control = app.element.querySelector('[data-action="togglehudedit"]');
  assert.equal(control.previousElementSibling.dataset.action, "togglepin");
  await app.hudActions.togglehudedit();
  assert.equal(control.getAttribute("aria-pressed"), "true");
  assert.ok(app.element.querySelector(".ws-hud-block-grip"));
  await app.hudActions.hudblockhide(
    null,
    app.element.querySelector(
      '[data-hud-block="hp"] [data-action="hudblockhide"]'
    )
  );
  await waitFor(() =>
    f.current
      .get("panelStates")
      [f.actor.uuid]?.hudLayouts?.["regular:info"]?.hidden.includes("hp")
  );
  await app.hudActions.togglehudedit();
  assert.equal(app.element.querySelector(".ws-hud-layout-menu"), null);
  assert.equal(app.element.querySelector(".ws-hud-block-tools"), null);
  await app.close();
  await f.api.open(f.actor);
  assert.ok(
    __adventurerHud.app.element
      .querySelector('[data-hud-block="hp"]')
      .classList.contains("ws-hud-block-hidden")
  );
  f.actor.isOwner = false;
  await __adventurerHud.app.hudActions.togglehudedit();
  assert.equal(
    __adventurerHud.app.element.classList.contains("ws-hud-editing"),
    false
  );
  await __adventurerHud.app.close();
});

test("identity can move above shared senses and keeps its order when the temporary senses block disappears", () => {
  const root = fragment(
    '<div id="ws-combat" class="ws-player-layout"><section class="ws-player-info"><div class="ws-familiar-vision">Seeing through Owl</div><div class="ws-actor-header">Hero</div><div class="ws-health-stack">HP</div></section><section class="ws-player-actions"><div class="ws-combat-actions">Actions</div></section></div>'
  );
  const state = createHudState({ hudEditing: true });
  synchronizeHudLayout(root, state, key => key);
  const identity = root.querySelector('[data-hud-block="identity"]');
  changeHudLayout(
    root,
    state,
    identity.querySelector('[data-hud-direction="up"]')
  );
  synchronizeHudLayout(root, state, key => key);
  const keys = () =>
    [...root.querySelector('[data-hud-lane="info"]').children]
      .filter(node => node.dataset.hudBlock)
      .map(node => node.dataset.hudBlock);
  assert.deepEqual(keys(), ["identity", "shared-senses", "hp"]);
  root.querySelector('[data-hud-block="shared-senses"]').remove();
  synchronizeHudLayout(root, state, key => key);
  assert.deepEqual(keys(), ["identity", "hp"]);
  assert.ok(state.hudLayouts["combat:info"].order.includes("shared-senses"));
});

test("familiar filter requires 2024 mode and native summon provenance, includes off-scene familiars and falls back when disabled", async () => {
  const f = await fixture({ values: { familiarVision2024: true } });
  const spell = {
    id: "summon",
    uuid: `${f.actor.uuid}.Item.summon`,
    system: { identifier: "find-familiar" }
  };
  f.actor.items.set(spell.id, spell);
  const owl = f.npc("owl"),
    other = f.npc("other");
  owl.flags = { dnd5e: { summon: { origin: spell.uuid } } };
  other.flags = {
    dnd5e: { summon: { origin: "Actor.someone-else.Item.summon" } }
  };
  f.token(other, "other");
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglecompanions();
  assert.ok(app.element.querySelector('[data-companion-filter="familiars"]'));
  await app.hudActions.companionfilter(null, {
    dataset: { companionFilter: "familiars" }
  });
  assert.equal(app.element.querySelectorAll(".ws-companion-row").length, 1);
  assert.ok(app.element.querySelector(`[data-companion-uuid="${owl.uuid}"]`));
  f.current.set("familiarVision2024", false);
  await app.hudActions.togglefavorites();
  assert.equal(
    app.element.querySelector('[data-companion-filter="familiars"]'),
    null
  );
  assert.equal(
    app.element
      .querySelector('[data-companion-filter="scene"]')
      .getAttribute("aria-pressed"),
    "true"
  );
  assert.equal(app.element.querySelectorAll(".ws-companion-row").length, 1);
  await app.close();
});

test("individual action tabs hide independently and restore while absent from the current native categories", () => {
  const root = fragment(
    '<div id="ws-combat" class="ws-player-layout"><section class="ws-player-info"><div class="ws-actor-header">Hero</div></section><section class="ws-player-actions"><div class="ws-combat-actions"><div class="ws-combat-filters"><button data-category="weapons"><span>Weapons</span></button><button data-category="spells"><span>Spells</span></button></div></div></section></div>'
  );
  const state = createHudState({ hudEditing: true });
  synchronizeHudLayout(root, state, key => key);
  const tab = root.querySelector('[data-hud-block="tab:spells"]');
  changeHudLayout(
    root,
    state,
    tab.querySelector('[data-action="hudblockhide"]'),
    true
  );
  synchronizeHudLayout(root, state, key => key);
  assert.ok(tab.classList.contains("ws-hud-block-hidden"));
  assert.equal(
    root
      .querySelector('[data-hud-block="tab:weapons"]')
      .classList.contains("ws-hud-block-hidden"),
    false
  );
  assert.equal(
    root
      .querySelector('[data-hud-block="actions"]')
      .classList.contains("ws-hud-block-hidden"),
    false
  );
  tab.remove();
  synchronizeHudLayout(root, state, key => key);
  changeHudLayout(
    root,
    state,
    root.querySelector(".ws-hud-layout-restore button"),
    true
  );
  assert.deepEqual(state.hudLayouts["combat:tabs"].hidden, []);
});

test("closing while editing asks once and cancellation keeps the session open", async () => {
  const f = await hudFixture();
  let accept = false,
    prompts = 0;
  foundry.applications.api.DialogV2.confirm = async options => {
    prompts++;
    assert.ok(options.content);
    return accept;
  };
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglehudedit();
  await app.close();
  assert.equal(app.rendered, true);
  assert.equal(app.element.classList.contains("ws-hud-editing"), true);
  accept = true;
  await app.close();
  assert.equal(app.rendered, false);
  assert.equal(prompts, 2);
});

test("compact rests retain independent editing, hiding and saved column placement", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  const rests = () => app.element.querySelector('[data-hud-block="rests"]');
  assert.equal(rests().parentElement.className, "ws-actor-inspiration-slot");
  assert.equal(
    rests().querySelector('[data-action="shortrest"]').disabled,
    false
  );
  await app.hudActions.togglehudedit();
  assert.equal(rests().parentElement.dataset.hudLane, "info");
  await app.hudActions.hudblockmove(
    null,
    rests().querySelector('[data-hud-direction="column"]')
  );
  await app.hudActions.togglehudedit();
  assert.equal(rests().parentElement.dataset.hudLane, "actions");
  await waitFor(() =>
    f.current
      .get("panelStates")
      [f.actor.uuid]?.hudLayouts?.["regular:actions"]?.order.includes("rests")
  );
  await app.close();
  await f.api.open(f.actor);
  assert.equal(
    __adventurerHud.app.element.querySelector('[data-hud-block="rests"]')
      .parentElement.dataset.hudLane,
    "actions"
  );
  await __adventurerHud.app.close();
});

test("hiding identity leaves independently visible rest controls available", async () => {
  const f = await hudFixture();
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.togglehudedit();
  await app.hudActions.hudblockhide(
    null,
    app.element.querySelector(
      '[data-hud-block="identity"] [data-action="hudblockhide"]'
    )
  );
  await app.hudActions.togglehudedit();
  const rests = app.element.querySelector('[data-hud-block="rests"]');
  assert.equal(rests.closest(".ws-hud-block-hidden"), null);
  assert.equal(rests.querySelectorAll("button[data-action]").length, 2);
  await app.close();
});
