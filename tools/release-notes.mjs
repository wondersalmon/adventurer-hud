import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractReleaseNotes } from "./changelog.mjs";

const root = process.cwd();
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);
const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
const output = path.join(root, "dist", "release-notes.md");
const notes = extractReleaseNotes(changelog, packageJson.version);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${notes}\n`, "utf8");

console.log(`Prepared release notes for v${packageJson.version}.`);
