import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: ".",
  testMatch: "preview.spec.mjs",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3177",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    cwd: path.resolve(__dirname, "../.."),
    command: "node tests/custom-modules/server.mjs",
    url: "http://127.0.0.1:3177",
  },
});
