import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const template of ["settings.hbs", "reset-settings.hbs"]) {
  test(`${template} has the single root required by ApplicationV2`, async () => {
    const source = (
      await readFile(
        new URL(`../templates/${template}`, import.meta.url),
        "utf8"
      )
    ).trim();

    assert.match(source, /^<div\b/);
    assert.match(source, /<\/div>$/);
  });
}
