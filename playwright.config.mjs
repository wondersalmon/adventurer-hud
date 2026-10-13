import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "./dev/test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "dev/playwright-report", open: "never" }]
  ],
  testDir: "./test-ui",
  testMatch: "**/*.spec.mjs",
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    screenshot: "only-on-failure",
    // DOM snapshots force layout of content-visibility:auto lists and disturb scrolling.
    // Keep action/network/source traces and screenshots without changing the measured DOM.
    trace: {
      mode: "retain-on-failure",
      snapshots: false,
      screenshots: true,
      sources: true
    }
  }
});
