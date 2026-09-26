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
  if (/^[+-]/.test(hpText)) {
    const amount = Number(hpText);
    if (!/^[+-]\d+$/.test(hpText) || !Number.isSafeInteger(amount)) return null;
    return { damage: -amount, temp: nextTemp };
  }

  const nextValue = resolveHpInput(hpText, value, max);
  return nextValue === null ? null : { value: nextValue, temp: nextTemp };
}
