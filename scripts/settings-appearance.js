import { SETTINGS } from "./settings-schema.js";
import { getSetting } from "./settings-access.js";
import { effectiveAnimationSettings } from "./hud/animation-settings.js";
import { healthFillColor } from "./hud/health-feedback.js";
import {
  resolveHudPalette,
  synchronizeHudPalette,
  synchronizeHudTypography
} from "./hud/theme.js";

/** Form-local appearance draft and illustrative effects. No world documents. */
export class AppearanceSettingsController {
  constructor(root) {
    this.root = root;
    this.previousTheme = this.read(SETTINGS.theme);
    this.preview = root.querySelector("[data-appearance-preview]");
    this.timer = null;
    this.hp = 32;
    this.reducedMotion = root.ownerDocument.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    );
    this.motionListener = () => this.update();
    this.reducedMotion?.addEventListener?.("change", this.motionListener);
    this.clickListener = event => {
      if (event.target.closest?.("[data-copy-custom-theme]")) {
        this.seed(
          root.querySelector("[data-custom-theme-source]")?.value ?? "dark"
        );
        this.update();
      }
      const demo = event.target.closest?.("[data-appearance-demo]");
      if (demo) this.demonstrate(demo.dataset.appearanceDemo);
    };
    root.addEventListener("click", this.clickListener);
    this.update();
  }
  read(key) {
    const control = this.root.querySelector(`[name="${key}"]`);
    return control
      ? control.type === "checkbox"
        ? control.checked
        : control.value
      : getSetting(key);
  }
  selection(theme = this.read(SETTINGS.theme)) {
    return {
      theme,
      preset: this.read(SETTINGS.accentPreset),
      color: this.read(SETTINGS.accentColor),
      customAccent: this.read(SETTINGS.customThemeAccent),
      customBackground: this.read(SETTINGS.customThemeBackground),
      customText: this.read(SETTINGS.customThemeText)
    };
  }
  seed(theme) {
    // Resolve Follow Foundry through the same element used by the visible draft.
    synchronizeHudPalette(this.root, this.selection(theme));
    const palette = resolveHudPalette(
      this.selection(theme),
      this.root.dataset.wsAutoTheme ?? "dark"
    );
    for (const [key, value] of [
      [SETTINGS.customThemeAccent, palette.accent],
      [SETTINGS.customThemeBackground, palette.background],
      [SETTINGS.customThemeText, palette.text]
    ]) {
      const input = this.root.querySelector(`[name="${key}"]`);
      if (input) input.value = value;
    }
    this.root.querySelector('[name="customThemeInitialized"]').checked = true;
  }
  update() {
    const theme = this.read(SETTINGS.theme);
    if (
      theme === "custom" &&
      this.previousTheme !== "custom" &&
      !this.read(SETTINGS.customThemeInitialized)
    )
      this.seed(this.previousTheme);
    this.previousTheme = theme;
    const custom = this.root.querySelector("[data-theme-colors]");
    if (custom) custom.hidden = theme !== "custom";
    for (const key of [SETTINGS.accentPreset, SETTINGS.accentColor]) {
      const group = this.root.querySelector(`[data-setting-key="${key}"]`);
      if (group)
        group.hidden =
          theme === "custom" ||
          (key === SETTINGS.accentColor &&
            this.read(SETTINGS.accentPreset) !== "custom");
    }
    for (const node of this.root.querySelectorAll(
      '[data-animation-detail="true"]'
    )) {
      node.hidden = false;
      for (const control of node.querySelectorAll("select, input"))
        control.disabled = !this.read(SETTINGS.showVisualEffects);
      node
        .querySelector("[data-animation-disabled-hint]")
        ?.toggleAttribute(
          "hidden",
          Boolean(this.read(SETTINGS.showVisualEffects))
        );
    }
    for (const input of this.root.querySelectorAll('input[type="color"]')) {
      const output = input
        .closest(".ws-settings-color")
        ?.querySelector("output");
      if (output) output.textContent = input.value.toUpperCase();
    }
    synchronizeHudPalette(this.root, this.selection());
    for (const element of [
      this.preview,
      ...this.root.querySelectorAll("[data-card-preview], [data-theme-preview]")
    ].filter(Boolean)) {
      synchronizeHudPalette(element, this.selection());
      synchronizeHudTypography(element, {
        family: this.read(SETTINGS.fontFamily),
        style: this.read(SETTINGS.fontStyle),
        size: this.read(SETTINGS.fontSize),
        pixels: this.read(SETTINGS.fontSizePx)
      });
    }
    this.clearEffects();
    if (this.preview) {
      this.preview.querySelector("[data-preview-hp-bar]").style.width =
        `${(this.hp / 40) * 100}%`;
      this.preview.dataset.hpAnimation = this.mode(SETTINGS.hpAnimation);
      this.preview.querySelector("[data-preview-hp-bar]").style.transition =
        this.mode(SETTINGS.hpAnimation) === "off" ? "none" : "width 350ms ease";
    }
  }
  mode(key) {
    const modes = effectiveAnimationSettings(
      {
        showVisualEffects: this.read(SETTINGS.showVisualEffects),
        hpAnimation: this.read(SETTINGS.hpAnimation),
        turnAnimation: this.read(SETTINGS.turnAnimation)
      },
      Boolean(this.reducedMotion?.matches)
    );
    return modes[key === SETTINGS.hpAnimation ? "hp" : "turn"];
  }
  clearEffects() {
    clearTimeout(this.timer);
    this.timer = null;
    this.preview?.removeAttribute("data-hp-feedback");
    this.preview?.style.removeProperty("--ws-hp-delta");
    this.preview?.classList.remove(
      "ws-damage-flash",
      "ws-heal-flash",
      "ws-turn-arrival",
      "ws-turn-soft",
      "ws-hp-feedback"
    );
    this.preview
      ?.getAnimations?.({ subtree: true })
      .forEach(animation => animation.cancel());
  }
  demonstrate(action) {
    if (!this.preview) return;
    this.clearEffects();
    let effect;
    if (["damage", "heal"].includes(action)) {
      this.hp = Math.max(
        1,
        Math.min(40, this.hp + (action === "damage" ? -12 : 12))
      );
      this.preview.querySelector("[data-preview-hp]").textContent =
        `${this.hp} / 40`;
      const bar = this.preview.querySelector("[data-preview-hp-bar]");
      bar.style.width = `${(this.hp / 40) * 100}%`;
      bar.style.background = healthFillColor((this.hp / 40) * 100);
      if (this.mode(SETTINGS.hpAnimation) === "full")
        effect = action === "damage" ? "ws-damage-flash" : "ws-heal-flash";
      if (effect) {
        this.preview.dataset.hpFeedback = action;
        this.preview.style.setProperty(
          "--ws-hp-delta",
          `"${action === "damage" ? "−12" : "+12"}"`
        );
        this.preview.classList.add("ws-hp-feedback");
      }
    } else if (action === "turn") {
      this.preview.dataset.currentTurn = "true";
      if (this.mode(SETTINGS.turnAnimation) !== "off")
        effect =
          this.mode(SETTINGS.turnAnimation) === "soft"
            ? "ws-turn-soft"
            : "ws-turn-arrival";
    }
    if (effect) {
      void this.preview.offsetWidth;
      this.preview.classList.add(effect);
      this.timer = setTimeout(() => this.clearEffects(), 900);
    }
  }
  dispose() {
    this.clearEffects();
    this.root.removeEventListener("click", this.clickListener);
    this.reducedMotion?.removeEventListener?.("change", this.motionListener);
  }
}
