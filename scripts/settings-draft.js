import { SETTINGS } from "./settings-schema.js";

/** Form-local draft; ignores navigation/search and never writes preferences. */
export class SettingsDraftController {
  constructor(root, { effects, changed, t }) {
    this.root = root;
    this.effects = effects;
    this.changed = changed;
    this.t = t;
    this.revision = 0;
    this.commit();
  }
  values() {
    const values = {};
    for (const input of this.root.querySelectorAll("[name]")) {
      const key = input.name;
      if (
        !key ||
        !(
          input.closest("[data-setting-key]") ||
          key === SETTINGS.customThemeInitialized
        )
      )
        continue;
      if (key === SETTINGS.hiddenEffects) continue;
      if (input.type === "checkbox") {
        if (
          key === SETTINGS.cardDetailFields ||
          key === SETTINGS.gmCardDetailFields
        ) {
          values[key] ??= [];
          if (input.checked) values[key].push(input.value);
        } else values[key] = Boolean(input.checked);
      } else if (input.type === "range" || input.type === "number")
        values[key] = Number(input.value);
      else values[key] = input.value;
    }
    if (this.effects)
      values[SETTINGS.hiddenEffects] =
        values[SETTINGS.statusFilter] === "custom"
          ? [...this.effects.selected].sort()
          : [];
    for (const key of [SETTINGS.cardDetailFields, SETTINGS.gmCardDetailFields])
      if (values[key]) values[key].sort();
    return values;
  }
  get dirty() {
    return JSON.stringify(this.values()) !== this.baseline;
  }
  commit() {
    this.baseline = JSON.stringify(this.values());
    this.refresh();
  }
  change() {
    this.revision++;
    this.refresh();
  }
  refresh() {
    const status = this.root.querySelector("[data-settings-save-status]");
    if (status) {
      status.dataset.state = this.dirty ? "unsaved" : "saved";
      status.textContent = this.t(
        this.dirty ? "Settings.Draft.Unsaved" : "Settings.Draft.Saved"
      );
    }
    this.updateSummary();
    this.changed?.(this.dirty);
  }
  reconcileEffects(revision) {
    if (revision !== this.revision) return;
    const baseline = JSON.parse(this.baseline);
    baseline[SETTINGS.hiddenEffects] = this.values()[SETTINGS.hiddenEffects];
    this.baseline = JSON.stringify(baseline);
    this.refresh();
  }
  updateSummary() {
    const summary = this.root.querySelector("[data-opening-summary]");
    if (summary) {
      const selection = this.root.querySelector('[name="hudActorSelection"]');
      const label =
        selection?.options?.[selection.selectedIndex]?.textContent ??
        [...(selection?.options ?? [])].find(
          option => option.value === selection.value
        )?.textContent ??
        "";
      const automatic = this.root.querySelector(
        '[name="autoOpenHud"]'
      )?.checked;
      const follows = this.root.querySelector(
        '[name="autoUpdateActor"]'
      )?.checked;
      summary.textContent =
        this.t(
          automatic
            ? "Settings.OpeningSummary.Automatic"
            : "Settings.OpeningSummary.OnDemand"
        ).replace("{selection}", label) +
        " " +
        this.t(
          follows
            ? "Settings.OpeningSummary.Follow"
            : "Settings.OpeningSummary.Manual"
        );
    }
    const source = this.root.querySelector("[data-accent-source]");
    if (source)
      source.textContent = this.t(
        this.root.querySelector('[name="theme"]')?.value === "custom"
          ? "Settings.Accent.SourceCustom"
          : "Settings.Accent.SourceBuiltIn"
      );
    for (const key of [
      SETTINGS.cardDetailFields,
      SETTINGS.gmCardDetailFields
    ]) {
      const row = this.root.querySelector('[data-setting-key="' + key + '"]');
      if (!row) continue;
      const hint = row.querySelector("[data-card-fields-summary]");
      if (hint) {
        hint.textContent = this.t("Settings.CardFields.Summary").replace(
          "{count}",
          String(row.querySelectorAll("input:checked").length)
        );
      }
    }
  }
}
