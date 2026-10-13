import {
  HUD_FONT_FAMILIES,
  HUD_ACCENT_DEFAULTS,
  HUD_ACCENT_PRESETS,
  normalizeHudTheme
} from "../settings-schema.js";

/** @typedef {{theme?: unknown, preset?: unknown, color?: unknown, customAccent?: unknown, customBackground?: unknown, customText?: unknown}} HudPaletteSelection */
/** @type {WeakMap<HTMLElement, HudPaletteSelection>} */
const paletteSelections = new WeakMap();
const hexColor = value =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const mix = (base, tint, amount) => {
  const channels = color =>
    [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const a = channels(base),
    b = channels(tint);
  return `#${a
    .map((value, index) =>
      Math.round(value + (b[index] - value) * amount)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};
const luminance = color =>
  [1, 3, 5]
    .map(index => {
      const value = parseInt(color.slice(index, index + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0
    );
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
const readable = (color, background, text) => {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const result = mix(color, text, Math.min(1, amount));
    if (contrast(result, background) >= 4.5) return result;
  }
  return text;
};
const accentSurface = (surface, accent, text, amount) => {
  for (let strength = amount; strength >= 0; strength -= 0.01) {
    const result = mix(surface, accent, Math.max(0, strength));
    if (contrast(accent, result) >= 4.5 && contrast(text, result) >= 4.5)
      return result;
  }
  return surface;
};

const palettes = {
  dark: {
    background: "#19181f",
    card: "#27262d",
    group: "#232228",
    text: "#e6e6df",
    accent: "#c19a58",
    border: "#57555d"
  },
  light: {
    background: "#f5f1e8",
    card: "#fffcf6",
    group: "#ece5d9",
    text: "#292720",
    accent: "#81570f",
    border: "#c3b9a8"
  },
  graphite: {
    background: "#303944",
    card: "#3c4856",
    group: "#35414e",
    text: "#f1f5fa",
    accent: "#9bc9dc",
    border: "#657587"
  },
  pearl: {
    background: "#edf2f7",
    card: "#fcfdff",
    group: "#e1e9f2",
    text: "#273547",
    accent: "#28677f",
    border: "#b3c2d2"
  }
};

/** Resolve every HUD surface from the same selection, without changing saved colors.
 * @param {HudPaletteSelection} selection
 * @param {string} [nativeScheme]
 */
export function resolveHudPalette(selection = {}, nativeScheme = "dark") {
  const theme = normalizeHudTheme(selection.theme);
  const key =
    theme === "auto" || theme === "custom"
      ? nativeScheme === "light"
        ? "light"
        : "dark"
      : theme;
  const base = palettes[key] ?? palettes.dark;
  let { background, card, group, text, accent, border } = base;
  if (theme === "custom") {
    background = hexColor(selection.customBackground)
      ? String(selection.customBackground)
      : base.background;
    text = hexColor(selection.customText)
      ? String(selection.customText)
      : base.text;
    accent = hexColor(selection.customAccent)
      ? String(selection.customAccent)
      : base.accent;
    card = mix(background, text, 0.045);
    group = mix(background, text, 0.09);
    border = mix(background, text, 0.32);
  } else if (selection.preset === "custom" && hexColor(selection.color))
    accent = String(selection.color);
  else if (
    typeof selection.preset === "string" &&
    selection.preset !== "standard" &&
    Object.hasOwn(HUD_ACCENT_PRESETS, selection.preset)
  ) {
    accent =
      HUD_ACCENT_PRESETS[selection.preset][
        key === "light" || key === "pearl" ? "light" : "dark"
      ];
  }
  const scheme = luminance(background) > 0.4 ? "light" : "dark";
  const light = scheme === "light";
  const hover = accentSurface(card, accent, text, 0.1);
  const selected = accentSurface(group, accent, text, 0.14);
  const contrastSurface = [background, card, group, hover, selected].sort(
    (a, b) => contrast(text, a) - contrast(text, b)
  )[0];
  const muted = readable(mix(text, background, 0.28), contrastSurface, text);
  return {
    theme,
    scheme,
    background,
    card,
    group,
    text,
    accent,
    border,
    muted,
    hover,
    selected,
    success: readable(light ? "#386329" : "#79a866", contrastSurface, text),
    warning: readable(light ? "#795b0a" : "#d4b34f", contrastSurface, text),
    danger: readable(light ? "#a13b34" : "#ea8880", contrastSurface, text),
    hpHealthy: light ? "#477b37" : "#79a866",
    hpWarning: light ? "#b78314" : "#d4b34f",
    hpDanger: light ? "#c4463c" : "#dc5855",
    iconBackground: "#465365"
  };
}

const nativeHudScheme = element => {
  const nativeTheme = element.closest(".theme-light, .theme-dark");
  return nativeTheme
    ? nativeTheme.classList.contains("theme-light")
      ? "light"
      : "dark"
    : (element.ownerDocument.defaultView?.getComputedStyle?.(
        element.parentElement ?? element
      )?.colorScheme ?? "dark");
};

/** @param {HTMLElement} element @param {HudPaletteSelection} selection */
export function synchronizeHudPalette(element, selection = {}) {
  paletteSelections.set(element, { ...selection });
  const palette = resolveHudPalette(selection, nativeHudScheme(element));
  applyHudAccents(element, {
    preset: selection.preset,
    color: selection.color
  });
  element.dataset.wsPalette = palette.theme;
  element.style.colorScheme = palette.scheme;
  for (const [key, value] of Object.entries(palette))
    if (key !== "theme" && key !== "scheme")
      element.style.setProperty(
        `--ws-palette-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`,
        value
      );
  synchronizeHudTheme(element, selection.theme, false);
  return palette;
}

/** @param {HTMLElement} element @param {{preset: unknown, color: unknown}} selection */
function applyHudAccents(element, { preset, color }) {
  element.dataset.wsAccentPreset =
    typeof preset === "string" ? preset : "standard";
  const accents =
    preset === "custom" &&
    typeof color === "string" &&
    /^#[0-9a-f]{6}$/i.test(color)
      ? { light: color, dark: color }
      : typeof preset === "string" && Object.hasOwn(HUD_ACCENT_PRESETS, preset)
        ? HUD_ACCENT_PRESETS[preset]
        : HUD_ACCENT_DEFAULTS;
  for (const theme of /** @type {const} */ (["light", "dark"])) {
    const value = accents[theme];
    if (
      typeof value === "string" &&
      /^#[0-9a-f]{6}$/i.test(value) &&
      accents !== HUD_ACCENT_DEFAULTS
    ) {
      element.style.setProperty(`--ws-accent-${theme}`, value);
      element.style.setProperty(
        `--ws-accent-bg-${theme}`,
        `color-mix(in srgb, ${value} 12%, transparent)`
      );
    } else {
      element.style.removeProperty(`--ws-accent-${theme}`);
      element.style.removeProperty(`--ws-accent-bg-${theme}`);
    }
  }
}

/** Preserve paired native-theme accent variables for existing callers.
 * @param {HTMLElement} element @param {{preset: unknown, color: unknown}} selection
 */
export function synchronizeHudAccents(element, { preset, color }) {
  applyHudAccents(element, { preset, color });
  const selection = paletteSelections.get(element);
  if (selection)
    synchronizeHudPalette(element, { ...selection, preset, color });
}

export function synchronizeHudTheme(element, theme, refreshPalette = true) {
  theme = normalizeHudTheme(theme);
  element.classList.toggle(
    "ws-theme-light",
    theme === "light" || theme === "pearl"
  );
  element.classList.toggle("ws-theme-pearl", theme === "pearl");
  element.classList.toggle("ws-theme-custom", theme === "custom");
  const dark = theme === "dark" || theme === "graphite";
  element.classList.toggle("ws-theme-graphite", theme === "graphite");
  element.classList.toggle("ws-theme-dark", dark);
  const selection = paletteSelections.get(element);
  if (refreshPalette && selection)
    synchronizeHudPalette(element, { ...selection, theme });
  if (theme === "light" || theme === "pearl" || dark) {
    element.removeAttribute("data-ws-auto-theme");
    return;
  }
  const nativeTheme = element.closest(".theme-light, .theme-dark");
  const scheme = nativeTheme
    ? nativeTheme.classList.contains("theme-light")
      ? "light"
      : "dark"
    : element.ownerDocument.defaultView?.getComputedStyle?.(
        element.parentElement ?? element
      )?.colorScheme;
  element.dataset.wsAutoTheme = scheme === "light" ? "light" : "dark";
}

export function watchHudTheme(element, getTheme) {
  const Observer = element.ownerDocument.defaultView?.MutationObserver;
  if (!Observer) return () => {};
  const observer = new Observer(() => synchronizeHudTheme(element, getTheme()));
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    observer.observe(ancestor, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  return () => observer.disconnect();
}

/** Use only installed/system families; never load font files. */
export function synchronizeHudTypography(
  element,
  { family, style, size = undefined, pixels = undefined }
) {
  if (size !== undefined) {
    for (const name of Array.from(element.classList))
      if (name.startsWith("ws-font-")) element.classList.remove(name);
    element.classList.add(`ws-font-${String(size).toLowerCase()}`);
    if (
      size === "custom" &&
      Number.isFinite(Number(pixels)) &&
      Number(pixels) >= 10 &&
      Number(pixels) <= 18
    )
      element.style.setProperty(
        "--ws-custom-type-scale",
        String(Number(pixels) / 10)
      );
    else element.style.removeProperty("--ws-custom-type-scale");
  }
  element.style.setProperty(
    "--ws-text-font",
    HUD_FONT_FAMILIES[family] ?? HUD_FONT_FAMILIES.arial
  );
  element.style.setProperty(
    "--ws-text-style",
    ["italic", "boldItalic"].includes(style) ? "italic" : "normal"
  );
  element.style.setProperty(
    "--ws-text-weight",
    ["bold", "boldItalic"].includes(style) ? "700" : "400"
  );
}
