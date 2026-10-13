import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  resolveHudPalette,
  synchronizeHudPalette,
  synchronizeHudTheme,
  synchronizeHudAccents
} from "../scripts/hud/theme.js";
import { renderHealthBar } from "../scripts/hud/health-bar.js";

const luminance = color =>
  [1, 3, 5]
    .map(index => {
      const v = parseInt(color.slice(index, index + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0
    );
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

test("built-in palettes retain agreed surfaces and readable primary, secondary and feedback text", () => {
  const expected = {
    light: ["#f5f1e8", "#fffcf6", "#ece5d9", "#292720", "#81570f", "#c3b9a8"],
    graphite: [
      "#303944",
      "#3c4856",
      "#35414e",
      "#f1f5fa",
      "#9bc9dc",
      "#657587"
    ],
    pearl: ["#edf2f7", "#fcfdff", "#e1e9f2", "#273547", "#28677f", "#b3c2d2"]
  };
  for (const theme of ["light", "dark", "graphite", "pearl"]) {
    const palette = resolveHudPalette({ theme, preset: "standard" });
    if (expected[theme])
      assert.deepEqual(
        [
          palette.background,
          palette.card,
          palette.group,
          palette.text,
          palette.accent,
          palette.border
        ],
        expected[theme]
      );
    for (const foreground of [
      "text",
      "muted",
      "accent",
      "success",
      "warning",
      "danger"
    ])
      for (const surface of [
        "background",
        "card",
        "group",
        "hover",
        "selected"
      ])
        assert.ok(
          contrast(palette[foreground], palette[surface]) >= 4.5,
          `${theme} ${foreground} on ${surface}`
        );
  }
});

test("native follow, explicit accents and Custom retain independent selections", () => {
  assert.notEqual(
    resolveHudPalette({ theme: "graphite", preset: "standard" }).accent,
    resolveHudPalette({ theme: "graphite", preset: "foundry" }).accent
  );
  assert.equal(
    resolveHudPalette({ theme: "graphite", preset: "foundry" }).accent,
    "#c19a58"
  );
  assert.equal(
    resolveHudPalette({ theme: "pearl", preset: "foundry" }).accent,
    "#79551c"
  );
  assert.equal(
    resolveHudPalette({ theme: "auto" }, "light").background,
    "#f5f1e8"
  );
  assert.equal(
    resolveHudPalette({ theme: "graphite", preset: "custom", color: "#13579b" })
      .accent,
    "#13579b"
  );
  assert.equal(
    resolveHudPalette({ theme: "pearl", preset: "teal" }).accent,
    "#0c6861"
  );
  const custom = resolveHudPalette({
    theme: "custom",
    customBackground: "#102030",
    customText: "#eefaff",
    customAccent: "#67cdef",
    preset: "teal"
  });
  assert.equal(custom.background, "#102030");
  assert.equal(custom.text, "#eefaff");
  assert.equal(custom.accent, "#67cdef");
  assert.notEqual(custom.card, custom.background);
  assert.notEqual(custom.group, custom.card);
  assert.equal(
    resolveHudPalette({ theme: "custom", customBackground: "red" }).background,
    "#19181f"
  );
});

test("existing theme/accent calls update a resolved palette without changing font or layout", () => {
  const { document } = parseHTML(
    '<main class="theme-light"><section class="ws-rolls-dialog ws-font-large" data-layout="saved"></section></main>'
  );
  const root = document.querySelector("section");
  synchronizeHudPalette(root, { theme: "auto", preset: "teal" });
  assert.equal(
    root.style.getPropertyValue("--ws-palette-background"),
    "#f5f1e8"
  );
  assert.equal(root.style.getPropertyValue("--ws-accent-light"), "#0c6861");
  synchronizeHudTheme(root, "graphite");
  assert.equal(
    root.style.getPropertyValue("--ws-palette-background"),
    "#303944"
  );
  synchronizeHudAccents(root, { preset: "custom", color: "#abcdef" });
  assert.equal(root.style.getPropertyValue("--ws-palette-accent"), "#abcdef");
  synchronizeHudTheme(root, "pearl");
  assert.equal(root.classList.contains("ws-theme-graphite"), false);
  assert.equal(root.classList.contains("ws-theme-pearl"), true);
  assert.equal(root.dataset.layout, "saved");
  assert.ok(root.classList.contains("ws-font-large"));
});

test("HP fill colors are independent from warning text and health thresholds stay unchanged", () => {
  for (const [value, fill, condition] of [
    [80, "healthy", ""],
    [60, "warning", ""],
    [50, "danger", "ws-health-bloodied"],
    [10, "danger", "ws-health-critical"],
    [0, "", "ws-health-unconscious"]
  ]) {
    const html = renderHealthBar({
      hp: { value, max: 100 },
      canEdit: true,
      formatMod: String,
      t: key => key
    });
    if (fill) assert.ok(html.includes(`--ws-palette-hp-${fill}`));
    if (condition) assert.ok(html.includes(condition));
    else assert.equal(html.includes("ws-health-condition"), false);
  }
});
