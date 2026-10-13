export function extractReleaseNotes(changelog, version) {
  const escapedVersion = String(version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##[ \\t]+(?:v)?${escapedVersion}[ \\t]*$`, "m");
  const match = heading.exec(changelog);

  if (!match) {
    throw new Error(`CHANGELOG.md has no section for version ${version}.`);
  }

  const start = match.index + match[0].length;
  const remainder = changelog.slice(start);
  const nextHeading = /^##[ \\t]+.+$/m.exec(remainder);
  const notes = remainder
    .slice(0, nextHeading?.index ?? remainder.length)
    .trim();

  if (!notes) {
    throw new Error(`CHANGELOG.md section ${version} is empty.`);
  }

  return notes;
}

export function assertReleaseReady(notes, version) {
  if (
    /not yet released|prepared for the next|\bTODO\b|\bTBA\b|(?:ещ[её]|пока) не (?:выпущен|опубликован)/iu.test(
      notes
    )
  )
    throw new Error(`Release notes for ${version} are not finalized.`);
}

/** GitHub release bodies resolve repository-relative links outside the repo. */
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
