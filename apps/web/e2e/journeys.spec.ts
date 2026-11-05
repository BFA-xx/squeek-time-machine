import { expect, test } from "@playwright/test";

const enterWorld = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip the intro" }).click();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible();
};
const firstEventId = async (page: import("@playwright/test").Page) => {
  const r = await page.request.get("/api/v1/events?limit=1&minSignificance=2");
  return (await r.json()).events[0].id as string;
};

test("title screen offers a way in with no forced intro, and real numbers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Squeek Time Machine" })).toBeVisible();
  await expect(page.getByText(/\d[\d,]* blocks · \d[\d,]* events/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Skip the intro" })).toBeVisible();
  await expect(page.getByText(/Not made or endorsed/)).toBeVisible();
});

test("every room can be reached and opened from the world", async ({ page }) => {
  await enterWorld(page);
  for (const [button, heading] of [["Great Dig", "The Great Dig"], ["Beginning", "The Beginning"], ["Timeline", "The Timeline"], ["Wheel Room", "The Wheel Room"], ["Block Vault", "The Block Vault"], ["Evolution Room", "The Evolution Room"], ["Community Archive", "The Community Archive"], ["Future", "The Future"]] as const) {
    await page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "About this room" }).click();
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
  }
});

test("keyboard walking moves the visitor out of the hub", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard journey");
  await enterWorld(page);
  await page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Timeline" })).toBeVisible({ timeout: 15000 });
  // Arrival faces into the room, so walking backward leads out through the door it came in by.
  await page.keyboard.down("KeyS");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/In a tunnel|The Burrow/, { timeout: 15000 });
  await page.keyboard.up("KeyS");
});

test("the timeline shows real records and opens one with its provenance", async ({ page }) => {
  await page.goto("/archive?room=timeline");
  const row = page.locator("section button.card").first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.click();
  await expect(page.getByText("Record", { exact: true })).toBeVisible();
  await expect(page.getByText(/Confirmed on Ethereum|Device measurement|Archive note/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" }).first()).toBeVisible();
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByPlaceholder("Search events, Squeek numbers, hashes").fill("zzzz-nothing-matches");
  await page.getByRole("button", { name: "Search", exact: true }).last().click();
  await expect(page.getByText("Nothing matches that yet.")).toBeVisible();
});

test("a shared moment opens straight on that event, with a preview image", async ({ page }) => {
  const id = await firstEventId(page);
  const path = `/moment/${encodeURIComponent(id)}`;
  await page.goto(path);
  await expect(page.getByRole("link", { name: "Enter the world" })).toBeVisible();
  await expect(page.getByText("Record", { exact: true })).toBeVisible({ timeout: 20000 });
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toContain("opengraph-image");
  const img = await page.request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.ok()).toBe(true);
  expect(img.headers()["content-type"]).toContain("image/png");
  expect((await img.body()).length).toBeGreaterThan(5000);
});

test("a shared block opens on that block, and an unknown one is a clean 404", async ({ page }) => {
  await page.goto("/block/1");
  await expect(page.getByRole("heading", { name: "Squeek block 1" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Settlement", { exact: true })).toBeVisible();
  const res = await page.goto("/block/999999999");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("That record isn't in the archive")).toBeVisible();
});

test("a new member signs up, leaves a memory, and sees it on their profile", async ({ page }) => {
  const id = await firstEventId(page);
  const name = `e2e_${Date.now().toString(36)}`;
  await page.goto(`/moment/${encodeURIComponent(id)}`);
  await page.getByRole("button", { name: "Sign in to leave a memory" }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "← Back" }).click();
  const text = `I was here for this ${name}`;
  await page.getByPlaceholder("I was here when…").fill(text);
  await page.getByRole("button", { name: "Leave a memory" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByPlaceholder("I was here when…")).toHaveValue("");
  await page.getByPlaceholder("I was here when…").fill("claim now at https://not-squeek.xyz");
  await page.getByRole("button", { name: "Leave a memory" }).click();
  await expect(page.getByText(/Links aren't allowed/)).toBeVisible();
  await page.goto(`/archive?room=community`);
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20000 });
  await page.locator("article").getByRole("button", { name }).first().click();
  await expect(page.getByText("Contributions", { exact: true })).toBeVisible();
  await expect(page.getByText(text).first()).toBeVisible();
});

test("a device without WebGL gets the 2D archive, not a blank page", async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type.startsWith("webgl")) return null;
      return (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
  await page.goto("/");
  await expect(page.getByText(/can't draw the 3D world/)).toBeVisible();
  await page.getByRole("link", { name: "Open the archive" }).click();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "The Timeline" })).toBeVisible();
});

test("with the archive unreachable, the page explains and offers a retry", async ({ page }) => {
  await page.route("**/api/v1/**", (r) => r.abort());
  await page.goto("/archive?room=timeline");
  await expect(page.getByText(/can't be reached/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("the 2D archive is keyboard reachable with labelled landmarks", async ({ page }) => {
  await page.goto("/archive?room=future");
  await expect(page.getByRole("heading", { level: 2, name: "The Future" })).toBeVisible();
  await expect(page.getByText("Community predictions")).toBeVisible();
  await page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: /The Wheel Room/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "The Wheel Room" })).toBeVisible();
  await expect(page.getByText("Right now", { exact: true })).toBeVisible();
});

test("sound can be switched on without errors, and live data reaches the page", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop check");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterWorld(page);
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();
  await page.getByRole("button", { name: "Sound on" }).click();
  await expect(page.getByText(/Wheel: (still|running|no fresh reading)/)).toBeVisible({ timeout: 20000 });
  const stream = await page.evaluate(() => new Promise((resolve) => {
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("live", (e) => { es.close(); resolve(JSON.parse((e as MessageEvent).data).provisional); });
    setTimeout(() => { es.close(); resolve("no update"); }, 40000);
  }));
  // The status feed only sends when something changed, so a quiet wheel can legitimately stay silent.
  expect([true, "no update"]).toContain(stream);
  expect(errors).toEqual([]);
});

test("a member can change their name and username", async ({ page }) => {
  const name = `e2e_${Date.now().toString(36)}`;
  await enterWorld(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Wheel Watcher");
  const next = `${name}x`;
  await page.getByLabel(/^Username/).fill(next);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Wheel Watcher" })).toBeVisible();
  await page.getByRole("button", { name: "View public profile" }).click();
  await expect(page.getByText(`@${next}`)).toBeVisible();
});

test("the practice wheel runs, and stays labelled as not measured", async ({ page, isMobile }) => {
  await page.goto("/?room=wheel");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Hop on the practice wheel" }).click();
  const panel = page.getByRole("region", { name: "Wheel run" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/isn't recorded/)).toBeVisible();
  const runButton = panel.getByRole("button", { name: /RUN/ });
  for (let i = 0; i < 8; i++) await runButton.click();
  await expect(panel.getByText(/^[1-9]\d*$/).first()).toBeVisible();
  if (!isMobile) {
    await page.keyboard.press("Space");
    await page.keyboard.press("KeyE");
    await expect(panel).toBeHidden();
  } else {
    await panel.getByRole("button", { name: "Hop off" }).click();
    await expect(panel).toBeHidden();
  }
});

test("room objects offer their own actions up close", async ({ page }) => {
  await page.goto("/?room=community");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByRole("button", { name: /Write your memory on the monument|Explore The Community Archive/ })).toBeVisible({ timeout: 15000 });
  await page.goto("/?room=future");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByRole("button", { name: /wish stone|Sealed|Explore The Future/ })).toBeVisible({ timeout: 15000 });
});

test("the monument's write screen asks for a moment and a memory", async ({ page }) => {
  const name = `e2e_${Date.now().toString(36)}w`;
  await page.goto("/archive?room=community");
  await page.getByRole("button", { name: "Write a memory" }).click();
  await page.getByRole("button", { name: "Sign in to write" }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.getByLabel("The moment")).toBeVisible();
  await page.getByLabel("Your memory").fill(`Lantern from ${name}`);
  await page.getByRole("button", { name: "Hang my lantern" }).click();
  await expect(page.getByText("Your lantern is up.")).toBeVisible();
});

test("a member joins a crew, calls a shift, and can't call it twice", async ({ page }) => {
  const name = `e2e_${Date.now().toString(36)}d`;
  await page.goto("/?room=dig");
  await expect(page.getByRole("heading", { level: 2, name: "The Great Dig" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/of [0-9,]+ settled work/)).toBeVisible();
  await page.getByRole("button", { name: /Tunnel Rats/ }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByRole("button", { name: /Tunnel Rats/ }).click();
  await expect(page.getByText("Your crew: Tunnel Rats")).toBeVisible();
  await page.getByRole("button", { name: /^Stirring/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "You called Stirring" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Asleep/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("You called Stirring")).toBeVisible({ timeout: 20000 });
});

test("the giant wheel in the burrow can be ridden, and boost goes past the unboosted limit", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard journey");
  await enterWorld(page);
  await page.getByRole("navigation", { name: "Rooms" }).getByRole("button", { name: "Burrow", exact: true }).click();
  await page.getByRole("button", { name: "Hop on the giant wheel" }).click({ timeout: 20000 }).catch(async () => {
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyW");
    await page.getByRole("button", { name: "Hop on the giant wheel" }).click();
  });
  const panel = page.getByRole("region", { name: "Wheel run" });
  await expect(panel).toBeVisible();
  await page.keyboard.down("ShiftLeft");
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(60);
  }
  await expect(panel.getByText(/INSANE|OVERDRIVE/)).toBeVisible();
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("My Squeeks shows a wallet's real NFTs with no signature", async ({ page }) => {
  await page.goto("/archive?room=timeline");
  await page.getByRole("button", { name: "My Squeeks" }).click();
  await page.getByPlaceholder("Or paste a wallet address").fill("not-an-address");
  await page.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("That doesn't look like a wallet address.")).toBeVisible();
  await page.getByPlaceholder("Or paste a wallet address").fill("0x8535a46fe5fd088732cf98a63dfbc98d4f038082");
  await page.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("button", { name: /#322/ })).toBeVisible({ timeout: 20000 });
  await expect(page.getByAltText("Squeek #322").first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: /#322/ }).click();
  await expect(page.getByRole("heading", { name: "Squeek #322" })).toBeVisible();
});

test("settings hold quality, motion and sound choices across a reload", async ({ page }) => {
  await enterWorld(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "low", exact: true }).click();
  await page.getByLabel(/Reduced motion/).check();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Rooms" })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "low", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/Reduced motion/)).toBeChecked();
});

test("mobile gets touch controls and a usable compact layout", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile journey");
  await enterWorld(page);
  await expect(page.getByRole("application", { name: "Move" })).toBeVisible();
  // Overflowing content makes phones zoom the whole page out, so check the width against the device too.
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && window.innerWidth <= 450);
  expect(await fits()).toBe(true);
  await page.goto("/archive?room=vault");
  await expect(page.getByRole("heading", { level: 2, name: "The Block Vault" })).toBeVisible();
  expect(await fits()).toBe(true);
  await page.goto("/archive?room=timeline");
  await expect(page.getByRole("heading", { level: 2, name: "The Timeline" })).toBeVisible();
  expect(await fits()).toBe(true);
});
