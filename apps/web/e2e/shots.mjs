// Manual visual check: node e2e/shots.mjs <outDir> [room,room] [width] [height]
import { chromium } from "@playwright/test";
const [out = ".", list = "beginning,timeline,wheel,vault,evolution,community,future", w = "1280", h = "800"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
for (const room of list.split(",")) {
  await page.goto(`http://localhost:3300/?room=${room}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label="Close panel"]', { timeout: 30000 });
  await page.click('[aria-label="Close panel"]');
  await page.waitForTimeout(5000);
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); }));
  await page.screenshot({ path: `${out}/${room}.png` });
  console.log(room, "fps", fps);
}
console.log("errors", JSON.stringify(errors.slice(0, 6)));
await browser.close();
