import assert from "node:assert/strict";
import test from "node:test";

import {
  migrateLegacySettings,
  registerSettings,
  SETTINGS
} from "../scripts/settings.js";

test("manual mode navigation defaults to hidden and migrations are per user", () => {
  const registrations = new Map();

  globalThis.Hooks = { callAll() {} };
  globalThis.game = {
    settings: {
      register(_moduleId, key, config) {
        registrations.set(key, config);
      }
    }
  };

  registerSettings();

  assert.equal(registrations.get(SETTINGS.showModeNavigation)?.default, false);
  assert.equal(registrations.get(SETTINGS.migrationVersion)?.scope, "user");
});

test("version-two migration preserves the manual-navigation preference", async () => {
  const writes = [];

  globalThis.game = {
    settings: {
      get(_moduleId, key) {
        if (key === SETTINGS.migrationVersion) return 1;
        if (key === SETTINGS.showModeNavigation) return true;
        return null;
      },
      async set(_moduleId, key, value) {
        writes.push([key, value]);
        return value;
      }
    }
  };

  await migrateLegacySettings();

  assert.deepEqual(writes, [[SETTINGS.migrationVersion, 2]]);
});
