export function renderHudMode(mode, renderers) {
  const renderer = renderers[mode] ?? renderers.regular;
  return renderer();
}

export function renderRegularView(view, renderers) {
  const renderer = renderers[view] ?? renderers.main;
  return renderer();
}
