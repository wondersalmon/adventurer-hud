import assert from "node:assert/strict";
import test from "node:test";

import { selectHudActor } from "../scripts/hud/actor-selection.js";

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
