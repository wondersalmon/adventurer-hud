export function resolveHpInput(input, current, max = Infinity) {
  const text = String(input ?? "").trim();
  if (!text) return current;
  if (!/^[+-]?\d+$/.test(text)) return null;

  const amount = Number(text.replace(/^[+-]/, ""));
  if (!Number.isSafeInteger(amount)) return null;

  const value = text.startsWith("+")
    ? current + amount
    : text.startsWith("-")
      ? current - amount
      : amount;
  return Math.min(Math.max(0, value), Math.max(0, max));
}

export function resolveHpChanges({ valueInput, tempInput, value, temp, max }) {
  const nextTemp = resolveHpInput(tempInput, temp);
  if (nextTemp === null) return null;

  const hpText = String(valueInput ?? "").trim();
  if (hpText.startsWith("-")) {
    const damage = Number(hpText.slice(1));
    if (!/^-\d+$/.test(hpText) || !Number.isSafeInteger(damage)) return null;
    const absorbed = Math.min(nextTemp, damage);
    return {
      value: Math.max(0, value - (damage - absorbed)),
      temp: nextTemp - absorbed
    };
  }

  const nextValue = resolveHpInput(hpText, value, max);
  return nextValue === null ? null : { value: nextValue, temp: nextTemp };
}
