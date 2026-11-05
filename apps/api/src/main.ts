import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { configProblems } from "./common/config";

async function main() {
  const problems = configProblems();
  if (problems.length) {
    for (const p of problems) new Logger("config").error(p);
    process.exit(1);
  }
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4300);
  // Local-only by default. Reach it through a reverse proxy, which handles TLS.
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen(port, host);
  new Logger("main").log(`Squeek Time Machine API on ${host}:${port}`);
}
void main();
