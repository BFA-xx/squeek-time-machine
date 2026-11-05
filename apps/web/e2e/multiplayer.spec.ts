import { expect, test, type Browser, type Page } from "@playwright/test";

/** Needs the realtime room running on the address the API hands out. */
test.skip(({ isMobile }) => isMobile, "two desktop players are enough to prove the room");
test.setTimeout(240_000);

let n = 0;
interface Player { page: Page; frames: any[]; errors: string[]; close: () => Promise<void> }

async function join(browser: Browser, name?: string): Promise<Player> {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await context.newPage();
  const frames: any[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (ws) => {
    if (!/:4400|\/room|realtime/.test(ws.url())) return;
    ws.on("framereceived", (f) => { try { frames.push(JSON.parse(String(f.payload))); } catch {} });
  });
  await page.addInitScript(() => {
    (window as any).__pad = { cross: false };
    const buttons = () => Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 && (window as any).__pad.cross, value: 0 }));
    Object.defineProperty(navigator, "getGamepads", { value: () => [{ connected: true, axes: [0, 0, 0, 0], buttons: buttons() }] });
  });
  await page.goto("/");
  if (name) {
    const ok = await page.evaluate(async (username) => {
      const post = (p: string, b: unknown) => fetch(`/api/v1${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
      const a = await post("/auth/register", { username, password: "correct-horse-battery" });
      const c = await post("/dig/crew", { crew: "tunnelrats" });
      return a.ok && c.ok;
    }, name);
    expect(ok).toBe(true);
    await page.reload();
  }
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible();
  return { page, frames, errors, close: () => context.close() };
}
const uname = () => `e2e_mp_${Date.now().toString(36)}_${++n}`;
const pressX = async (page: Page) => {
  await page.evaluate(() => { (window as any).__pad.cross = true; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { (window as any).__pad.cross = false; });
  await page.waitForTimeout(800);
};
const saw = (p: Player, f: (m: any) => boolean) => expect.poll(() => p.frames.some(f), { timeout: 45_000 }).toBe(true);

test("two players see each other, wave, hop and run a wheel together", async ({ browser }) => {
  const a = await join(browser, uname());
  const b = await join(browser, uname());
  await expect(a.page.getByRole("button", { name: "1 other here" })).toBeVisible({ timeout: 45_000 });
  await expect(b.page.getByRole("button", { name: "1 other here" })).toBeVisible({ timeout: 45_000 });

  // Walking reaches the other player.
  const welcome = a.frames.find((m) => m.t === "welcome");
  const bId = b.frames.find((m) => m.t === "welcome").id;
  expect(welcome).toBeTruthy();
  await b.page.keyboard.down("KeyS");
  await saw(a, (m) => m.t === "s" && m.p.some((p: number[]) => p[0] === bId && p[2] !== 12));
  await b.page.keyboard.up("KeyS");

  // X hops only when there's nothing to use. Nothing is near the spawn point.
  await expect(b.page.getByRole("button", { name: /^Hop on/ })).toHaveCount(0);
  await pressX(b.page);
  await saw(a, (m) => m.t === "h" && m.id === bId);

  // The list shows them, and a wave reaches the other player and earns the task.
  await a.page.getByRole("button", { name: "1 other here" }).click();
  await expect(a.page.getByRole("listitem").filter({ hasText: /The Burrow/ })).toBeVisible();
  await b.page.keyboard.press("Digit1");
  await saw(a, (m) => m.t === "e" && m.id === bId && m.e === "wave");
  await saw(b, (m) => m.t === "proof" && m.k === "hello");
  await expect(b.page.getByText(/Said hello: \+3 points/)).toBeVisible({ timeout: 15_000 });

  // Both on the practice wheel: their steps add up, and X now runs rather than hops.
  for (const p of [a, b]) {
    await p.page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Wheel Room", exact: true }).click();
    await expect(p.page.getByRole("heading", { level: 1, name: "The Wheel Room" })).toBeVisible({ timeout: 30_000 });
  }
  for (const p of [a, b]) {
    await p.page.getByRole("button", { name: "Hop on the practice wheel" }).click({ timeout: 30_000 });
    await expect(p.page.getByRole("button", { name: "Hop off" })).toBeVisible();
  }
  await expect(a.page.getByText(/2 running together/)).toBeVisible({ timeout: 45_000 });
  const hopsBefore = a.frames.filter((m) => m.t === "h").length;
  await pressX(b.page);
  for (let i = 0; i < 6; i++) {
    await b.page.getByRole("button", { name: /^RUN/ }).dispatchEvent("pointerdown");
    await b.page.waitForTimeout(200);
  }
  await saw(b, (m) => m.t === "proof" && m.k === "together");
  await saw(a, (m) => m.t === "s" && m.w?.["2"]?.[0] > 0 && m.w["2"][1] === 2);
  expect(a.frames.filter((m) => m.t === "h").length).toBe(hopsBefore);

  // Leaving is noticed.
  await b.close();
  await saw(a, (m) => m.t === "leave" && m.id === bId);
  await expect(a.page.getByRole("button", { name: "Hop off" })).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.close();
});

test("X uses what's nearby rather than hopping", async ({ browser }) => {
  const a = await join(browser, uname());
  const b = await join(browser);
  await expect(a.page.getByRole("button", { name: "1 other here" })).toBeVisible({ timeout: 45_000 });
  await b.page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Wheel Room", exact: true }).click();
  await expect(b.page.getByRole("button", { name: "Hop on the practice wheel" })).toBeVisible({ timeout: 45_000 });
  await pressX(b.page);
  await expect(b.page.getByRole("button", { name: "Hop off" })).toBeVisible({ timeout: 20_000 });
  expect(a.frames.some((m) => m.t === "h")).toBe(false);
  await a.close();
  await b.close();
});

test("the game stays single-player when the room's out of reach or not set up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/dig/ticket", (r) => r.fulfill({ json: { url: null, ticket: null } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByRole("button", { name: /here$/ })).toHaveCount(0);

  await page.route("**/api/v1/dig/ticket", (r) => r.fulfill({ json: { url: "ws://localhost:1", ticket: null } }));
  await page.reload();
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Timeline" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /here$/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
