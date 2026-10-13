import { dnd5eAdapter } from "./dnd5e/index.js";
import {
  activeEffectSummaries,
  effectVisibilityKey
} from "./hud/effect-summaries.js";
import { HIDDEN_EFFECT_LIMIT, validHiddenEffects } from "./settings-schema.js";

/** List native statuses and active effects visible to this user, retaining saved exclusions. */
export function hiddenEffectChoices({ selected, t, includeActors = true }) {
  const definitions = globalThis.CONFIG ? dnd5eAdapter.statusDefinitions() : [];
  const choices = new Map();
  const add = effect => {
    const value = effectVisibilityKey(effect);
    const name = game.i18n.localize(effect.name ?? effect.label ?? effect.id);
    const kind = t(
      value.startsWith("status:")
        ? "Settings.hiddenEffects.Status"
        : "Settings.hiddenEffects.Effect"
    );
    choices.set(value, {
      value,
      label: `${name} · ${kind}`,
      standard: dnd5eAdapter.isStandardStatus(effect),
      img: effect.img ?? effect.icon ?? choices.get(value)?.img
    });
  };
  for (const definition of definitions) add(definition);
  const actors = new Set(
    includeActors
      ? [
          ...(game.actors?.contents ?? game.actors?.values?.() ?? []),
          ...(globalThis.canvas?.tokens?.placeables ?? []).map(
            token => token.actor
          ),
          ...(globalThis.canvas?.tokens?.controlled ?? []).map(
            token => token.actor
          ),
          game.user?.character
        ]
      : []
  );
  for (const actor of actors) {
    if (
      !actor ||
      !(actor.testUserPermission?.(game.user, "OBSERVER") ?? actor.isOwner)
    )
      continue;
    for (const effect of activeEffectSummaries(actor, definitions)) add(effect);
  }
  for (const value of validHiddenEffects(selected) ? selected : [])
    if (!choices.has(value))
      choices.set(value, {
        value,
        label: value.slice(value.indexOf(":") + 1),
        standard:
          value.startsWith("status:") &&
          dnd5eAdapter.isStandardStatus({ id: value.slice(7) })
      });
  return [...choices.values()].sort((a, b) =>
    a.label.localeCompare(b.label, game.i18n.lang)
  );
}

/** One catalogue per open Configure form, with selection independent of search. */
export class EffectSettingsController {
  constructor(root, { selected, savedFilter, t, onError }) {
    this.root = root;
    this.t = t;
    this.onError = onError;
    this.list = root.querySelector("[data-hidden-effects-list]");
    this.filter = root.querySelector('[name="statusFilter"]');
    this.selected = new Set(validHiddenEffects(selected) ? selected : []);
    this.implicitConditions =
      savedFilter === "conditions" && this.filter?.value === "custom";
    for (const input of this.list?.querySelectorAll("input:checked") ?? [])
      this.selected.add(input.value);
    this.manualChoices = new Set();
    this.disposed = false;
    this.loaded = false;
    this.loading = null;
  }
  async load() {
    if (this.loaded || !this.list) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (this.disposed) return;
      const choices = hiddenEffectChoices({
        selected: [...this.selected],
        t: this.t
      });
      if (this.disposed) return;
      const doc = this.root.ownerDocument;
      const fragment = doc.createDocumentFragment();
      for (const choice of choices) {
        if (this.filter.value === "conditions" || this.implicitConditions) {
          if (!choice.standard && !this.manualChoices.has(choice.value))
            this.selected.add(choice.value);
        }
        const label = doc.createElement("label");
        label.className = "ws-settings-effect-choice";
        const input = doc.createElement("input");
        input.type = "checkbox";
        input.name = "hiddenEffects";
        input.value = choice.value;
        input.dataset.standardStatus = String(choice.standard);
        input.checked = this.selected.has(choice.value);
        const icon = doc.createElement(choice.img ? "img" : "i");
        if (choice.img) {
          icon.setAttribute("src", choice.img);
          icon.setAttribute("alt", "");
          icon.setAttribute("loading", "lazy");
          icon.setAttribute("draggable", "false");
        } else icon.className = "fa-solid fa-wand-magic-sparkles";
        icon.setAttribute("aria-hidden", "true");
        const text = doc.createElement("span");
        text.textContent = choice.label;
        label.append(input, icon, text);
        fragment.append(label);
      }
      const focused = doc.activeElement;
      const focusedValue = this.list.contains(focused)
        ? focused?.getAttribute("value")
        : null;
      this.list.replaceChildren(fragment);
      this.loaded = true;
      this.implicitConditions = false;
      this.manualChoices.clear();
      this.update();
      if (focusedValue)
        [...this.list.querySelectorAll("input")]
          .find(
            input =>
              input.value === focusedValue && !input.closest("label").hidden
          )
          ?.focus({ preventScroll: true });
    })().catch(error => {
      this.loading = null;
      if (!this.disposed) this.onError(error);
      throw error;
    });
    return this.loading;
  }
  change(target) {
    if (target?.name === "hiddenEffects") {
      if (this.filter.value === "conditions" && !this.loaded)
        this.implicitConditions = true;
      this.manualChoices.add(target.value);
      if (target.checked) this.selected.add(target.value);
      else this.selected.delete(target.value);
      this.filter.value = "custom";
    } else if (target?.name === "statusFilter") {
      this.implicitConditions = false;
      this.manualChoices.clear();
      if (target.value !== "custom") {
        this.selected.clear();
        if (target.value === "conditions")
          for (const input of this.list.querySelectorAll("input"))
            if (input.dataset.standardStatus !== "true")
              this.selected.add(input.value);
      }
    }
    this.update();
  }
  clear() {
    this.selected.clear();
    this.manualChoices.clear();
    this.implicitConditions = false;
    this.filter.value = "all";
    this.update();
  }
  update() {
    const query = String(
      this.root.querySelector("[data-effect-search]")?.value ?? ""
    )
      .trim()
      .toLocaleLowerCase();
    let visible = 0;
    const labels = [...(this.list?.querySelectorAll("label") ?? [])];
    for (const label of labels) {
      label.hidden = !label.textContent.toLocaleLowerCase().includes(query);
      if (!label.hidden) visible++;
      const input = label.querySelector("input");
      if (input) input.checked = this.selected.has(input.value);
    }
    const count = this.root.querySelector("[data-effect-count]");
    const selectedCount = this.root.querySelector(
      "[data-effect-selected-count]"
    );
    if (selectedCount)
      selectedCount.textContent = this.t(
        "Settings.hiddenEffects.Selected"
      ).replace("{count}", String(this.selected.size));
    if (count && this.loaded)
      count.textContent =
        this.t("Settings.hiddenEffects.Count")
          .replace("{visible}", visible)
          .replace("{total}", labels.length)
          .replace("{selected}", this.selected.size) +
        (visible ? "" : " · " + this.t("Settings.hiddenEffects.NoMatches"));
    this.filter?.setCustomValidity?.(
      this.filter.value === "custom" && this.selected.size > HIDDEN_EFFECT_LIMIT
        ? this.t("Settings.hiddenEffects.Limit").replace(
            "{count}",
            HIDDEN_EFFECT_LIMIT
          )
        : ""
    );
  }
  dispose() {
    this.disposed = true;
  }
}
