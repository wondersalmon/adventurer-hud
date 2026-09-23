export function normalizeWindowGeometry(
  saved,
  { defaultWidth, viewportHeight, viewportWidth }
) {
  const left = Number(saved?.left);
  const top = Number(saved?.top);
  const savedWidth = Number(saved?.width);
  const savedHeight = Number(saved?.height);

  if (!Number.isFinite(left) || !Number.isFinite(top)) return {};

  const minimumWidth = 270;
  const width = Number.isFinite(savedWidth)
    ? Math.min(
        Math.max(minimumWidth, savedWidth),
        Math.max(minimumWidth, viewportWidth - 16)
      )
    : defaultWidth;
  const height = Number.isFinite(savedHeight)
    ? Math.min(Math.max(180, savedHeight), Math.max(180, viewportHeight - 16))
    : null;

  return {
    width,
    ...(height === null ? {} : { height }),
    left: Math.min(Math.max(0, left), Math.max(0, viewportWidth - width)),
    top: Math.min(
      Math.max(0, top),
      Math.max(0, viewportHeight - (height ?? 80))
    )
  };
}

export function storedWindowGeometry(position) {
  const left = Number(position?.left);
  const top = Number(position?.top);
  const width = Number(position?.width);
  const height = Number(position?.height);

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  return {
    left,
    top,
    ...(Number.isFinite(width) ? { width } : {}),
    ...(Number.isFinite(height) ? { height } : {})
  };
}

export function centeredWindowPosition(rect, viewport) {
  return {
    left: Math.max(0, Math.round((viewport.width - rect.width) / 2)),
    top: Math.max(0, Math.round((viewport.height - rect.height) / 2))
  };
}
