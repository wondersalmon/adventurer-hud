import { readdir, access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function selectTestFiles(suite = "all") {
  const collect = async directory => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...(await collect(path)));
      else if (entry.isFile() && entry.name.endsWith(".test.mjs"))
        files.push(path);
    }
    return files;
  };
  const files = (await collect("tests")).sort();
  const integration = name =>
    name.split("/").at(-1).startsWith("release-") ||
    [
      "sync-version.test.mjs",
      "changelog.test.mjs",
      "test-tooling.test.mjs"
    ].includes(name.split("/").at(-1));
  if (!["runtime", "integration", "all", "local"].includes(suite))
    throw new Error(`Unknown test suite: ${suite}`);
  return files.filter(
    name =>
      name !== "tests/release-script.test.mjs" &&
      (suite === "all" ||
        (suite === "runtime" && !integration(name)) ||
        (suite === "integration" && integration(name)))
  );
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function runSuite(suite, { coverage = false } = {}) {
  let files = await selectTestFiles(suite);
  if (suite === "local") {
    files = [];
    for (const [source, test] of [
      ["dev/release.ps1", "tests/release-script.test.mjs"],
      ["dev/benchmark/run.mjs", "dev/benchmark/tests/contracts.mjs"]
    ]) {
      const available = (await exists(source)) && (await exists(test));
      console.log(`${available ? "RUN" : "SKIP"} local-only: ${source}`);
      if (available) files.push(test);
    }
    console.log(
      `Local tooling: ${files.length}/2 suites available; dev/ is never required by CI.`
    );
  } else
    console.log(
      `Test suite ${suite}: ${files.length} files; local tooling excluded (npm run test:local).`
    );
  if (!files.length) return 0;
  const args = ["--test"];
  if (coverage) {
    await mkdir("dev/coverage", { recursive: true });
    args.push(
      "--experimental-test-coverage",
      "--test-coverage-include=scripts/**",
      "--test-coverage-include=tools/**",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=./tools/coverage-reporter.mjs",
      "--test-reporter-destination=dev/coverage/summary.json"
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args, ...files], {
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.slice(3).some(arg => arg !== "--coverage"))
    throw new Error(
      "Unsupported suite option; use node --test <paths> for focused Node options."
    );
  runSuite(process.argv[2] ?? "all", {
    coverage: process.argv.includes("--coverage")
  })
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
