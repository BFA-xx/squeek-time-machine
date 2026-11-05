import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/squeek_time_machine_test`,
      ADMIN_TOKEN: "test-admin-token-with-enough-length",
      INGESTION_ENABLED: "false",
      AUTH_THROTTLE_PER_MINUTE: "1000",
      NODE_ENV: "test",
    },
  },
});
