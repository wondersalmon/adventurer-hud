import assert from "node:assert/strict";
import test from "node:test";
import { createPanelPreferences } from "../scripts/hud/panel-preferences.js";
import { createGmSelection } from "../scripts/hud/gm/gm-selection.js";
import { createHudState } from "../scripts/hud/state.js";

test("GM document bursts share one selection sync and discard superseded work", async () => {
  let syncs = 0;
  let current = true;
  const followed = [];
  const actor = {};
  const combatant = { id: "npc", token: { actor, uuid: "Token.npc" } };
  const selection = createGmSelection({
    controller: {
      isGM: () => true,
      sync: options => {
        syncs++;
        followed.push(options.follow);
        return combatant;
      }
    },
    combatant,
    actorContext: { actor, tokenUuid: "Token.npc" },
    getApp: () => ({ rendered: true }),
    isCurrent: () => current,
    scheduler: { schedule() {} },
    readSetting: () => false,
    openHud: async () => {},
    controlledTokens: () => []
  });
  for (let i = 0; i < 10; i++)
    selection.scheduleCombatChange({ follow: false });
  assert.equal(syncs, 0);
  await Promise.resolve();
  assert.equal(syncs, 1);
  assert.deepEqual(followed, [false]);
  selection.scheduleCombatChange({ follow: false });
  selection.scheduleCombatChange();
  await Promise.resolve();
  assert.deepEqual(followed, [false, true]);
  selection.scheduleCombatChange();
  current = false;
  await Promise.resolve();
  assert.equal(syncs, 2);
});

test("panel preferences keep player and synthetic token state independent", async () => {
  let saved = { "Actor.hero": { currentView: "inventory" } };
  const settings = {
    readSetting: key => (key === "panelStates" ? saved : true),
    writeSetting: async (_key, value) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      saved = value;
    }
  };
  const first = createPanelPreferences({
    ...settings,
    actorUuid: "Actor.hero",
    tokenUuid: "Token.first",
    gmActive: true
  });
  const second = createPanelPreferences({
    ...settings,
    actorUuid: "Actor.hero",
    tokenUuid: "Token.second",
    gmActive: true
  });
  await Promise.all([
    first.save(createHudState({ combatCategory: "weapons" })),
    second.save(createHudState({ combatCategory: "spells" }))
  ]);
  assert.equal(saved["gm:Token.first"].combatCategory, "weapons");
  assert.equal(saved["gm:Token.second"].combatCategory, "spells");
  assert.equal(saved["Actor.hero"].currentView, "inventory");
  const restored = createPanelPreferences({
    ...settings,
    actorUuid: "Actor.hero",
    gmActive: false
  });
  assert.equal(restored.initialState.currentView, "inventory");
  assert.equal(restored.initialState.proficientSkillsOnly, true);
  assert.equal(
    createPanelPreferences({
      ...settings,
      actorUuid: "Actor.hero",
      tokenUuid: "Token.second",
      gmActive: true
    }).initialState.combatCategory,
    "spells"
  );
});

test("panel writes capture snapshots in order and recover after a failed write", async t => {
  t.mock.method(console, "warn", () => {});
  let saved = {};
  const writes = [];
  const preferences = createPanelPreferences({
    actorUuid: "Actor.hero",
    gmActive: false,
    readSetting: key => (key === "panelStates" ? saved : false),
    writeSetting: async (_key, value) => {
      writes.push(value);
      if (writes.length === 1) throw new Error("storage failure");
      saved = value;
    }
  });
  const state = createHudState({ currentView: "inventory" });
  const failed = preferences.save(state);
  state.currentView = "spells";
  const next = preferences.save(state);
  state.currentView = "skills";
  await assert.rejects(failed, /storage failure/);
  await next;
  assert.equal(writes[0]["Actor.hero"].currentView, "inventory");
  assert.equal(saved["Actor.hero"].currentView, "spells");
  await preferences.save(state);
  assert.equal(saved["Actor.hero"].currentView, "skills");
});

test("GM selection coalesces opens and ignores callbacks from superseded sessions", async () => {
  const actor = { uuid: "Actor.npc" };
  const combatant = { id: "npc", token: { uuid: "Token.npc", actor } };
  let next = combatant;
  let current = true;
  let following = false;
  let opens = 0,
    syncs = 0,
    schedules = 0,
    resumes = 0,
    choices = 0;
  let resolveOpen;
  const selection = createGmSelection({
    controller: {
      isGM: () => true,
      sync: () => {
        syncs++;
        return next;
      },
      resumeFollow: () => resumes++,
      chooseCombat: () => {
        choices++;
        return true;
      }
    },
    combatant,
    actorContext: { actor, tokenUuid: "Token.npc" },
    getApp: () => ({ rendered: true }),
    isCurrent: () => current,
    scheduler: { schedule: () => schedules++ },
    controlledTokens: () => [],
    readSetting: () => following,
    openHud: () => {
      opens++;
      return new Promise(resolve => {
        resolveOpen = resolve;
      });
    }
  });
  selection.onCombatChange();
  assert.equal(schedules, 1);
  // Same UUID, new synthetic Actor instance must rebuild the actor session.
  next = { ...combatant, token: { ...combatant.token, actor: { ...actor } } };
  selection.onCombatChange();
  selection.onCombatChange();
  const opening = selection.reopen();
  assert.equal(opens, 1);
  current = false;
  const previousSyncs = syncs;
  selection.onCombatChange();
  following = true;
  selection.syncPreferences();
  await selection.selectCombat("other");
  assert.equal(syncs, previousSyncs);
  assert.equal(resumes, 0);
  assert.equal(choices, 0);
  resolveOpen();
  await opening;
  await selection.reopen();
  assert.equal(opens, 1);
  // The active session resumes follow once when the preference changes.
  current = true;
  next = combatant;
  selection.syncPreferences();
  selection.syncPreferences();
  assert.equal(resumes, 1);
  assert.equal(schedules, 2);
});
