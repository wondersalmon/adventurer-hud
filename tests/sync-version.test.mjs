import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { check } from "prettier";

test("version synchronization preserves manifest fields and writes Prettier-compatible JSON", async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "hud-version-"));
  assert.ok(temporary.startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const config = JSON.parse(
    await fs.readFile(new URL("../.prettierrc.json", import.meta.url), "utf8")
  );
  await fs.writeFile(
    path.join(temporary, ".prettierrc.json"),
    JSON.stringify(config)
  );
  await fs.writeFile(
    path.join(temporary, "package.json"),
    JSON.stringify({
      version: "2.3.4",
      repository: { url: "https://github.com/example/hud.git" }
    })
  );
  const original = {
    id: "hud",
    version: "1.0.0",
    compatibility: { minimum: "14", verified: "14" },
    media: [{ type: "setup", url: "media/layout.webp" }]
  };
  await fs.writeFile(
    path.join(temporary, "module.json"),
    JSON.stringify(original)
  );
  await promisify(execFile)(
    process.execPath,
    [fileURLToPath(new URL("../tools/sync-version.mjs", import.meta.url))],
    { cwd: temporary }
  );
  const output = await fs.readFile(path.join(temporary, "module.json"), "utf8");
  assert.equal(await check(output, { ...config, parser: "json" }), true);
  assert.deepEqual(JSON.parse(output), {
    ...original,
    version: "2.3.4",
    manifest:
      "https://github.com/example/hud/releases/latest/download/module.json",
    download:
      "https://github.com/example/hud/releases/download/v2.3.4/adventurer-hud.zip"
  });
});
