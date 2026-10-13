import { MODULE_ID } from "./module-id.js";

/** Render the changelog's inline Markdown without inserting document HTML. */
function appendChangelogText(node, text) {
  const doc = node.ownerDocument;
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    node.append(doc.createTextNode(text.slice(offset, match.index)));
    if (match[1] !== undefined) {
      let url;
      try {
        url = new URL(
          match[2],
          "https://github.com/wondersalmon/adventurer-hud/blob/main/CHANGELOG.md"
        );
      } catch {
        /* Keep malformed links as text. */
      }
      if (url && ["http:", "https:"].includes(url.protocol)) {
        const link = doc.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[1];
        node.append(link);
      } else node.append(doc.createTextNode(match[1]));
    } else {
      const inline = doc.createElement(
        match[3] !== undefined ? "strong" : "code"
      );
      inline.textContent = match[3] ?? match[4];
      node.append(inline);
    }
    offset = match.index + match[0].length;
  }
  node.append(doc.createTextNode(text.slice(offset)));
}

/** Parse version sections, preserving their order and plain text safely. */
export function changelogEntries(markdown, currentVersion) {
  const entries = [];
  let entry;
  for (const line of String(markdown).split(/\r?\n/)) {
    const heading = /^##\s+v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)\s*$/.exec(line);
    if (heading) {
      entry = {
        version: heading[1],
        current: heading[1] === currentVersion,
        lines: []
      };
      entries.push(entry);
    } else if (entry) entry.lines.push(line);
  }
  const major = String(currentVersion ?? "")
    .replace(/^v/, "")
    .split(".")[0];
  return entries.filter(entry => entry.version.split(".")[0] === major);
}

/** Load packaged notes only on entry; abort on form replacement or close. */
export class ChangelogSettingsController {
  constructor(root, { version, t, onError, language = "en" }) {
    this.root = root;
    this.version = version;
    this.t = t;
    this.onError = onError;
    this.language = language === "ru" ? "ru" : "en";
    this.disposed = false;
    this.abort = null;
    this.loading = null;
    this.loaded = false;
    this.languageSelect = root.querySelector("[data-changelog-language]");
    this.synchronizeLanguageSelect();
    this.languageListener = () => this.setLanguage(this.languageSelect.value);
    this.languageSelect?.addEventListener("change", this.languageListener);
  }
  load() {
    if (this.disposed) return Promise.resolve();
    this.loaded = true;
    return (this.loading ??= this.fetchEntries());
  }
  synchronizeLanguageSelect() {
    for (const option of this.languageSelect?.options ?? [])
      option.selected = option.value === this.language;
  }
  setLanguage(language) {
    const next = language === "ru" ? "ru" : "en";
    if (this.disposed || next === this.language) return this.loading;
    this.language = next;
    this.synchronizeLanguageSelect();
    this.abort?.abort();
    this.loading = null;
    return this.loaded ? this.load() : null;
  }
  async fetchEntries() {
    const host = this.root.querySelector("[data-changelog-list]");
    if (!host) return;
    const abort = new AbortController();
    this.abort = abort;
    const isCurrent = () =>
      !this.disposed && !abort.signal.aborted && this.abort === abort;
    try {
      const response = await fetch(
        foundry.utils.getRoute(
          `modules/${MODULE_ID}/CHANGELOG${this.language === "ru" ? ".ru" : ""}.md`
        ),
        { signal: abort.signal }
      );
      if (!response.ok) throw new Error(`Changelog: HTTP ${response.status}`);
      const entries = changelogEntries(await response.text(), this.version);
      if (!isCurrent()) return;
      const previous = new Map(
        Array.from(
          host.querySelectorAll("details[data-changelog-version]"),
          details => [details.dataset.changelogVersion, details.open]
        )
      );
      const scroll = this.root.querySelector(".ws-settings-content");
      const scrollTop = scroll?.scrollTop;
      const hostScrollTop = host.scrollTop;
      const doc = host.ownerDocument;
      const fragment = doc.createDocumentFragment();
      for (const entry of entries) {
        const details = doc.createElement("details");
        details.open = previous.get(entry.version) ?? entry.current;
        details.dataset.changelogVersion = entry.version;
        const summary = doc.createElement("summary");
        summary.textContent =
          entry.version +
          (entry.current ? ` · ${this.t("Settings.Changelog.Current")}` : "");
        details.append(summary);
        let list;
        for (const line of entry.lines) {
          if (!line.trim()) {
            list = null;
            continue;
          }
          const bullet = /^-\s+/.test(line);
          const heading = /^(#{3,6})\s+/.exec(line);
          const node = doc.createElement(
            bullet
              ? "li"
              : heading
                ? `h${Math.min(6, heading[1].length + 1)}`
                : "p"
          );
          appendChangelogText(
            node,
            line.replace(/^(?:#{3,6}\s+|-\s+|>\s*)/, "")
          );
          if (bullet) {
            if (!list) {
              list = doc.createElement("ul");
              details.append(list);
            }
            list.append(node);
          } else {
            list = null;
            details.append(node);
          }
        }
        fragment.append(details);
      }
      host.replaceChildren(fragment);
      if (!entries.length)
        host.textContent = this.t("Settings.Changelog.Empty");
      host.scrollTop = hostScrollTop;
      if (scroll) scroll.scrollTop = scrollTop;
    } catch (error) {
      if (!isCurrent()) return;
      host.textContent = this.t("Settings.Changelog.Error");
      this.onError(error);
      this.loading = null;
    }
  }
  dispose() {
    this.disposed = true;
    this.abort?.abort();
    this.languageSelect?.removeEventListener("change", this.languageListener);
  }
}
