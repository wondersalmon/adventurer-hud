export function openSettings(tab) {
  return import("./settings-applications.js").then(settings =>
    settings.openConfigureSettings(tab)
  );
}

export function openGmSettings() {
  if (!game.user?.isGM) return;
  return import("./settings-applications.js").then(settings =>
    settings.openGmSettings()
  );
}

export function openTroubleshooting() {
  return import("./settings-applications.js").then(settings =>
    settings.openTroubleshooting()
  );
}
