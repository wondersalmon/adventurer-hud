export function parseVersion(version) {
  if (
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.[1-9]\d*)?$/.test(
      version ?? ""
    )
  )
    throw new Error("Use a stable version or a beta.N version.");
  return { version, tag: `v${version}`, beta: version.includes("-") };
}

export function selectReleaseNotes(markdown, version) {
  parseVersion(version);
  const sections = [...markdown.matchAll(/^##[ \t]+(.+)\r?$/gm)];
  const matches = sections.filter(section => {
    const heading = section[1].trim();
    return (
      heading === version ||
      heading === `v${version}` ||
      heading.match(/^\[([^\]]+)\](?:[ \t]+.*)?$/)?.[1] === version
    );
  });
  if (!matches.length)
    throw new Error(`CHANGELOG.md has no section for version ${version}.`);
  if (matches.length !== 1)
    throw new Error(`Expected one changelog section for ${version}.`);
  const section = matches[0];
  const next = sections[sections.indexOf(section) + 1];
  const body = markdown
    .slice(section.index + section[0].length, next?.index)
    .trim();
  if (!body) throw new Error(`CHANGELOG.md section ${version} is empty.`);
  return { heading: section[0].replace(/\r$/, ""), body };
}

export function assertReleaseReady(notes, version) {
  if (
    /not yet released|prepared for the next|\bTODO\b|\bTBA\b|(?:ещ[её]|пока) не (?:выпущен|опубликован)/iu.test(
      notes
    )
  )
    throw new Error(`Release notes for ${version} are not finalized.`);
}

export function resolveReleaseNoteLinks(notes, repository, version) {
  const base = `${repository
    .replace(/\.git$/, "")
    .replace(/^git\+/, "")
    .replace(/\/$/, "")}/blob/v${version}/CHANGELOG.md`;
  return notes.replace(
    /(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (match, start, reference, end) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith("#"))
        return match;
      return `${start}${new URL(reference, base).href}${end}`;
    }
  );
}

export function extractReleaseNotes(changelog, version) {
  return selectReleaseNotes(changelog, version).body;
}
