/** Search the rendered, permission-filtered settings without rebuilding the form. */
export class SettingsSearchController {
  constructor(root, { activate, t, translations = [] }) {
    this.root = root;
    this.activate = activate;
    this.t = t;
    this.input = root.querySelector("[data-settings-search]");
    this.results = root.querySelector("[data-settings-search-results]");
    this.status = root.querySelector("[data-settings-search-status]");
    this.clearButton = root.querySelector("[data-settings-search-clear]");
    if (this.clearButton) this.clearButton.hidden = !this.input?.value;
    this.entries = [...root.querySelectorAll("[data-setting-key]")].map(row => {
      const panel = row.closest("[data-settings-panel]");
      const name =
        (
          row.querySelector("[data-setting-name]") ??
          row.querySelector(":scope > label")
        )?.textContent.trim() ?? "";
      const category =
        panel?.querySelector("h2")?.textContent.trim() ?? t("Settings.General");
      return {
        row,
        name,
        category,
        panel: panel?.dataset.settingsPanel,
        text: this.normalize(
          `${name} ${row.querySelector(":scope > .hint")?.textContent ?? ""} ${category} ${translations.map(translate => `${translate(`Settings.${row.dataset.settingKey}.Name`)} ${translate(`Settings.${row.dataset.settingKey}.Hint`)} ${translate(`Settings.Groups.${panel?.dataset.settingsPanel}.Name`)}`).join(" ")}`
        )
      };
    });
    // Index permitted sections before their lazy content is loaded.
    for (const panel of root.querySelectorAll("[data-settings-panel]")) {
      const id = panel.dataset.settingsPanel;
      const key =
        {
          help: "Settings.Help.Name",
          changelog: "Settings.Changelog.Name",
          troubleshooting: "Settings.Troubleshooting.Name"
        }[id] ?? `Settings.Groups.${id}.Name`;
      const name = panel.querySelector("h2")?.textContent.trim() ?? t(key);
      this.entries.push({
        row: panel.querySelector("h2") ?? panel,
        name,
        category: name,
        panel: id,
        text: this.normalize(
          [name, ...translations.map(translate => translate(key))].join(" ")
        )
      });
    }
    if (root.querySelector('[data-settings-panel="troubleshooting"]')) {
      for (const [section, nameKey, hintKey] of [
        ["saved", "Troubleshooting.Integrity", "Integrity.Intro"],
        ["report", "Troubleshooting.Report", "Troubleshooting.ReportHelp"],
        [
          "recording",
          "Troubleshooting.Recording",
          "Troubleshooting.RecordingHint"
        ],
        [
          "backup",
          "Troubleshooting.BackupSection",
          "Troubleshooting.BackupHint"
        ],
        ["resets", "Troubleshooting.Resets", "Troubleshooting.ResetSettings"]
      ]) {
        this.entries.push({
          selector: `[data-troubleshooting-section="${section}"]`,
          name: t(nameKey),
          category: t("Settings.Troubleshooting.Name"),
          panel: "troubleshooting",
          text: this.normalize(
            [
              t(nameKey),
              t(hintKey),
              ...translations.flatMap(translate => [
                translate(nameKey),
                translate(hintKey)
              ])
            ].join(" ")
          )
        });
      }
    }
    this.selectionRevision = 0;
    this.onInput = event => {
      if (event.target === this.input) {
        this.selectionRevision++;
        this.search();
      }
    };
    this.onClick = async event => {
      if (event.target.closest?.("[data-settings-search-clear]")) {
        this.clear();
        this.input?.focus();
        return;
      }
      const button = event.target.closest?.("[data-settings-search-index]");
      if (!button || !this.results?.contains(button)) return;
      const entry = this.entries[Number(button.dataset.settingsSearchIndex)];
      if (!entry) return;
      const revision = ++this.selectionRevision;
      if (entry.panel) await this.activate(entry.panel);
      if (revision !== this.selectionRevision || !this.root.isConnected) return;
      const row = entry.selector
        ? this.root.querySelector(entry.selector)
        : entry.row;
      if (!row || row.closest("[data-settings-panel]")?.hidden) return;
      this.removeHighlight();
      if (row.matches("details")) row.open = true;
      row.classList.add("ws-settings-search-match");
      row.scrollIntoView?.({ block: "nearest" });
      const control = row.querySelector(
        "input:not(:disabled), select:not(:disabled), button:not(:disabled)"
      );
      if (control) control.focus({ preventScroll: true });
      else {
        row.tabIndex = -1;
        row.focus?.({ preventScroll: true });
      }
    };
    this.onKey = event => {
      if (
        event.key === "Escape" &&
        (event.target === this.input || this.results?.contains(event.target))
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.clear();
        this.input?.focus();
      } else if (event.target === this.input && event.key === "ArrowDown") {
        const first = this.results?.querySelector("button");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    root.addEventListener("input", this.onInput);
    root.addEventListener("click", this.onClick);
    root.addEventListener("keydown", this.onKey);
  }
  normalize(value) {
    return value.normalize("NFKC").toLocaleLowerCase().replaceAll("ё", "е");
  }
  search() {
    if (!this.input || !this.results || !this.status) return;
    const query = this.normalize(this.input.value.trim());
    if (this.clearButton) this.clearButton.hidden = !this.input.value;
    this.results.replaceChildren();
    this.results.hidden = this.status.hidden = !query;
    if (!query) {
      this.removeHighlight();
      return;
    }
    const words = query.split(/\s+/);
    let count = 0;
    this.entries.forEach((entry, index) => {
      if (!words.every(word => entry.text.includes(word))) return;
      count++;
      const button = this.root.ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.settingsSearchIndex = String(index);
      const name = this.root.ownerDocument.createElement("span"),
        category = this.root.ownerDocument.createElement("small");
      name.textContent = entry.name;
      category.textContent = entry.category;
      button.append(name, category);
      this.results.append(button);
    });
    if (!count) {
      const empty = this.root.ownerDocument.createElement("p");
      empty.textContent = this.t("Settings.Search.Empty");
      this.results.append(empty);
    }
    this.status.textContent = count
      ? this.t("Settings.Search.Results").replace("{count}", String(count))
      : this.t("Settings.Search.Empty");
  }
  removeHighlight() {
    for (const row of this.root.querySelectorAll(".ws-settings-search-match"))
      row.classList.remove("ws-settings-search-match");
  }
  clear() {
    this.selectionRevision++;
    if (this.input) this.input.value = "";
    this.search();
  }
  dispose() {
    this.selectionRevision++;
    this.root.removeEventListener("input", this.onInput);
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("keydown", this.onKey);
    this.removeHighlight();
  }
}
