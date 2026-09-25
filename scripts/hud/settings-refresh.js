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

export function applyHudSettingChanges({
  app,
  changes,
  refreshControls,
  reopen,
  strategyFor
}) {
  const strategies = new Set();
  for (const [key, value] of changes) {
    const strategy = strategyFor(key);
    strategies.add(strategy);
    if (strategy === "runtime" && app?.rendered) {
      app.applySetting?.(key, value);
    }
  }

  if (strategies.has("controls")) refreshControls();
  if (!app?.rendered) return;
  if (strategies.has("reopen")) reopen();
  else if (strategies.has("content")) app.refreshFromSettings?.();
}
