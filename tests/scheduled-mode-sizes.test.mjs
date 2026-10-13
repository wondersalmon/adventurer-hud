import assert from "node:assert/strict";
import test from "node:test";
import { hudFixture } from "./helpers/hud.mjs";
import { restoreGlobalsAfterEach } from "./helpers/foundry.mjs";
import { flushWindowGeometry } from "../scripts/window-geometry.js";

restoreGlobalsAfterEach();

test("disabling independent mode sizes shares the last resized dimensions and retains both saved modes", async () => {
  const f = await hudFixture({
    combat: true,
    values: {
      showModeNavigation: true,
      separateModeSizes: true,
      windowModeSizes: {
        regular: { width: 400, height: 450 },
        combat: { width: 800, height: 600 }
      }
    }
  });
  await f.api.open(f.actor);
  const app = __adventurerHud.app;
  await app.hudActions.normal();
  assert.equal(app.position.width, 400);
  await game.settings.set("adventurer-hud", "separateModeSizes", false);
  app.setPosition({ width: 610, height: 510 });
  app.storeHudPosition(app.position);
  await flushWindowGeometry();
  await app.hudActions.combatmode();
  assert.equal(app.position.width, 610);
  assert.equal(app.position.height, 510);
  await app.hudActions.normal();
  assert.equal(app.position.width, 610);
  await app.close();
  await f.api.open(f.actor);
  assert.equal(__adventurerHud.app.position.width, 610);
  assert.deepEqual(game.settings.get("adventurer-hud", "windowModeSizes"), {
    regular: { width: 400, height: 450 },
    combat: { width: 800, height: 600 }
  });
  await game.settings.set("adventurer-hud", "separateModeSizes", true);
  await __adventurerHud.app.hudActions.normal();
  assert.equal(__adventurerHud.app.position.width, 400);
  await __adventurerHud.app.hudActions.combatmode();
  assert.equal(__adventurerHud.app.position.width, 800);
  await __adventurerHud.app.close();
});
