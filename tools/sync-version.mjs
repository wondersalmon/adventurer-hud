import fs from "node:fs/promises";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const manifest = JSON.parse(await fs.readFile("module.json", "utf8"));

manifest.version = packageJson.version;
manifest.download = `https://github.com/wondersalmon/simple-rolls/releases/download/v${packageJson.version}/simple-rolls.zip`;

await fs.writeFile("module.json", `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Synchronized module.json to version ${packageJson.version}.`);
