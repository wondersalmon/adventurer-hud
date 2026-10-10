import { createHudApplicationClass } from "./window-controls.js";
import { activateHudWindow } from "./window-session.js";
import {
  defaultPlayerWindowGeometry,
  defaultGmWindowGeometry,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "./geometry.js";
import {
  flushWindowGeometry,
  getWindowGeometry,
  saveWindowGeometry
} from "../../window-geometry.js";
import { getSetting, setSetting, SETTINGS } from "../../settings-access.js";

function windowControls(t, gmActive) {
  return [
    ...(game.user?.isGM
      ? [
          {
            icon: gmActive ? "fa-solid fa-user" : "fa-solid fa-dragon",
            label: t(gmActive ? "Window.SwitchToPlayer" : "Window.SwitchToGm"),
            action: "togglepreset"
          },
          {
            icon: "fa-solid fa-dragon",
            label: t("Settings.GM.Name"),
            action: "gmsettings"
          }
        ]
      : []),
    ...(!gmActive
      ? [
          {
            icon: "fa-solid fa-arrows-left-right",
            label: t("Window.ToggleModeNavigation"),
            action: "togglemodes"
          }
        ]
      : []),
    { icon: "fa-solid fa-gear", label: t("Settings.Open"), action: "settings" },
    {
      icon: "fa-solid fa-wrench",
      label: t("Settings.Troubleshooting.Name"),
      action: "troubleshooting"
    }
  ];
}

// One window setup for player, populated GM and empty GM sessions.
export function createHudWindow({
  state,
  reusedApp,
  gmActive,
  DialogV2,
  t,
  title,
  content,
  currentMode = () => "regular"
}) {
  let app = reusedApp;
  const pinSetting = gmActive ? SETTINGS.gmPinWindow : SETTINGS.pinWindow;
  let pinned = Boolean(getSetting(pinSetting));
  let closeOnEscape = Boolean(getSetting(SETTINGS.closeOnEscape));
  let geometryMode = reusedApp?.hudGeometryMode ?? currentMode();
  let separateSizes = Boolean(getSetting(SETTINGS.separateModeSizes));
  const fontSize = getSetting(SETTINGS.fontSize) || "medium";
  const defaultPosition = () =>
    gmActive
      ? defaultGmWindowGeometry({
          width: window.innerWidth,
          height: window.innerHeight
        })
      : defaultPlayerWindowGeometry({
          width: window.innerWidth,
          height: window.innerHeight
        });
  const storePosition = position => {
    const geometry = storedWindowGeometry(position);
    if (!geometry) return;
    state.position = geometry;
    saveWindowGeometry(geometry, { gmActive, mode: geometryMode });
  };
  const syncMode = mode => {
    const enabled = Boolean(getSetting(SETTINGS.separateModeSizes));
    const changed = geometryMode !== mode;
    if (changed && !gmActive && separateSizes && app?.rendered)
      storePosition(app.position);
    geometryMode = mode;
    app.hudGeometryMode = mode;
    const applySize = changed || enabled !== separateSizes;
    separateSizes = enabled;
    if (!applySize || !enabled || gmActive || pinned || !app?.rendered) return;
    const saved = getWindowGeometry(false, mode);
    const geometry = normalizeWindowGeometry(
      {
        ...app.position,
        width: saved.width ?? app.position.width,
        height: saved.height ?? app.position.height
      },
      {
        defaultWidth: defaultPosition().width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        minimumHeight: 350
      }
    );
    app.setPosition(geometry);
    storePosition(app.position);
  };
  const setPinned = value => {
    if (value && app?.rendered) {
      const rect = app.element.getBoundingClientRect?.();
      if (rect?.width > 0 && rect?.height > 0) {
        const previous = pinned;
        pinned = false;
        try {
          app.setPosition({
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        } finally {
          pinned = previous;
        }
      }
    }
    pinned = Boolean(value);
  };

  return {
    syncMode,
    create(actions) {
      if (!app) {
        const Hud = createHudApplicationClass({
          ApplicationV2: foundry.applications.api.ApplicationV2,
          DialogV2,
          document,
          getPinLabel: value => t(value ? "Window.Unpin" : "Window.Pin"),
          isPinned: () => app.hudPinState?.() ?? pinned,
          editingCloseConfig: () => ({
            window: { title: t("HudLayout.CloseTitle") },
            content: `<p>${t("HudLayout.CloseWarning")}</p>`
          }),
          allowCloseOnEscape: () => app.hudEscapeState?.() ?? closeOnEscape,
          shouldSlide: () => Boolean(getSetting(SETTINGS.slidePanel))
        });
        const routes = Object.fromEntries(
          Object.keys(actions).map(key => [
            key,
            function (...args) {
              return app.hudActions?.[key]?.apply(app, args);
            }
          ])
        );
        app = new Hud({
          classes: [
            "ws-rolls-dialog",
            `ws-font-${String(fontSize).toLowerCase()}`
          ],
          window: {
            title,
            resizable: true,
            controls: windowControls(t, gmActive)
          },
          position: {
            ...defaultPosition(),
            ...normalizeWindowGeometry(
              {
                ...defaultPosition(),
                ...getWindowGeometry(gmActive, geometryMode)
              },
              {
                defaultWidth: defaultPosition().width,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                minimumHeight: gmActive ? 180 : 350
              }
            )
          },
          content,
          actions: routes,
          buttons: [{ action: "close", label: t("Window.Close") }]
        });
      }
      app.hudActions = actions;
      app.hudPinState = () => pinned;
      app.hudEscapeState = () => closeOnEscape;
      app.hudMinimumHeight = () => (gmActive ? 180 : 350);
      app.hudGeometryMode = geometryMode;
      app.hudGmActive = gmActive;
      return app;
    },
    async togglePin() {
      setPinned(!pinned);
      await setSetting(pinSetting, pinned);
      app.updatePinControl();
    },
    async resetWindow() {
      if (pinned) return;
      app.setPosition(defaultPosition());
      storePosition(app.position);
      await flushWindowGeometry();
    },
    async activate(options) {
      await activateHudWindow({
        ...options,
        app,
        t,
        gmActive,
        pinned,
        pinSetting,
        state,
        content,
        title,
        fontSize,
        theme: getSetting(SETTINGS.theme),
        reuse: Boolean(reusedApp),
        visualEffectsEnabled: getSetting(SETTINGS.showVisualEffects),
        setPinned,
        setCloseOnEscape: value => {
          closeOnEscape = Boolean(value);
        },
        storePosition
      });
      syncMode(currentMode());
    }
  };
}
