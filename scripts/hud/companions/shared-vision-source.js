/** Native eligibility is extended on one canvas token, never on its document. */
export function supportsSharedVision(placeable) {
  return missingSharedVisionCapabilities(placeable).length === 0;
}

export function missingSharedVisionCapabilities(placeable) {
  const descriptor =
    placeable && Object.getOwnPropertyDescriptor(placeable, "_isVisionSource");
  return [
    typeof placeable?._isVisionSource !== "function" && "Token._isVisionSource",
    typeof placeable?.initializeVisionSource !== "function" &&
      "Token.initializeVisionSource",
    typeof canvas.perception?.update !== "function" &&
      "canvas.perception.update",
    (!placeable ||
      !(descriptor
        ? descriptor.configurable
        : Object.isExtensible(placeable))) &&
      "Token instance extension"
  ].filter(Boolean);
}

/** Retain native vision data, walls, detection modes and movement updates. */
export function createSharedVisionSource(placeable, isAllowed) {
  if (!supportsSharedVision(placeable))
    throw new Error(
      `Native token vision API is unavailable: ${missingSharedVisionCapabilities(placeable).join(", ")}`
    );
  const descriptor = Object.getOwnPropertyDescriptor(
    placeable,
    "_isVisionSource"
  );
  const original = placeable._isVisionSource;
  let enabled = true;
  // _isVisionSource is Foundry's protected extension point for source eligibility.
  // Wrapping this instance keeps other tokens and the native source lifecycle intact.
  const eligible = function (...args) {
    return Boolean(
      (enabled && this === placeable && isAllowed()) ||
      original.apply(this, args)
    );
  };
  Object.defineProperty(placeable, "_isVisionSource", {
    configurable: true,
    writable: true,
    value: eligible
  });
  const refresh = () => {
    if (
      canvas.ready === false ||
      placeable.document.parent !== canvas.scene ||
      canvas.tokens?.get?.(placeable.document.id) !== placeable
    )
      return;
    placeable.initializeVisionSource();
    canvas.perception.update({ initializeVision: true });
  };
  return {
    refresh,
    dispose() {
      if (!enabled) return;
      enabled = false;
      // Preserve a newer wrapper installed by another module. Its captured wrapper
      // now delegates to the original method and cannot keep sharing active.
      if (placeable._isVisionSource === eligible) {
        if (descriptor)
          Object.defineProperty(placeable, "_isVisionSource", descriptor);
        else delete placeable._isVisionSource;
      }
      refresh();
    }
  };
}
