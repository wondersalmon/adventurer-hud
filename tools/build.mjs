import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyReleaseDocumentation } from "./release-documentation.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);
const manifest = JSON.parse(
  await readFile(path.join(root, "module.json"), "utf8")
);
const repository = packageJson.repository.url
  .replace(/\.git$/, "")
  .replace(/^git\+/, "");

manifest.version = packageJson.version;
manifest.manifest = `${repository}/releases/latest/download/module.json`;
manifest.download = `${repository}/releases/download/v${packageJson.version}/adventurer-hud.zip`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const releaseManifest = path.join(dist, "module.json");
await writeFile(
  releaseManifest,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const output = createWriteStream(path.join(dist, "adventurer-hud.zip"));
const archive = new ZipArchive({ zlib: { level: 9 } });
const entries = new Set();
archive.on("entry", entry => entries.add(entry.name));

const complete = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.on("warning", reject);
});

archive.pipe(output);
archive.file(releaseManifest, { name: "module.json" });

for (const directory of ["lang", "scripts", "styles", "templates"]) {
  archive.directory(path.join(root, directory), directory);
}

archive.glob(
  "{*-guide*,release-2.0*}.md",
  { cwd: path.join(root, "docs") },
  { prefix: "docs" }
);
archive.directory(path.join(root, "media"), "media");

for (const file of ["README.md", "README.ru.md", "CHANGELOG.md", "LICENSE"]) {
  archive.file(path.join(root, file), { name: file });
}

await archive.finalize();
await complete;

const guides = (await readdir(path.join(root, "docs")))
  .filter(file => /(?:-guide.*|release-2\.0.*)\.md$/.test(file))
  .map(file => `docs/${file}`);
const documents = await Promise.all(
  ["README.md", "README.ru.md", "CHANGELOG.md", ...guides].map(async file => [
    file,
    await readFile(path.join(root, file), "utf8")
  ])
);
verifyReleaseDocumentation(entries, documents);

console.log(`Built Adventurer HUD v${packageJson.version}.`);
