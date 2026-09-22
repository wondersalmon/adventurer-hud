export function applyHudSettingChange({
  app,
  key,
  refreshControls,
  reopen,
  strategy,
  value
}) {
  if (strategy === "controls") {
    refreshControls();
    return;
  }

  if (!app?.rendered) return;

  if (strategy === "runtime") {
    app.applySetting?.(key, value);
    return;
  }

  if (strategy === "content") {
    app.refreshFromSettings?.();
    return;
  }

  if (strategy === "reopen") reopen();
}
