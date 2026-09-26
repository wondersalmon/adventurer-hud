import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test-ui",
  testMatch: "**/*.spec.mjs",
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    screenshot: "only-on-failure"
  }
});
