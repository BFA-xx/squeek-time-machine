import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/squeek_time_machine_test`;
  // Tests truncate every table between runs, so refuse anything that doesn't look like a test database.
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must name a test database");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
