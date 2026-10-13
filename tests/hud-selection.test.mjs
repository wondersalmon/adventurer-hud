import assert from "node:assert/strict";
import test from "node:test";

import {
  installSettings,
  installDom,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { prepareSettingsGroups } from "../scripts/settings-form.js";
import { getSettingDefaults, SETTINGS } from "../scripts/settings-schema.js";

import { selectHudActor } from "../scripts/hud/actor-selection.js";

restoreGlobalsAfterEach();

test("actor selection keeps only the token belonging to the chosen actor", async () => {
  const previousCanvas = globalThis.canvas;
  const selectedActor = { uuid: "Actor.selected", type: "character" };
  const override = { uuid: "Actor.override", type: "character" };
  const token = { actor: selectedActor };
  globalThis.canvas = { tokens: { controlled: [token] } };

  const context = {
    adapter: { isActorSupported: actor => actor.type === "character" },
    t: key => key,
    tf: key => key
  };
  try {
    assert.deepEqual(await selectHudActor(context), {
      actor: selectedActor,
      token
    });
    assert.deepEqual(
      await selectHudActor({ ...context, actorOverride: override }),
      { actor: override, token: null }
    );
  } finally {
    globalThis.canvas = previousCanvas;
  }
});

test("opening policies use owned available characters and retain token and override priority", async () => {
  const f = installSettings();
  installDom();
  const first = {
    id: "first",
    uuid: "Actor.first",
    name: "First",
    type: "character",
    isOwner: true
  };
  const second = {
    id: "second",
    uuid: "Actor.second",
    name: "Second",
    type: "character",
    isOwner: true
  };
  const actors = [first, second];
  game.actors = actors;
  globalThis.canvas = { tokens: { controlled: [] } };
  let pickers = 0;
  const context = {
    adapter: { isActorSupported: actor => actor?.type === "character" },
    DialogV2: class {
      render() {
        pickers++;
      }
    },
    language: "en",
    t: key => key,
    tf: key => key
  };
  assert.equal(await selectHudActor(context), null);
  assert.equal(pickers, 1);
  assert.equal(f.current.get(SETTINGS.hudActorSelection), "assigned");
  game.user.character = second;
  assert.equal((await selectHudActor(context)).actor, second);
  assert.equal(pickers, 1);
  game.user.character = null;
  f.current.set(SETTINGS.hudActorSelection, "last");
  f.current.set(SETTINGS.lastHudActor, second.uuid);
  assert.equal((await selectHudActor(context)).actor, second);
  f.current.set(SETTINGS.hudActorSelection, "specific");
  f.current.set(SETTINGS.hudPreferredActor, first.uuid);
  assert.equal((await selectHudActor(context)).actor, first);
  first.isOwner = false;
  const third = { ...second, id: "third", uuid: "Actor.third", name: "Third" };
  actors.push(third);
  assert.equal(await selectHudActor(context), null);
  assert.equal(pickers, 2);
  first.isOwner = true;
  f.current.set(SETTINGS.hudPreferredActor, "Actor.deleted");
  assert.equal(await selectHudActor(context), null);
  assert.equal(pickers, 3);
  f.current.set(SETTINGS.hudPreferredActor, first.uuid);
  const token = { actor: second };
  canvas.tokens.controlled = [token];
  assert.deepEqual(await selectHudActor(context), { actor: second, token });
  assert.deepEqual(await selectHudActor({ ...context, actorOverride: third }), {
    actor: third,
    token: null
  });
});

test("single opening selector lists owned characters and retains an unavailable preferred UUID", () => {
  installSettings();
  const owned = {
    uuid: "Actor.owned",
    type: "character",
    isOwner: true,
    name: "ADVENTURER_HUD.literal"
  };
  game.actors = [
    owned,
    { ...owned, uuid: "Actor.other", isOwner: false },
    { ...owned, uuid: "Actor.npc", type: "npc" }
  ];
  const values = {
    ...getSettingDefaults(),
    hudActorSelection: "specific",
    hudPreferredActor: "Actor.missing"
  };
  const read = () =>
    prepareSettingsGroups({
      groups: { behavior: [SETTINGS.hudActorSelection] },
      readValue: key => values[key],
      t: key => `translated:${key}`
    })[0].settings;
  assert.equal(read().length, 1);
  assert.equal(read()[0].key, SETTINGS.hudActorSelection);
  assert.equal(read()[0].value, "Actor.missing");
  assert.equal(read()[0].disabled, false);
  const choices = read()[0].choices;
  assert.deepEqual(
    choices.map(choice => choice.value),
    ["assigned", "prompt", "last", "Actor.owned", "Actor.missing"]
  );
  assert.equal(
    choices.find(choice => choice.value === owned.uuid).label,
    owned.name
  );
  assert.equal(
    choices.find(choice => choice.value === "Actor.missing").selected,
    true
  );
  values.hudActorSelection = "prompt";
  assert.equal(read()[0].value, "prompt");
  assert.equal(values.hudPreferredActor, "Actor.missing");
});
