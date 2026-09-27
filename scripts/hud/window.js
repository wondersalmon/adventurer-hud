import { createHudApplicationClass } from "./window-controls.js";
import { activateHudWindow } from "./window-session.js";
import {
  playerWindowPosition,
  defaultPlayerWindowGeometry,
  bottomWindowPosition,
  defaultGmWindowGeometry,
  normalizeWindowGeometry,
  storedWindowGeometry
} from "./geometry.js";
import {
  flushWindowGeometry,
  getSetting,
  getWindowGeometry,
  saveWindowGeometry,
  setSetting,
  SETTINGS
} from "../settings.js";

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
    {
      icon: "fa-solid fa-arrow-rotate-left",
      label: t("Window.ResetHint"),
      action: "resetwindow"
    },
    { icon: "fa-solid fa-gear", label: t("Settings.Open"), action: "settings" }
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
  content
}) {
  let app = reusedApp;
  const pinSetting = gmActive ? SETTINGS.gmPinWindow : SETTINGS.pinWindow;
  let pinned = Boolean(getSetting(pinSetting));
  let closeOnEscape = Boolean(getSetting(SETTINGS.closeOnEscape));
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
    saveWindowGeometry(geometry, { gmActive });
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
    create(actions) {
      if (!app) {
        const Hud = createHudApplicationClass({
          DialogV2,
          document,
          getPinLabel: value => t(value ? "Window.Unpin" : "Window.Pin"),
          isPinned: () => app.hudPinState?.() ?? pinned,
          allowCloseOnEscape: () => app.hudEscapeState?.() ?? closeOnEscape
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
            ...normalizeWindowGeometry(getWindowGeometry(gmActive), {
              defaultWidth: defaultPosition().width,
              viewportHeight: window.innerHeight,
              viewportWidth: window.innerWidth,
              minimumHeight: gmActive ? 180 : 350
            })
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
      return app;
    },
    async togglePin() {
      setPinned(!pinned);
      await setSetting(pinSetting, pinned);
      app.updatePinControl();
    },
    async resetWindow() {
      if (pinned) return;
      const { width, height } = defaultPosition();
      app.setPosition({ width, height });
      await new Promise(resolve => requestAnimationFrame(resolve));
      const rect = app.element.getBoundingClientRect();
      const positionWindow = gmActive
        ? bottomWindowPosition
        : playerWindowPosition;
      const { left, top } = positionWindow(rect, {
        width: window.innerWidth,
        height: window.innerHeight
      });
      app.setPosition({ left, top });
      storePosition({
        left,
        top,
        width: rect.width,
        height: rect.height
      });
      await flushWindowGeometry();
    },
    activate(options) {
      return activateHudWindow({
        ...options,
        app,
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
        showWindowSize: getSetting(SETTINGS.debugWindowSize),
        windowSizeLabel: t("Window.DimensionsHint"),
        setPinned,
        setCloseOnEscape: value => {
          closeOnEscape = Boolean(value);
        },
        storePosition
      });
    }
  };
}
