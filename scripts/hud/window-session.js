import { flushWindowGeometry, SETTINGS } from "../settings.js";
import { subscribeHudDocuments } from "./subscriptions.js";

export async function activateHudWindow({
  actor,
  app,
  canRollActor,
  changeResource,
  isCloseAfterRoll,
  readVisibility,
  refreshHud,
  refreshScheduler,
  setCloseAfterRoll,
  setPinned,
  state,
  storePosition,
  visibility
}) {
  app.applySetting = (key, value) => {
    if (key === SETTINGS.closeAfterRoll) {
      setCloseAfterRoll(Boolean(value));
      const control = app.options?.window?.controls?.find(
        entry => entry.action === "togglecloseafterroll"
      );
      if (control) {
        control.icon = isCloseAfterRoll()
          ? "fa-solid fa-toggle-on"
          : "fa-solid fa-toggle-off";
      }
    }
    if (key === SETTINGS.pinWindow) {
      setPinned(Boolean(value));
      app.updatePinControl();
    }
  };

  app.refreshFromSettings = () => {
    Object.assign(visibility, readVisibility());
    refreshHud();
  };

  await app.render({ force: true });
  state.app = app;

  app.element.addEventListener("contextmenu", event => {
    const target = event.target.closest?.(".ws-resource-link");
    if (!target || !event.shiftKey || !canRollActor) return;

    event.preventDefault();
    const item = target.dataset.itemId
      ? actor.items.get(target.dataset.itemId)
      : null;

    void changeResource({
      amount: 1,
      direction: "restore",
      item,
      resourceId: target.dataset.resourceId
    }).catch(error => {
      console.error("Rolls HUD | quick resource restore", error);
      ui.notifications.error(`Rolls HUD: ${error?.message ?? error}`);
    });
  });

  app.addEventListener("position", () => storePosition(app.position));

  const unsubscribeDocuments = subscribeHudDocuments({
    actor,
    hooks: Hooks,
    scheduleRefresh: refreshScheduler.schedule
  });

  app.addEventListener(
    "close",
    () => {
      void flushWindowGeometry();
      refreshScheduler.cancel();
      unsubscribeDocuments();

      if (state.app === app) {
        state.app = null;
        state.actor = null;
        state.actorUuid = null;
        state.tokenUuid = null;
      }
    },
    { once: true }
  );
}
