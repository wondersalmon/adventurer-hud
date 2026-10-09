import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectReleaseFiles,
  readReleaseDocuments
} from "../tools/release-package.mjs";

const buildScript = fileURLToPath(
  new URL("../tools/build.mjs", import.meta.url)
);
const repository = "https://github.com/wondersalmon/adventurer-hud";

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "hud-package-test-"));
  try {
    const sources = {
      "package.json": JSON.stringify({
        version: "2.2.0",
        repository: { url: repository + ".git" }
      }),
      "module.json": JSON.stringify({ id: "adventurer-hud", version: "2.2.0" }),
      "README.md": "[Release](docs/release-2.2.md) ![Panel](media/panel.webp)",
      "README.ru.md": "[Релиз](docs/release-2.2.ru.md)",
      "CHANGELOG.md": "# Changelog",
      LICENSE: "License",
      "scripts/adventurer-hud.js": "export const moduleId = 'adventurer-hud';",
      "styles/hud.css": ".hud { display: block; }",
      "templates/hud.hbs": "<main>HUD</main>",
      "lang/en.json": "{}",
      "docs/release-2.2.md":
        "[Home](../README.md) ![Panel](../media/panel.webp)",
      "docs/release-2.2.ru.md": "[Главная](../README.ru.md)",
      "media/panel.webp": "small image",
      "tests/debug.test.mjs": "must stay out",
      "dev/private.json": "must stay out",
      "tools/private.mjs": "must stay out"
    };
    for (const [file, source] of Object.entries(sources)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), source);
    }
    await run(root);
  } finally {
    const relative = path.relative(path.resolve(tmpdir()), path.resolve(root));
    assert.ok(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    );
    assert.ok(path.basename(root).startsWith("hud-package-test-"));
    await rm(root, { recursive: true, force: true });
  }
}

function zipContents(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, "ZIP end record must exist");
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  while (buffer.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const local = buffer.readUInt32LE(offset + 42);
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(
      start,
      start + buffer.readUInt32LE(offset + 20)
    );
    const body =
      buffer.readUInt16LE(offset + 10) === 8
        ? inflateRawSync(compressed)
        : compressed;
    files.set(name, body.toString("utf8"));
    offset +=
      46 +
      nameLength +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return files;
}

test("real ZIP includes future release guides, excludes development files and keeps manifests aligned", async () => {
  await fixture(async root => {
    const result = spawnSync(process.execPath, [buildScript], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const files = zipContents(
      await readFile(path.join(root, "dist/adventurer-hud.zip"))
    );
    const expected = await collectReleaseFiles(root);
    assert.deepEqual([...files.keys()].sort(), expected);
    assert.equal(files.has("docs/release-2.2.md"), true);
    assert.equal(files.has("docs/release-2.2.ru.md"), true);
    assert.equal(files.has("media/panel.webp"), true);
    assert.equal(
      [...files.keys()].some(name =>
        /^(?:tests|dev|tools|node_modules)\//.test(name)
      ),
      false
    );
    assert.deepEqual(
      JSON.parse(files.get("module.json")),
      JSON.parse(await readFile(path.join(root, "dist/module.json"), "utf8"))
    );
    assert.equal(
      files.get("README.md"),
      await readFile(path.join(root, "README.md"), "utf8")
    );
    assert.equal(
      (await readReleaseDocuments(root, expected)).find(
        ([file]) => file === "README.md"
      )[1],
      files.get("README.md")
    );
  });
});

test("build preflight preserves existing artifacts when versions or documentation disagree", async () => {
  for (const failure of ["version", "link"]) {
    await fixture(async root => {
      await mkdir(path.join(root, "dist"));
      await writeFile(
        path.join(root, "dist/existing.txt"),
        "preserve on failure"
      );
      if (failure === "version")
        await writeFile(
          path.join(root, "module.json"),
          JSON.stringify({ version: "2.0.0" })
        );
      else
        await writeFile(
          path.join(root, "README.md"),
          "[Missing](docs/missing.md)"
        );
      const result = spawnSync(process.execPath, [buildScript], {
        cwd: root,
        encoding: "utf8"
      });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        failure === "version" ? /versions differ/ : /Broken release link/
      );
      assert.equal(
        await readFile(path.join(root, "dist/existing.txt"), "utf8"),
        "preserve on failure"
      );
    });
  }
});
