import { readFile } from "node:fs/promises";
const json = new Map();
export function readJson(file) {
  if (!json.has(file)) json.set(file, readFile(file, "utf8").then(JSON.parse));
  return json.get(file);
}
