import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
  readFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const skipReleaseTests = !existsSync(
  new URL("../dev/release.ps1", import.meta.url)
)
  ? "Local release.ps1 is intentionally absent from the repository"
  : spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status !== 0
    ? "PowerShell is unavailable"
    : false;

const runRelease = (
  failure,
  {
    testOnly = false,
    benchmarkOnly = false,
    confirmation = "yes",
    previousRelease = false,
    beta,
    prepare = false,
    branch = "release-branch",
    version = beta ? "2.3.0-beta.1" : "1.2.3"
  } = {}
) => {
  const fixture = mkdtempSync(join(tmpdir(), "hud-release-"));
  mkdirSync(join(fixture, "dev"));
  copyFileSync(
    new URL("../dev/release.ps1", import.meta.url),
    join(fixture, "dev/release.ps1")
  );
  const benchmarkRoot = join(fixture, "dev/benchmarks");
  const previous = join(benchmarkRoot, "2026-10-01/previous.json");
  const pointer = join(benchmarkRoot, "last-release.txt");
  if (previousRelease) {
    mkdirSync(join(benchmarkRoot, "2026-10-01"), { recursive: true });
    if (failure !== "missing-baseline") writeFileSync(previous, "{}");
    writeFileSync(pointer, previous);
  }
  let result;
  let releaseBenchmark;
  try {
    result = spawnSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        `
    $global:Calls = [System.Collections.Generic.List[object]]::new()
    function global:git {
      $global:Calls.Add(@("git") + @($args))
      $global:LASTEXITCODE = 0
      if ($args[0] -eq "symbolic-ref") {
        if ($env:RELEASE_TEST_FAILURE -eq "detached") { $global:LASTEXITCODE = 1 }
        else { Write-Output $env:RELEASE_TEST_BRANCH }
      }
      if ($args[0] -eq "rev-parse" -and $args -contains "--verify") { $global:LASTEXITCODE = 1 }
      if ($args[0] -eq "diff") { $global:LASTEXITCODE = 1 }
      if ($args[0] -eq "status" -and $env:RELEASE_TEST_FAILURE -eq "dirty") { Write-Output " M package.json" }
      if ($args[0] -eq $env:RELEASE_TEST_FAILURE) { $global:LASTEXITCODE = 1 }
    }
    function global:npm.cmd {
      $global:Calls.Add(@("npm.cmd") + @($args))
      $global:LASTEXITCODE = 0
      if ($args -contains $env:RELEASE_TEST_FAILURE) { $global:LASTEXITCODE = 1 }
    }
    function global:node {
      $global:Calls.Add(@("node") + @($args))
      $global:LASTEXITCODE = 0
      if ($env:RELEASE_TEST_FAILURE -eq "benchmark") { $global:LASTEXITCODE = 1; return }
      $OutputPath = $args[[Array]::IndexOf($args, "--out") + 1]
      New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
      Set-Content -LiteralPath $OutputPath -Value '{}' -Encoding utf8
      Write-Output "Benchmark p95 index: 100.0"
    }
    function global:Read-Host {
      $global:Calls.Add(@("confirmation"))
      return $env:RELEASE_TEST_CONFIRMATION
    }
    function global:gh {
      $global:Calls.Add(@("gh") + @($args))
      $global:LASTEXITCODE = 0
      if ($args[0] -eq "auth") { return }
      throw "Unexpected GitHub operation: $args"
    }
    try { ${benchmarkOnly ? "& ./dev/release.ps1 -BenchmarkOnly" : testOnly ? "& ./dev/release.ps1 -Test" : `& ./dev/release.ps1 $env:RELEASE_TEST_VERSION ${beta == null ? "" : "-Beta:($env:RELEASE_TEST_BETA -eq 'true')"} -Prepare:($env:RELEASE_TEST_PREPARE -eq 'true')`} }
    catch { Write-Output ("ERROR:" + $_.Exception.Message) }
    Write-Output ("CALLS:" + (ConvertTo-Json -InputObject @($global:Calls.ToArray()) -Depth 5 -Compress))
  `
      ],
      {
        encoding: "utf8",
        cwd: fixture,
        env: {
          ...process.env,
          RELEASE_TEST_FAILURE: failure ?? "",
          RELEASE_TEST_CONFIRMATION: confirmation,
          RELEASE_TEST_BRANCH: branch,
          RELEASE_TEST_VERSION: version,
          RELEASE_TEST_BETA: String(beta),
          RELEASE_TEST_PREPARE: String(prepare)
        }
      }
    );
    releaseBenchmark = existsSync(pointer)
      ? readFileSync(pointer, "utf8").trim()
      : null;
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout
    .split(/\r?\n/)
    .find(value => value.startsWith("CALLS:"));
  assert.ok(line, result.stdout + result.stderr);
  const calls = JSON.parse(line.slice(6));
  const benchmark = calls.find(call => call[0] === "node");
  return {
    calls,
    output: result.stdout,
    benchmark,
    promoted: releaseBenchmark !== null && releaseBenchmark !== previous,
    usedPrevious: benchmark?.includes(previous) ?? false
  };
};

for (const beta of [undefined, true, false])
  test(
    `beta version determines the release channel with Beta=${beta ?? "omitted"}`,
    { skip: skipReleaseTests },
    () => {
      const result = runRelease(undefined, {
        beta,
        version: "2.3.0-beta.1",
        branch: "feature/sc-venaerys-initiative",
        previousRelease: true
      });
      assert.doesNotMatch(result.output, /ERROR:/);
      assert.equal(result.promoted, false);
      assert.equal(result.usedPrevious, true);
      assert.ok(
        !result.calls.some(call => call[0] === "gh" && call[1] === "pr")
      );
      assert.ok(!result.calls.some(call => call[1] === "pull"));
      assert.deepEqual(result.calls.at(-1), [
        "git",
        "push",
        "--atomic",
        "origin",
        "HEAD:refs/heads/feature/sc-venaerys-initiative",
        "refs/tags/v2.3.0-beta.1"
      ]);
    }
  );

test(
  "beta preparation builds and validates without authentication, commits, tags or pushes",
  { skip: skipReleaseTests },
  () => {
    const result = runRelease(undefined, {
      version: "2.3.0-beta.1",
      prepare: true,
      branch: "feature/sc-venaerys-initiative",
      previousRelease: true
    });
    assert.doesNotMatch(result.output, /ERROR:/);
    assert.match(result.output, /Preparation passed/);
    assert.equal(result.promoted, false);
    assert.ok(
      !result.calls.some(
        call =>
          call[0] === "gh" ||
          call[0] === "confirmation" ||
          ["add", "commit", "tag", "push", "pull"].includes(call[1])
      )
    );
    for (const command of [
      "version:sync",
      "check",
      "test:local",
      "test:ui",
      "build",
      "release:notes"
    ])
      assert.ok(
        result.calls.some(
          call => call[0] === "npm.cmd" && call.includes(command)
        )
      );
  }
);

for (const options of [
  { beta: true, branch: "main" },
  { beta: true, branch: "master" },
  { beta: true, version: "2.2.0" },
  { version: "2.3.0-beta.1", branch: "main" },
  { version: "2.3.0-beta.1", branch: "master" },
  { version: "2.2.0-rc.1" },
  { version: "2.3.0-beta.0" }
])
  test(
    `invalid beta mode is rejected before version changes: ${JSON.stringify(options)}`,
    { skip: skipReleaseTests },
    () => {
      const result = runRelease(undefined, options);
      assert.match(result.output, /ERROR:/);
      assert.ok(
        !result.calls.some(
          call =>
            call[0] === "npm.cmd" ||
            call[0] === "gh" ||
            ["add", "commit", "tag", "push"].includes(call[1])
        )
      );
    }
  );

test(
  "release uses the local checkout without querying PRs, pulling or installing dependencies",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease("dirty", { branch: "main" });
    assert.doesNotMatch(output, /ERROR:/);
    assert.deepEqual(
      calls.filter(call => call[0] === "gh"),
      [["gh", "auth", "status", "--hostname", "github.com"]]
    );
    assert.ok(
      !calls.some(
        call =>
          call[0] === "git" && ["pull", "status", "rev-list"].includes(call[1])
      )
    );
    assert.ok(!calls.some(call => call[0] === "npm.cmd" && call[1] === "ci"));
    assert.ok(
      calls.some(
        call => call[1] === "push" && call.includes("HEAD:refs/heads/main")
      )
    );
  }
);

test(
  "release script pushes the current branch and exact tag atomically",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease();
    assert.doesNotMatch(output, /ERROR:|=====|Nothing was pushed/);
    assert.deepEqual(calls.at(-1), [
      "git",
      "push",
      "--atomic",
      "origin",
      "HEAD:refs/heads/release-branch",
      "refs/tags/v1.2.3"
    ]);
    assert.deepEqual(calls.at(-2), [
      "git",
      "tag",
      "-a",
      "v1.2.3",
      "-m",
      "Adventurer HUD 1.2.3"
    ]);
  }
);

test(
  "release script stops before tagging or pushing if the commit fails",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease("commit");
    assert.match(output, /ERROR:Commit release failed/);
    assert.ok(!calls.some(call => call[1] === "tag" || call[1] === "push"));
  }
);

test(
  "release script rejects detached HEAD before changing versions",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease("detached");
    assert.match(output, /ERROR:Release must run from a branch/);
    assert.ok(!calls.some(call => call[0] === "npm.cmd"));
  }
);

test(
  "release script reports a rejected push",
  { skip: skipReleaseTests },
  () => {
    const { output } = runRelease("push");
    assert.match(output, /ERROR:Push release failed/);
    assert.doesNotMatch(output, /Pushed release-branch/);
  }
);

test(
  "test mode runs all checks and build without release mutations or confirmation",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease(undefined, { testOnly: true });
    assert.doesNotMatch(output, /ERROR:/);
    assert.deepEqual(
      calls.filter(call => call[0] !== "node"),
      [
        ["npm.cmd", "run", "check"],
        ["npm.cmd", "run", "test:local"],
        ["npm.cmd", "run", "test:ui"],
        ["npm.cmd", "run", "build"],
        ["npm.cmd", "run", "release:notes"]
      ]
    );
  }
);

for (const failure of [
  "check",
  "test:local",
  "test:ui",
  "benchmark",
  "build",
  "release:notes"
]) {
  test(
    `test mode stops at ${failure} without release operations`,
    { skip: skipReleaseTests },
    () => {
      const { calls, output } = runRelease(failure, { testOnly: true });
      assert.match(output, /ERROR:/);
      assert.ok(
        calls.every(
          call =>
            (call[0] === "npm.cmd" && call[1] === "run") || call[0] === "node"
        )
      );
      if (failure === "benchmark") assert.equal(calls.at(-1)[0], "node");
      else assert.deepEqual(calls.at(-1), ["npm.cmd", "run", failure]);
    }
  );
  test(
    `release stops before confirmation and publishing when ${failure} fails`,
    { skip: skipReleaseTests },
    () => {
      const { calls, output } = runRelease(failure);
      assert.match(output, /ERROR:/);
      assert.ok(
        !calls.some(
          call =>
            call[0] === "confirmation" ||
            ["add", "commit", "tag", "push"].includes(call[1])
        )
      );
    }
  );
}

test(
  "release asks for confirmation after build and cancellation prevents publishing",
  { skip: skipReleaseTests },
  () => {
    const { calls, output } = runRelease(undefined, { confirmation: "no" });
    assert.match(output, /Publishing cancelled/);
    assert.deepEqual(calls.at(-3), ["npm.cmd", "run", "build"]);
    assert.deepEqual(calls.at(-2), ["npm.cmd", "run", "release:notes"]);
    assert.deepEqual(calls.at(-1), ["confirmation"]);
    assert.ok(
      !calls.some(call => ["add", "commit", "tag", "push"].includes(call[1]))
    );
  }
);

test(
  "release benchmarks use dated reports and compare with the accepted baseline",
  { skip: skipReleaseTests },
  () => {
    const result = runRelease(undefined, { previousRelease: true });
    assert.equal(result.usedPrevious, true);
    assert.equal(result.promoted, true);
    assert.match(
      result.benchmark[result.benchmark.indexOf("--out") + 1],
      /benchmarks[\\/]\d{4}-\d{2}-\d{2}[\\/]release-1\.2\.3-/
    );
    assert.match(result.output, /Benchmark p95 index/);
    assert.ok(
      result.calls.indexOf(result.benchmark) <
        result.calls.findIndex(call => call[0] === "confirmation")
    );
  }
);
for (const options of [
  { testOnly: true },
  { confirmation: "no" },
  { failure: "push" },
  { failure: "benchmark" }
]) {
  test(
    `unpublished run does not replace the release baseline: ${JSON.stringify(options)}`,
    { skip: skipReleaseTests },
    () => {
      const result = runRelease(options.failure, {
        ...options,
        previousRelease: true
      });
      assert.equal(result.promoted, false);
    }
  );
}

for (const failure of [undefined, "benchmark"]) {
  test(
    `benchmark-only mode preserves baseline and runs only benchmark (${failure ?? "success"})`,
    { skip: skipReleaseTests },
    () => {
      const result = runRelease(failure, {
        benchmarkOnly: true,
        previousRelease: true
      });
      assert.equal(result.calls.length, 1);
      assert.equal(result.calls[0][0], "node");
      assert.equal(result.usedPrevious, true);
      assert.ok(result.benchmark.includes("--fail-on-severe-regression"));
      assert.match(
        result.benchmark[result.benchmark.indexOf("--out") + 1],
        /benchmark-.*\.json$/
      );
      assert.equal(result.promoted, false);
      if (failure) assert.match(result.output, /ERROR:Benchmark failed/);
      else assert.doesNotMatch(result.output, /ERROR:/);
    }
  );
}

test(
  "missing accepted benchmark baseline stops before invoking tools and preserves its pointer",
  { skip: skipReleaseTests },
  () => {
    const result = runRelease("missing-baseline", {
      benchmarkOnly: true,
      previousRelease: true
    });
    assert.match(result.output, /ERROR:Accepted benchmark baseline is missing/);
    assert.deepEqual(result.calls, []);
    assert.equal(result.promoted, false);
  }
);
