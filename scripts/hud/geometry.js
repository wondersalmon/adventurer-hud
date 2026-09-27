export function defaultGmWindowGeometry(viewport) {
  const width = Math.min(
    Math.max(270, Math.round(viewport.width * 0.78)),
    Math.max(270, viewport.width - 32)
  );
  const height = Math.min(
    Math.max(180, Math.round(viewport.height * 0.45)),
    Math.max(180, viewport.height - 32)
  );
  return {
    width,
    height,
    ...bottomWindowPosition({ width, height }, viewport)
  };
}

export function bottomWindowPosition(rect, viewport) {
  return {
    left: Math.max(0, Math.round((viewport.width - rect.width) / 2)),
    top: Math.max(0, viewport.height - rect.height - 16)
  };
}

export function playerWindowPosition(rect, viewport) {
  return {
    left: 0,
    top: Math.max(
      0,
      viewport.height -
        rect.height -
        Math.max(16, Math.round(viewport.height * 0.09))
    )
  };
}

export function defaultPlayerWindowGeometry(viewport) {
  const width = Math.min(320, Math.max(270, viewport.width - 16));
  const height = Math.min(
    Math.max(350, Math.round(viewport.height * 0.52)),
    Math.max(350, viewport.height - 32)
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
        Math.max(minimumWidth, viewportWidth - 16)
      )
    : defaultWidth;
  const height = Number.isFinite(savedHeight)
    ? Math.min(
        Math.max(minimumHeight, savedHeight),
        Math.max(minimumHeight, viewportHeight - 16)
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

export function centeredWindowPosition(rect, viewport) {
  return {
    left: Math.max(0, Math.round((viewport.width - rect.width) / 2)),
    top: Math.max(0, Math.round((viewport.height - rect.height) / 2))
  };
}
