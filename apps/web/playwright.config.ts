import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: "line",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300", channel: "chrome", launchOptions: { args: process.env.E2E_GPU ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [] } },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
