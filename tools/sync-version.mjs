import fs from "node:fs/promises";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const manifest = JSON.parse(await fs.readFile("module.json", "utf8"));
const repository = packageJson.repository.url
  .replace(/\.git$/, "")
  .replace(/^git\+/, "");

manifest.version = packageJson.version;
manifest.manifest = `${repository}/releases/latest/download/module.json`;
manifest.download = `${repository}/releases/download/v${packageJson.version}/adventurer-hud.zip`;

await fs.writeFile("module.json", `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Synchronized module.json to version ${packageJson.version}.`);
