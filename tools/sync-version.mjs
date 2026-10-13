import fs from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { releaseAssetUrls } from "./release-channel.mjs";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const manifest = JSON.parse(await fs.readFile("module.json", "utf8"));
const repository = packageJson.repository.url
  .replace(/\.git$/, "")
  .replace(/^git\+/, "");

manifest.version = packageJson.version;
Object.assign(manifest, releaseAssetUrls(repository, packageJson.version));

const formatting = await resolveConfig("module.json");
await fs.writeFile(
  "module.json",
  await format(JSON.stringify(manifest), {
    ...formatting,
    filepath: "module.json"
  })
);

console.log(`Synchronized module.json to version ${packageJson.version}.`);
