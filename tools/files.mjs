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

/** Fetch only the reviewed private toolkit revision into ignored dev/. */
export async function setupReleaseTools({ root = process.cwd() } = {}) {
  const fs = await import("node:fs/promises");
  const { spawnSync } = await import("node:child_process");
  const pkg = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8")
  );
  const pin = pkg.foundryRelease?.revision;
  const repository = pkg.foundryRelease?.toolkitRepository;
  if (
    !/^[a-f0-9]{40}$/.test(pin ?? "") ||
    repository !== "wondersalmon/foundry-release-tools"
  )
    throw new Error("Missing reviewed release toolkit revision.");
  const target = path.resolve(root, "dev/release-tools");
  if (path.dirname(target) !== path.resolve(root, "dev"))
    throw new Error("Unexpected toolkit target.");
  const execute = (name, args) => {
    let result = spawnSync(name, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (
      (result.error || result.status !== 0) &&
      (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
    ) {
      const saved = { ...process.env };
      delete saved.GITHUB_TOKEN;
      delete saved.GH_TOKEN;
      result = spawnSync(name, args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: saved
      });
    }
    if (result.error || result.status !== 0)
      throw new Error(
        name +
          " could not obtain the pinned release toolkit. Check GitHub authentication."
      );
    return result.stdout.trim();
  };
  const prepareDependencies = async () => {
    const stamp = path.join(target, "node_modules/.release-toolkit-revision");
    if ((await fs.readFile(stamp, "utf8").catch(() => null)) === pin) return;
    if (!process.env.npm_execpath)
      throw new Error(
        "Run npm run release:setup to install toolkit dependencies."
      );
    execute(process.execPath, [
      process.env.npm_execpath,
      "ci",
      "--prefix",
      target,
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund"
    ]);
    await fs.writeFile(stamp, pin);
  };
  const exists = await fs.access(target).then(
    () => true,
    () => false
  );
  if (!exists) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    execute("gh", ["repo", "clone", repository, target, "--", "--no-checkout"]);
  } else {
    await fs.access(path.join(target, ".git"));
    if (execute("git", ["-C", target, "status", "--porcelain"]).length)
      throw new Error(
        "Release toolkit has local changes; preserve/review them before updating."
      );
    if (execute("git", ["-C", target, "rev-parse", "HEAD"]) === pin) {
      await prepareDependencies();
      return;
    }
  }
  execute("git", ["-C", target, "fetch", "--depth", "1", "origin", pin]);
  execute("git", ["-C", target, "checkout", "--detach", pin]);
  if (execute("git", ["-C", target, "rev-parse", "HEAD"]) !== pin)
    throw new Error("Toolkit revision differs.");
  await prepareDependencies();
  console.log("Release toolkit ready at " + pin + ".");
}

if (process.argv.includes("--setup-release-tools")) {
  setupReleaseTools().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
