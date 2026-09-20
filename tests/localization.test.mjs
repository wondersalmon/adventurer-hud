import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Russian and English localization keys stay synchronized", async () => {
  const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));
  const english = JSON.parse(await readFile("lang/en.json", "utf8"));

  assert.deepEqual(Object.keys(english).sort(), Object.keys(russian).sort());
});

test("all directly referenced localization keys exist", async () => {
  const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));
  const english = JSON.parse(await readFile("lang/en.json", "utf8"));
  const files = ["scripts/rolls-hud.js", "scripts/adventurer-hud.js"];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\btf?\("([^"]+)"/g)) {
      const key = `ADVENTURER_HUD.${match[1]}`;
      assert.ok(russian[key], `${file} references missing key ${key}`);
      assert.ok(english[key], `${file} references missing key ${key}`);
    }
  }
});
