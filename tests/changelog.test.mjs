import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractReleaseNotes,
  assertReleaseReady,
  resolveReleaseNoteLinks
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

test("release documentation links resolve to the requested tag and leave external links unchanged", () => {
  assert.equal(
    resolveReleaseNoteLinks(
      "[Player](docs/player-guide.md) · [Companions](docs/companions-guide.md#controls) · [External](https://example.com/guide)",
      "git+https://github.com/wondersalmon/adventurer-hud.git",
      "2.2.0"
    ),
    "[Player](https://github.com/wondersalmon/adventurer-hud/blob/v2.2.0/docs/player-guide.md) · [Companions](https://github.com/wondersalmon/adventurer-hud/blob/v2.2.0/docs/companions-guide.md#controls) · [External](https://example.com/guide)"
  );
});

test("release notes command uses only English changelog and resolves repository documentation links", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hud-notes-test-"));
  try {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        version: "2.2.0",
        repository: {
          url: "https://github.com/wondersalmon/adventurer-hud.git"
        }
      })
    );
    await writeFile(
      path.join(root, "CHANGELOG.md"),
      "## 2.2.0\n- **Settings:** English notes.\n\nDocumentation: [Player guide](docs/player-guide.md).\n\n## 2.1.0\nOld history."
    );
    await writeFile(
      path.join(root, "CHANGELOG.ru.md"),
      "## 2.2.0\nРусские заметки."
    );
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../tools/release-notes.mjs", import.meta.url))],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const notes = await readFile(
      path.join(root, "dist/release-notes.md"),
      "utf8"
    );
    assert.match(notes, /English notes/);
    assert.doesNotMatch(notes, /Русские|Old history/);
    assert.match(
      notes,
      /https:\/\/github.com\/wondersalmon\/adventurer-hud\/blob\/v2.2.0\/docs\/player-guide.md/
    );
  } finally {
    assert.ok(path.basename(root).startsWith("hud-notes-test-"));
    await rm(root, { recursive: true, force: true });
  }
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
