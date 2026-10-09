import assert from "node:assert/strict";
import test from "node:test";
import {
  installSettings,
  restoreGlobalsAfterEach
} from "./helpers/foundry.mjs";
import { hudFixture } from "./helpers/hud.mjs";
import { itemCollection } from "./helpers/rendering.mjs";
import { booleanSettingsEntries } from "../scripts/settings-form.js";
import { getGmSettingGroups } from "../scripts/settings-schema.js";
restoreGlobalsAfterEach();

test("GM combined controls preserve saved preferences and search is a positive independent switch", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      gmFilterActions: false,
      gmAutoAdvance: true,
      gmFollowTurn: true,
      gmHideSearch: false,
      showSearch: false
    }
  });
  const App = f.menus.get("gm").type;
  const app = new App();
  const context = await app._prepareContext();
  const fields = context.groups.flatMap(group => group.settings);
  assert.equal(
    fields.find(field => field.key === "gmActionDisplay").value,
    "all"
  );
  assert.equal(
    fields.find(field => field.key === "gmSelectionMode").value,
    "turn"
  );
  assert.equal(fields.find(field => field.key === "gmHideSearch").value, true);
  await f.menus
    .get("configure")
    .type.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
      object: {
        gmActionDisplay: "items",
        gmSelectionMode: "manual",
        gmHideSearch: false
      }
    });
  assert.equal(f.current.get("gmFilterActions"), true);
  assert.equal(f.current.get("gmActionTypesOnly"), false);
  assert.equal(f.current.get("gmFollowTurn"), false);
  assert.equal(f.current.get("gmAutoAdvance"), false);
  assert.equal(f.current.get("gmHideSearch"), true);
  assert.equal(f.current.get("showSearch"), false);
  assert.throws(() =>
    booleanSettingsEntries(getGmSettingGroups(), { gmActionDisplay: "invalid" })
  );
});

test("troubleshooting moves debug control and confirms geometry reset", async () => {
  const f = installSettings({
    isGM: true,
    values: {
      pinWindow: true,
      gmPinWindow: true,
      windowGeometry: { width: 900 },
      gmWindowGeometry: { width: 1200 }
    }
  });
  const advanced = await new (f.menus.get(
    "configure"
  ).type)()._prepareContext();
  assert.equal(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "debugWindowSize"),
    true
  );
  const companionMenu = f.menus.get("companions");
  assert.equal(companionMenu.restricted, false);
  assert.equal(
    advanced.groups.some(group =>
      group.settings.some(field => field.key === "showCompanions")
    ),
    false
  );
  const companionContext = await new companionMenu.type()._prepareContext();
  const companions = companionContext.groups.find(group =>
    group.settings.some(field => field.key === "showCompanions")
  );
  assert.deepEqual(
    companions.settings.map(field => field.key),
    [
      "showCompanions",
      "showCompanionEffects",
      "companionVisionPan",
      "companionAutoFocus",
      "familiarVision2024"
    ]
  );
  assert.equal(f.registrations.get("playerFooter").default, true);
  assert.equal(f.registrations.get("playerFooter").config, false);
  assert.ok(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "playerFooter")
  );
  assert.equal(
    advanced.groups
      .flatMap(group => group.settings)
      .some(field => field.key === "playerColumnRatio"),
    false
  );
  f.current.set("showCompanions", false);
  const disabled = await new companionMenu.type()._prepareContext();
  for (const key of [
    "showCompanionEffects",
    "companionVisionPan",
    "companionAutoFocus"
  ])
    assert.equal(
      disabled.groups
        .flatMap(group => group.settings)
        .find(field => field.key === key).disabled,
      true
    );
  f.current.set("showCompanions", true);
  assert.equal(f.registrations.get("debugWindowSize").default, false);
  const App = f.menus.get("troubleshooting").type;
  const app = new App();
  assert.equal((await app._prepareContext()).debugWindowSize, undefined);
  f.current.set("debugWindowSize", true);
  app.rendered = true;
  await App.DEFAULT_OPTIONS.actions.close.call(app);
  assert.equal(f.current.get("debugWindowSize"), true);
  assert.equal(app.rendered, false);
  assert.equal(f.registrations.get("twoColumnWidth").config, false);
  assert.equal(f.registrations.get("twoColumnWidth").type, Number);
  assert.deepEqual(f.registrations.get("twoColumnWidth").range, {
    min: 450,
    max: 1200,
    step: 10
  });
  assert.equal(f.registrations.get("separateModeSizes").config, false);
  foundry.applications.api.DialogV2 = { confirm: async () => false };
  await App.DEFAULT_OPTIONS.actions.resetpositions.call(app);
  assert.equal(f.current.get("pinWindow"), true);
  foundry.applications.api.DialogV2.confirm = async () => true;
  await App.DEFAULT_OPTIONS.actions.resetpositions.call(app);
  assert.deepEqual(f.current.get("windowGeometry"), {});
  assert.deepEqual(f.current.get("gmWindowGeometry"), {});
  assert.equal(f.current.get("pinWindow"), false);
  assert.equal(f.current.get("gmPinWindow"), false);
  game.user.isGM = false;
  assert.equal(App.DEFAULT_OPTIONS.actions.resetgm.call(app), undefined);
});

test("GM opens exact player combatant in the same panel and never removes its defeated token", async () => {
  const f = await hudFixture({
    isGM: true,
    values: { gmEnabled: true, showSearch: false, gmHideSearch: false }
  });
  canvas.scene = { id: "scene" };
  const player = {
    ...f.actor,
    uuid: "Scene.scene.Token.hero.Actor.hero",
    type: "character"
  };
  const monster = {
    ...f.actor,
    uuid: "Scene.scene.Token.npc.Actor.npc",
    type: "npc"
  };
  const ability = {
    id: "action",
    name: "Player action",
    type: "feat",
    system: {
      activities: [
        { id: "use", activation: { type: "action" }, type: "utility", use() {} }
      ]
    }
  };
  player.items = itemCollection([ability]);
  const npc = {
    id: "npc",
    sceneId: "scene",
    tokenId: "npc",
    actor: monster,
    token: {
      id: "npc",
      uuid: "Scene.scene.Token.npc",
      parent: canvas.scene,
      actor: monster
    },
    players: []
  };
  let deletions = 0;
  const pc = {
    id: "hero",
    sceneId: "scene",
    tokenId: "hero",
    actor: player,
    defeated: true,
    token: {
      id: "hero",
      uuid: "Scene.scene.Token.hero",
      parent: canvas.scene,
      actor: player,
      delete: async () => deletions++
    },
    players: []
  };
  const combat = {
    id: "battle",
    scene: canvas.scene,
    started: true,
    combatant: npc,
    turns: [npc, pc],
    combatants: itemCollection([npc, pc])
  };
  game.combat = combat;
  game.combats = itemCollection([combat]);
  await f.api.open();
  const app = __adventurerHud.app;
  assert.ok(
    app.element.querySelector(
      '[data-action="gmselect"][data-combatant-id="hero"]'
    )
  );
  await app.hudActions.gmselect(null, { dataset: { combatantId: "hero" } });
  assert.equal(__adventurerHud.app, app);
  assert.equal(__adventurerHud.actor, player);
  assert.match(
    app.element.querySelector(".ws-gm-action-column").textContent,
    /Player action/
  );
  assert.ok(app.element.querySelector('[data-action="searchitems"]'));
  assert.equal(app.element.querySelector('[data-action="gmremove"]'), null);
  await app.hudActions.gmremove();
  assert.equal(deletions, 0);
  f.current.set("gmAutoAdvance", true);
  f.current.set("gmFollowTurn", false);
  await app.hudActions.gmfollow();
  assert.equal(f.current.get("gmAutoAdvance"), false);
  assert.equal(f.current.get("gmFollowTurn"), true);
  assert.equal(__adventurerHud.actor, monster);
  await app.close();
});

test("players save companion settings through their own submenu without changing other settings", async () => {
  const f = installSettings({ values: { showSearch: false, gmEnabled: true } });
  const app = new (f.menus.get("companions").type)();
  const context = await app._prepareContext();
  assert.equal(context.groups.flatMap(group => group.settings).length, 5);
  for (const key of [
    "showCompanionHealth",
    "showCompanionPortraits",
    "showCompanionInitiative"
  ])
    assert.equal(f.registrations.has(key), false);
  await f.menus
    .get("configure")
    .type.DEFAULT_OPTIONS.form.handler.call(app, null, null, {
      object: {
        showCompanions: true,
        showCompanionEffects: false,
        companionAutoFocus: false,
        companionVisionPan: false,
        showSearch: true,
        gmEnabled: false
      }
    });
  assert.equal(f.current.get("companionVisionPan"), false);
  assert.equal(f.current.get("companionAutoFocus"), false);
  assert.equal(f.current.get("showCompanionEffects"), false);
  assert.equal(f.current.get("showSearch"), false);
  assert.equal(f.current.get("gmEnabled"), true);
});
