import { readdir } from "node:fs/promises";
import path from "node:path";

export async function listFiles(directory, predicate = () => true) {
  const files = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (predicate(target)) files.push(target);
    }
  }

  await visit(directory);
  return files.sort();
}
