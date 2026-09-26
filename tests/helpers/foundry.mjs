import assert from "node:assert/strict";
import { beforeEach, afterEach } from "node:test";
import { parseHTML } from "linkedom";
import { registerSettings } from "../../scripts/settings.js";

const GLOBALS = [
  "CONST",
  "game",
  "foundry",
  "Hooks",
  "CONFIG",
  "ui",
  "canvas",
  "document",
  "window",
  "fromUuid",
  "fetch",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "__adventurerHud"
];

export function restoreGlobalsAfterEach() {
  let snapshot;
  beforeEach(() => {
    snapshot = new Map(
      GLOBALS.map(key => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key)
      ])
    );
  });
  afterEach(() => {
    for (const [key, descriptor] of snapshot) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

export function installSettings({
  isGM = false,
  systemId = "dnd5e",
  values = {},
  onEvent = () => {}
} = {}) {
  const registrations = new Map();
  const current = new Map(Object.entries(values));
  const menus = new Map();
  const writes = [];
  const notifications = [];
  class ApplicationV2 {
    async render() {
      this.rendered = true;
      this.context = await this._prepareContext?.();
      this.renderCount = (this.renderCount ?? 0) + 1;
      return this;
    }
    close() {
      this.rendered = false;
    }
  }
  globalThis.Hooks = { callAll: onEvent };
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: Base => class extends Base {}
      }
    }
  };
  globalThis.ui = {
    notifications: Object.fromEntries(
      ["warn", "error", "info"].map(level => [
        level,
        message => notifications.push([level, message])
      ])
    )
  };
  globalThis.game = {
    user: { isGM },
    system: { id: systemId },
    i18n: { lang: "en", localize: key => key, format: key => key },
    settings: {
      settings: {
        get: id => registrations.get(id.slice("adventurer-hud.".length))
      },
      register(_moduleId, key, config) {
        registrations.set(key, config);
        if (!current.has(key)) current.set(key, config.default);
      },
      registerMenu: (_moduleId, key, config) => menus.set(key, config),
      get(_moduleId, key) {
        assert.ok(registrations.has(key), `Unregistered setting: ${key}`);
        return current.get(key);
      },
      async set(_moduleId, key, value) {
        assert.ok(registrations.has(key), `Unregistered setting: ${key}`);
        current.set(key, value);
        writes.push([key, value]);
        registrations.get(key).onChange?.(value);
      }
    }
  };
  registerSettings();
  return { registrations, current, menus, writes, notifications };
}

export function installDom() {
  const { document, window } = parseHTML(
    "<!doctype html><html><body></body></html>"
  );
  globalThis.document = document;
  globalThis.window = { innerWidth: 1000, innerHeight: 800 };
  return { document, window };
}
