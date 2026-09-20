import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all directly referenced localization keys exist in Russian", async () => {
  const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));
  const files = ["scripts/rolls-hud.js", "scripts/simple-rolls.js"];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
      const key = `SIMPLE_ROLLS.${match[1]}`;
      assert.ok(russian[key], `${file} references missing key ${key}`);
    }
  }
});
