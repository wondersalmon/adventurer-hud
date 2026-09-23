export function healthWidths({ value = 0, temp = 0, max = 0 }) {
  const scale = Math.max(1, max, value + temp);
  return {
    normal: Math.max(0, (value / scale) * 100),
    temp: Math.max(0, (temp / scale) * 100)
  };
}

export function hpChange(previous, next) {
  if (!previous || !next) return null;
  const delta = next.value + next.temp - previous.value - previous.temp;
  if (!delta) return null;
  return {
    delta,
    kind: delta > 0 ? "heal" : "damage",
    previousWidths: healthWidths(previous),
    nextWidths: healthWidths(next)
  };
}

export function syncHealthAppearance(element, hp, enabled = true) {
  element?.classList.toggle(
    "ws-unconscious",
    enabled && Number(hp?.value ?? 0) <= 0
  );
}
