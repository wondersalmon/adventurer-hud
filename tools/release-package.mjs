import { readFile } from "node:fs/promises";
import path from "node:path";
import { listFiles } from "./files.mjs";

const rootFiles = [
  "module.json",
  "README.md",
  "README.ru.md",
  "CHANGELOG.md",
  "LICENSE"
];
const directories = ["lang", "scripts", "styles", "templates", "docs", "media"];

export async function collectReleaseFiles(root) {
  const relative = file => path.relative(root, file).split(path.sep).join("/");
  const files = [...rootFiles];
  for (const directory of directories) {
    for (const file of await listFiles(path.join(root, directory))) {
      const name = relative(file);
      if (directory === "docs" && !name.endsWith(".md")) continue;
      files.push(name);
    }
  }
  return files.sort();
}

export async function readReleaseDocuments(root, files) {
  return Promise.all(
    files
      .filter(file => file.endsWith(".md"))
      .map(async file => {
        return [file, await readFile(path.join(root, file), "utf8")];
      })
  );
}
