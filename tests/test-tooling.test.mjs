import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import { selectTestFiles } from "../tools/test-suite.mjs";
import coverageReporter from "../tools/coverage-reporter.mjs";

test("lint rejects missing runtime helpers and Node globals, while allowing Foundry globals", async () => {
  const eslint = new ESLint();
  const lint = async code =>
    (await eslint.lintText(code, { filePath: "scripts/hud/example.js" }))[0];
  for (const code of ["misspelledHudHelper();", "process.exit(0);"])
    assert.equal(
      (await lint(code)).messages.some(row => row.ruleId === "no-undef"),
      true
    );
  assert.equal(
    (
      await lint(
        "game.settings.get('adventurer-hud', 'enabled'); fromUuid('Actor.a');"
      )
    ).errorCount,
    0
  );
  const [tool] = await eslint.lintText("document.querySelector('main');", {
    filePath: "tools/example.mjs"
  });
  assert.equal(
    tool.messages.some(row => row.ruleId === "no-undef"),
    true
  );
});

test("runtime and integration partition the full suite without local release tooling", async () => {
  const all = await selectTestFiles("all");
  const runtime = await selectTestFiles("runtime");
  const integration = await selectTestFiles("integration");
  assert.deepEqual([...runtime, ...integration].sort(), all);
  assert.equal(new Set([...runtime, ...integration]).size, all.length);
  assert.equal(all.includes("tests/release-script.test.mjs"), false);
  assert.ok(integration.includes("tests/release-build.test.mjs"));
  await assert.rejects(selectTestFiles("invalid"), /Unknown test suite/);
});

test("coverage reports retain per-file branch data and separate runtime from tools", async () => {
  async function* events() {
    yield { type: "test:pass" };
    yield {
      type: "test:coverage",
      data: {
        summary: {
          totalBranchCount: 3,
          files: [
            { path: "C:\\repo\\scripts\\hud.js", uncoveredBranchCount: 1 },
            { path: "/repo/tools/build.mjs", uncoveredBranchCount: 2 }
          ]
        }
      }
    };
  }
  const output = [];
  for await (const chunk of coverageReporter(events())) output.push(chunk);
  const report = JSON.parse(output.join(""));
  assert.equal(report.groups.runtime[0].uncoveredBranchCount, 1);
  assert.equal(report.groups.tooling[0].uncoveredBranchCount, 2);
  assert.equal(report.totals.totalBranchCount, 3);
});
