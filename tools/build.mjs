import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyReleaseDocumentation } from "./release-documentation.mjs";
import {
  collectReleaseFiles,
  readReleaseDocuments
} from "./release-package.mjs";

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

if (manifest.version !== packageJson.version)
  throw new Error(
    "module.json and package.json versions differ; run version:sync first."
  );
manifest.manifest = `${repository}/releases/latest/download/module.json`;
manifest.download = `${repository}/releases/download/v${packageJson.version}/adventurer-hud.zip`;

const files = await collectReleaseFiles(root);
const documents = await readReleaseDocuments(root, files);
verifyReleaseDocumentation(new Set(files), documents);
const documentSources = new Map(documents);

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

for (const file of files) {
  if (file === "module.json") continue;
  if (documentSources.has(file))
    archive.append(documentSources.get(file), { name: file });
  else archive.file(path.join(root, file), { name: file });
}

await archive.finalize();
await complete;

verifyReleaseDocumentation(entries, documents);

console.log(`Built Adventurer HUD v${packageJson.version}.`);
