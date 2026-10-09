import assert from "node:assert/strict";
import test from "node:test";
import { verifyReleaseDocumentation } from "../tools/release-documentation.mjs";

test("release validation requires guides, referenced images and back-links inside the archive", () => {
  const documents = [
    [
      "README.md",
      "[Guide](docs/player-guide.md) ![Demo](media/layout.webp) [Foundry](https://foundryvtt.com/)"
    ],
    [
      "docs/player-guide.md",
      "[Home](../README.md) ![Demo](../media/layout.webp) [Section](#hp)"
    ]
  ];
  const entries = new Set([
    "README.md",
    "docs/player-guide.md",
    "media/layout.webp"
  ]);
  assert.doesNotThrow(() => verifyReleaseDocumentation(entries, documents));
  entries.delete("media/layout.webp");
  assert.throws(
    () => verifyReleaseDocumentation(entries, documents),
    /Broken release link/
  );
  entries.add("media/layout.webp");
  entries.delete("docs/player-guide.md");
  assert.throws(
    () => verifyReleaseDocumentation(entries, documents),
    /player-guide/
  );
});
