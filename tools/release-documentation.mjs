import path from "node:path";

export function verifyReleaseDocumentation(entries, documents) {
  for (const [file, source] of documents) {
    if (!entries.has(file)) throw new Error(`Release is missing ${file}`);
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const reference = match[1].split(/[?#]/)[0];
      if (!reference || /^[a-z][a-z\d+.-]*:/i.test(reference)) continue;
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), decodeURI(reference))
      );
      if (!entries.has(target))
        throw new Error(`Broken release link in ${file}: ${reference}`);
    }
  }
}
