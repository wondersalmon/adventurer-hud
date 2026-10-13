/** Resolve animation preferences without modifying their saved values. */
export function effectiveAnimationSettings(
  {
    showVisualEffects = true,
    hpAnimation = "full",
    turnAnimation = "full"
  } = {},
  reducedMotion = false
) {
  const enabled = Boolean(showVisualEffects) && !reducedMotion;
  const mode = (value, choices) =>
    enabled ? (choices.includes(value) ? value : "full") : "off";
  return {
    enabled,
    hp: mode(hpAnimation, ["off", "bar", "full"]),
    turn: mode(turnAnimation, ["off", "soft", "full"]),
    diceTray: enabled ? "full" : "off"
  };
}

/** Session-scoped system preference listener; no persistent observer. */
export function watchReducedMotion(viewport, onChange) {
  const media = viewport?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const changed = () => onChange(Boolean(media?.matches));
  media?.addEventListener?.("change", changed);
  changed();
  return () => media?.removeEventListener?.("change", changed);
}
