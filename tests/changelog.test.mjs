import assert from "node:assert/strict";
import test from "node:test";

import { extractReleaseNotes } from "../tools/changelog.mjs";

test("release notes contain only the requested changelog section", () => {
  const changelog = `# Changelog

## 1.2.0

- Added a feature.
- Fixed a bug.

## 1.1.0

- Older change.
`;

  assert.equal(
    extractReleaseNotes(changelog, "1.2.0"),
    "- Added a feature.\n- Fixed a bug."
  );
});

test("release notes fail when a version is missing or empty", () => {
  assert.throws(
    () => extractReleaseNotes("# Changelog\n", "1.2.0"),
    /no section/
  );
  assert.throws(
    () => extractReleaseNotes("# Changelog\n\n## 1.2.0\n", "1.2.0"),
    /is empty/
  );
});
