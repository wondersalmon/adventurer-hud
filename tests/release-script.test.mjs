import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

const skipReleaseTests = !existsSync(new URL("../release.ps1", import.meta.url))
  ? "Local release.ps1 is intentionally absent from the repository"
  : spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status !== 0
    ? "PowerShell is unavailable"
    : false;

const runRelease = (
  failure,
  { testOnly = false, confirmation = "yes" } = {}
) => {
  const result = spawnSync(
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
        else { Write-Output "release-branch" }
      }
      if ($args[0] -eq "rev-parse" -and $args -contains "--verify") { $global:LASTEXITCODE = 1 }
      if ($args[0] -eq "diff") { $global:LASTEXITCODE = 1 }
      if ($args[0] -eq $env:RELEASE_TEST_FAILURE) { $global:LASTEXITCODE = 1 }
    }
    function global:npm.cmd {
      $global:Calls.Add(@("npm.cmd") + @($args))
      $global:LASTEXITCODE = 0
      if ($args -contains $env:RELEASE_TEST_FAILURE) { $global:LASTEXITCODE = 1 }
    }
    function global:Read-Host {
      $global:Calls.Add(@("confirmation"))
      return $env:RELEASE_TEST_CONFIRMATION
    }
    try { ${testOnly ? "& ./release.ps1 -Test" : "& ./release.ps1 1.2.3"} }
    catch { Write-Output ("ERROR:" + $_.Exception.Message) }
    Write-Output ("CALLS:" + (ConvertTo-Json -InputObject @($global:Calls.ToArray()) -Depth 5 -Compress))
  `
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_TEST_FAILURE: failure ?? "",
        RELEASE_TEST_CONFIRMATION: confirmation
      }
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout
    .split(/\r?\n/)
    .find(value => value.startsWith("CALLS:"));
  assert.ok(line, result.stdout + result.stderr);
  return { calls: JSON.parse(line.slice(6)), output: result.stdout };
};

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
    assert.deepEqual(calls, [
      ["npm.cmd", "run", "check"],
      ["npm.cmd", "run", "test:ui"],
      ["npm.cmd", "run", "build"],
      ["npm.cmd", "run", "release:notes"]
    ]);
  }
);

for (const failure of ["check", "test:ui", "build", "release:notes"]) {
  test(
    `test mode stops at ${failure} without release operations`,
    { skip: skipReleaseTests },
    () => {
      const { calls, output } = runRelease(failure, { testOnly: true });
      assert.match(output, /ERROR:/);
      assert.ok(
        calls.every(call => call[0] === "npm.cmd" && call[1] === "run")
      );
      assert.deepEqual(calls.at(-1), ["npm.cmd", "run", failure]);
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
