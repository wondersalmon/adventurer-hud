import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [english, russian] = await Promise.all([
  readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
  readFile(new URL("../CHANGELOG.ru.md", import.meta.url), "utf8")
]);
const headings = {
  New: "Новое",
  "Changes and improvements": "Изменения и улучшения",
  "Player mode": "Режим игрока",
  "GM mode": "Режим мастера",
  Companions: "Компаньоны",
  "Edit mode": "Режим редактирования",
  Settings: "Настройки",
  "Shared interface": "Общий интерфейс",
  "HUD editor": "Редактор HUD",
  "Character search and dice tray": "Поиск по персонажу и дайс-трей",
  "Familiar senses and backups": "Чувства фамильяра и резервные копии",
  "Default two-column player layout":
    "Двухколоночная компоновка игрока по умолчанию",
  "Window and controls": "Окно и управление",
  "Fixes and quality of life": "Исправления и удобство",
  "GM combat HUD": "Боевой HUD мастера",
  Fixes: "Исправления"
};

function versions(source) {
  return source
    .split(/^## /m)
    .slice(1)
    .map(section => {
      const [version, ...lines] = section.trim().split(/\r?\n/);
      return { version, lines: lines.filter(line => line.trim()) };
    });
}

test("Russian changelog translates the complete English history with matching versions, sections and entry structure", () => {
  assert.match(russian, /^# Журнал изменений\r?\n/);
  const en = versions(english);
  const ru = versions(russian);
  assert.deepEqual(
    ru.map(entry => entry.version),
    en.map(entry => entry.version)
  );
  const kind = line =>
    line.startsWith("### ")
      ? "section"
      : line.startsWith("- ")
        ? "bullet"
        : line.startsWith("> ")
          ? "quote"
          : line.startsWith("![")
            ? "image"
            : "paragraph";
  for (let i = 0; i < en.length; i++) {
    assert.deepEqual(
      ru[i].lines.map(kind),
      en[i].lines.map(kind),
      en[i].version
    );
    const sections = en[i].lines
      .filter(line => line.startsWith("### "))
      .map(line => {
        const heading = line.slice(4);
        assert.ok(headings[heading], `Missing translated heading: ${heading}`);
        return `### ${headings[heading]}`;
      });
    assert.deepEqual(
      ru[i].lines.filter(line => line.startsWith("### ")),
      sections,
      en[i].version
    );
    for (let j = 0; j < en[i].lines.length; j++) {
      assert.equal(
        (ru[i].lines[j].match(/\*\*/g) ?? []).length,
        (en[i].lines[j].match(/\*\*/g) ?? []).length,
        `${en[i].version}, entry ${j}: component labels/emphasis`
      );
      assert.deepEqual(
        [...ru[i].lines[j].matchAll(/`([^`]+)`/g)].map(match => match[1]),
        [...en[i].lines[j].matchAll(/`([^`]+)`/g)].map(match => match[1]),
        `${en[i].version}, entry ${j}: code/shortcut references`
      );
    }
  }
});

test("changelog documentation references have equivalent paired-language targets and preserve images", () => {
  const links = source =>
    [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  const paired = reference => {
    if (reference === "docs/release-2.0.md#21-update")
      return "docs/release-2.0.ru.md#изменения-21";
    if (reference === "docs/release-2.0.ru.md#изменения-21")
      return "docs/release-2.0.md#21-update";
    if (!reference.startsWith("docs/")) return reference;
    return reference.includes(".ru.md")
      ? reference.replace(".ru.md", ".md")
      : reference.replace(".md", ".ru.md");
  };
  assert.deepEqual(links(russian), links(english).map(paired));
  const current = versions(russian)[0].lines;
  assert.match(current.at(-1), /^Документация: /);
  assert.equal(links(current.at(-1)).length, 3);
  assert.doesNotMatch(current.at(-1), /CHANGELOG/);
});
