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
    screenshot: "only-on-failure"
  }
});
