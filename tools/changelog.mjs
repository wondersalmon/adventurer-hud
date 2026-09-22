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
