export const PLAYER_WINDOW_DEFAULTS = Object.freeze({
  left: 0,
  top: 710,
  width: 640,
  height: 500
});

export function defaultGmWindowGeometry(viewport) {
  const width = Math.min(1000, Math.max(270, viewport.width));
  const height = Math.min(450, Math.max(180, viewport.height));
  return {
    width,
    height,
    ...bottomWindowPosition({ width, height }, viewport)
  };
}

export function bottomWindowPosition(rect, viewport) {
  return {
    left: 0,
    top: Math.max(0, viewport.height - rect.height)
  };
}

export function playerWindowPosition(rect, viewport) {
  return {
    left: PLAYER_WINDOW_DEFAULTS.left,
    top: Math.min(
      PLAYER_WINDOW_DEFAULTS.top,
      Math.max(0, viewport.height - rect.height)
    )
  };
}

export function defaultPlayerWindowGeometry(viewport) {
  const width = Math.min(
    PLAYER_WINDOW_DEFAULTS.width,
    Math.max(270, viewport.width)
  );
  const height = Math.min(
    PLAYER_WINDOW_DEFAULTS.height,
    Math.max(350, viewport.height)
  );
  return {
    width,
    height,
    ...playerWindowPosition({ width, height }, viewport)
  };
}

export function normalizeWindowGeometry(
  saved,
  { defaultWidth, viewportHeight, viewportWidth, minimumHeight = 180 }
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
        Math.max(minimumWidth, viewportWidth)
      )
    : defaultWidth;
  const height = Number.isFinite(savedHeight)
    ? Math.min(
        Math.max(minimumHeight, savedHeight),
        Math.max(minimumHeight, viewportHeight)
      )
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

/** Snap moved axes to the viewport without changing window dimensions. */
export function snapWindowPosition(
  position,
  current,
  viewport,
  threshold = 12
) {
  const next = { ...position };
  for (const [axis, size] of [
    ["left", "width"],
    ["top", "height"]
  ]) {
    if (!Number.isFinite(next[axis])) continue;
    const end = Math.max(
      0,
      viewport[size] - (next[size] ?? current?.[size] ?? 0)
    );
    if (Math.abs(next[axis]) <= threshold) next[axis] = 0;
    else if (Math.abs(next[axis] - end) <= threshold) next[axis] = end;
  }
  return next;
}
