import assert from "node:assert/strict";
import test from "node:test";

import {
  extractReleaseNotes,
  assertReleaseReady
} from "../tools/changelog.mjs";

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

test("publication rejects unfinished notes while normal release notes remain valid", () => {
  for (const marker of [
    "Prepared for the next minor release; not yet released.",
    "TODO: finalize notes",
    "TBA",
    "Ещё не выпущено"
  ])
    assert.throws(() => assertReleaseReady(marker, "2.1.0"), /not finalized/);
  assert.doesNotThrow(() =>
    assertReleaseReady("- Fixed preparation and initiative controls.", "2.1.0")
  );
});
