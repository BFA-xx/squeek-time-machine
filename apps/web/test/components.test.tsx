import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarChart, LineChart } from "@/components/panels/charts";
import { useMe } from "@/components/panels/account";
import { IWasHere, MemoryCard } from "@/components/panels/discussion";
import { EventView } from "@/components/panels/records";
import { VerifyTag } from "@/components/panels/rooms";
import { LiveBadge, SourceBanner } from "@/components/hud/LiveBadge";
import { useWorld } from "@/lib/store";

function mockApi(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response(JSON.stringify({ message: "no" }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }));
}

beforeEach(() => {
  useWorld.setState({ world: null, live: null, connection: "live", panel: null, history: [] });
  useMe.setState({ me: null, loaded: true });
});

describe("live status", () => {
  it("says it's waiting rather than showing a zero", () => {
    render(<LiveBadge />);
    expect(screen.getByText(/waiting for a reading/)).toBeInTheDocument();
  });
  it("labels running data as a measurement", () => {
    useWorld.setState({ live: { rpmMilli: 75500, freshness: "online" } });
    render(<LiveBadge />);
    expect(screen.getByText(/running · 75.5 RPM/)).toBeInTheDocument();
    expect(screen.getByText(/measured/)).toBeInTheDocument();
  });
  it("doesn't call stale data running", () => {
    useWorld.setState({ live: { rpmMilli: 75500, freshness: "stale" } });
    render(<LiveBadge />);
    expect(screen.getByText(/no fresh reading/)).toBeInTheDocument();
    expect(screen.queryByText(/RPM/)).toBeNull();
  });
  it("tells visitors when a feed is down and that nothing is estimated", () => {
    useWorld.setState({ world: { sources: [{ key: "api.events", status: "unavailable", reason: "indexer_unavailable", lastSuccessAt: "2026-11-05T10:31:00.000Z", stale: true }] } as never });
    render(<SourceBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/event feed is unavailable.*last good copy.*Nothing here has been estimated/);
  });
  it("stays quiet when every feed is healthy", () => {
    useWorld.setState({ world: { sources: [{ key: "api.events", status: "ok", reason: null, lastSuccessAt: "x", stale: false }] } as never });
    const { container } = render(<SourceBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("charts", () => {
  const pts = [{ label: "a", value: 1, display: "1" }, { label: "b", value: null, display: "no reading" }, { label: "c", value: 3, display: "3" }];
  it("draws a gap for a missing reading instead of a zero", () => {
    const { container } = render(<LineChart title="Work" series={[{ name: "x", color: "#000", points: pts }]} />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
  it("offers a table view with the same data", () => {
    render(<BarChart title="Distance" points={pts} />);
    fireEvent.click(screen.getByText("Table"));
    expect(screen.getByText("no reading")).toBeInTheDocument();
  });
  it("says so when there's nothing to chart", () => {
    render(<LineChart title="Work" series={[{ name: "x", color: "#000", points: [] }]} />);
    expect(screen.getByText(/No readings yet/)).toBeInTheDocument();
  });
});

describe("community content", () => {
  it("renders hostile text as plain text", () => {
    const { container } = render(<MemoryCard m={{ id: "1", kind: "memory", body: "<img src=x onerror=alert(1)>", createdAt: "2026-11-05T10:00:00.000Z", username: "bob", reactions: {} }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });
  it("marks memories as community content and asks guests to sign in", async () => {
    mockApi({ "/community/memories": [] });
    render(<IWasHere subject="event:abc" />);
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(await screen.findByText(/Sign in to leave a memory/)).toBeInTheDocument();
    await screen.findByText(/No memories here yet/);
  });
  it("posts a memory for a signed-in visitor", async () => {
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    mockApi({ "/community/memories": [] });
    render(<IWasHere subject="event:abc" />);
    fireEvent.change(screen.getByPlaceholderText("I was here when…"), { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Leave a memory"));
    await waitFor(() => expect((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.some(([u, i]) => String(u).includes("/community/memories") && i?.method === "POST" && String(i.body).includes("hello"))).toBe(true));
  });
  it("shows the server's refusal", async () => {
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    vi.stubGlobal("fetch", vi.fn(async (_u: string, i?: RequestInit) => (i?.method === "POST" ? new Response(JSON.stringify({ message: "Links aren't allowed here" }), { status: 400 }) : new Response("[]", { status: 200 }))));
    render(<IWasHere subject="event:abc" />);
    fireEvent.change(screen.getByPlaceholderText("I was here when…"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Leave a memory"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Links aren't allowed here");
  });
});

describe("event detail", () => {
  const base = {
    id: "e1", type: "measurement.speed_record", categorySlug: "record", title: "New top speed", summary: "s", significance: 5, occurredAt: "2026-11-05T05:12:16.000Z", recordedAt: "2026-11-05T05:12:17.000Z",
    provisional: true, confirmationStatus: "measured", transactionHash: null, sourceKind: "measurement", installationId: "i", blockNumber: null, blockHash: null, logIndex: null, contractAddress: null, sourceRef: "https://api.squeekchain.com/v1/events",
    payload: { a: 1 }, eventVersion: 1, category: { slug: "record", label: "Wheel records", group: "measurement" }, installation: { id: "i", releaseId: null }, milestones: [], settlement: null, corrections: [],
    related: { before: null, after: null, sameTransaction: [], sameType: [] },
  };
  it("flags a measurement as uncertified and has no transaction", async () => {
    mockApi({ "/events/e1": base, "/community": [] });
    render(<EventView id="e1" />);
    expect(await screen.findByText("Device measurement")).toBeInTheDocument();
    expect(screen.getByText(/aren't|Only settled work is certified/)).toBeInTheDocument();
    expect(screen.queryByText("Transaction")).toBeNull();
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });
  it("shows a confirmed event with its transaction and corrections", async () => {
    mockApi({ "/events/e1": { ...base, provisional: false, sourceKind: "chain", confirmationStatus: "safe", transactionHash: "0xabcdef1234567890abcdef", corrections: [{ id: "c", field: "confirmationStatus", oldValue: "safe", newValue: "finalized", reason: "source reported", source: "api", createdAt: "2026-11-05T05:12:17.000Z" }] }, "/community": [] });
    render(<EventView id="e1" />);
    expect(await screen.findByText("Confirmed on Ethereum")).toBeInTheDocument();
    expect(screen.getByText("Transaction")).toBeInTheDocument();
    expect(screen.getByText(/changed from “safe” to “finalized”/)).toBeInTheDocument();
  });
  it("offers a retry when the record can't be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    render(<EventView id="e1" />);
    expect(await screen.findByText(/can't be reached/)).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});

describe("the future", () => {
  it("labels predictions apart from facts", () => {
    render(<><VerifyTag v="community" /><VerifyTag v="verified" /><VerifyTag v="official" /><VerifyTag v="unconfirmed" /></>);
    for (const t of ["Community prediction", "Verified fact", "Official docs", "Unconfirmed"]) expect(screen.getByText(t)).toBeInTheDocument();
  });
});

describe("profile editing", () => {
  it("saves name, username and about through the API", async () => {
    const { ProfileForm } = await import("@/components/panels/account");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify({ user: { id: "1", username: "ann_2", displayName: "Ann", bio: "hi", wallet: null, role: "member" } }), { status: 200 });
    }));
    render(<ProfileForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "ann_2" } });
    fireEvent.click(screen.getByText("Save profile"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(calls[0].url).toContain("/users/me/profile");
    expect(JSON.parse(calls[0].body)).toMatchObject({ displayName: "Ann", username: "ann_2" });
    expect(useMe.getState().me?.username).toBe("ann_2");
  });
  it("shows why a change was refused", async () => {
    const { ProfileForm } = await import("@/components/panels/account");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "That username is taken." }), { status: 409 })));
    render(<ProfileForm />);
    fireEvent.click(screen.getByText("Save profile"));
    expect(await screen.findByRole("alert")).toHaveTextContent("taken");
  });
});

describe("The Great Dig", () => {
  const state = {
    status: "available", round: "300", frontier: "290", work: "4250",
    chamber: { number: 5, from: "4000", target: "5000", progressBps: 2500 },
    shift: { open: { index: 9, startsAt: "2026-11-06T02:00:00.000Z", endsAt: "2026-11-06T08:00:00.000Z", locksAt: "2026-11-06T02:00:00.000Z", calls: 3, startRound: "325", endRound: "360" }, running: { index: 8, startsAt: "2026-11-05T20:00:00.000Z", endsAt: "2026-11-06T02:00:00.000Z", picks: { asleep: 1, stirring: 0, running: 2, sprinting: 0 } } },
    results: [{ index: 7, band: "running", workUnits: "420", settledAt: "2026-11-05T20:10:00.000Z", transactionHash: "0xabc0000000000000000000", picks: { asleep: 0, stirring: 1, running: 1, sprinting: 0 } }],
    chambers: [{ number: 4, target: "4000", brokeAt: "2026-11-05T05:00:00.000Z", transactionHash: "0xdef0000000000000000000", crew: "sandbath" }],
    crews: [{ slug: "nightshift", name: "The Night Shift", color: "#000", motto: "m", points: 12, members: 2, chambers: 0 }, { slug: "sandbath", name: "Sand Bath", color: "#000", motto: "m", points: 40, members: 1, chambers: 1 }],
    leaderboard: [{ username: "ann", displayName: "Ann", points: 40, wins: 1, crew: "sandbath", squeekId: "322", squeekLevel: 2 }],
    me: null,
  };
  it("shows real progress, the open call and that it's free", async () => {
    const { DigPanel } = await import("@/components/panels/dig");
    mockApi({ "/dig": state, "/auth/me": { user: null } });
    render(<DigPanel />);
    expect(await screen.findByText("Chamber 5")).toBeInTheDocument();
    expect(screen.getByText(/4,250 of 5,000 settled work/)).toBeInTheDocument();
    expect(screen.getByText(/Call shift 9/)).toBeInTheDocument();
    expect(screen.getByText(/Points have no value/)).toBeInTheDocument();
    expect(screen.getByText(/claimed by Sand Bath/)).toBeInTheDocument();
    expect(screen.getByText(/Squeek #322 · Lv 2/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 called it/)).toBeInTheDocument();
  });
  it("sends a guest to sign in instead of failing", async () => {
    const { DigPanel } = await import("@/components/panels/dig");
    mockApi({ "/dig": state, "/auth/me": { user: null } });
    render(<DigPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /^Asleep/ }));
    expect(useWorld.getState().panel).toEqual({ kind: "account" });
  });
  it("locks the buttons once a call is made", async () => {
    const { DigPanel } = await import("@/components/panels/dig");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    mockApi({ "/dig/squeeks": { wallet: null, squeeks: [] }, "/dig": { ...state, me: { crew: "sandbath", squeekId: null, squeekLevel: null, openCall: "running", points: 40, wins: 1, played: 2, streak: 1, recent: [{ shiftIndex: 7, band: "running", correct: true, points: 40 }] } } });
    render(<DigPanel />);
    expect(await screen.findByText(/You called Running/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Asleep/ })).toBeDisabled();
    expect(screen.getByText(/You were right: \+40/)).toBeInTheDocument();
  });
  it("shows today's tasks, and only offers a claim the server says is ready", async () => {
    const { DigPanel } = await import("@/components/panels/dig");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: null, role: "member" }, loaded: true });
    const tasks = [
      { slug: "call", name: "Call the next shift", how: "h", points: 10, claimed: false, ready: true, room: false },
      { slug: "memory", name: "Write a memory", how: "Add a memory", points: 5, claimed: false, ready: false, room: false },
      { slug: "hello", name: "Say hello", how: "Send an emote", points: 3, claimed: true, ready: false, room: true },
    ];
    mockApi({ "/dig/squeeks": { wallet: null, squeeks: [] }, "/dig": { ...state, me: { crew: "sandbath", squeekId: null, squeekLevel: null, openCall: null, points: 3, wins: 0, played: 0, streak: 0, recent: [], tasks, taskPoints: 3 } } });
    render(<DigPanel />);
    expect(await screen.findByRole("button", { name: "Claim +10" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Claim/ })).toHaveLength(1);
    expect(screen.getByText("Done: Say hello")).toBeInTheDocument();
    expect(screen.getByText(/aren't on chain/)).toBeInTheDocument();
  });
  it("explains when the dig can't run", async () => {
    const { DigPanel } = await import("@/components/panels/dig");
    mockApi({ "/dig": { status: "unavailable", reason: "The round clock isn't known yet." }, "/auth/me": { user: null } });
    render(<DigPanel />);
    expect(await screen.findByText(/round clock/)).toBeInTheDocument();
  });
});

describe("My Squeeks", () => {
  const W = "0x8535a46fe5fd088732cf98a63dfbc98d4f038082";
  const owned = { wallet: W, installationId: "rel-1", partial: false, counts: null, claimableBaseUnits: "2000000000000000000", power: null, tokens: [{ tokenId: "322", custody: "staking", level: 2, basePower: "2200", nextMergeHeight: "0", mergeState: "ready" }, { tokenId: "323", custody: "wallet", level: 1, basePower: "1000", nextMergeHeight: "0", mergeState: "ready" }] };
  beforeEach(() => { localStorage.clear(); });
  it("lets a visitor view by pasted address, with no wallet in the browser", async () => {
    const { SqueeksPanel } = await import("@/components/panels/squeeks");
    mockApi({ "/squeeks/owner/": owned, "/auth/me": { user: null } });
    render(<SqueeksPanel />);
    fireEvent.click(screen.getByText("Connect wallet"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No wallet found/);
    fireEvent.change(screen.getByPlaceholderText(/paste a wallet address/), { target: { value: W } });
    fireEvent.click(screen.getByText("View"));
    expect(await screen.findByText("#322")).toBeInTheDocument();
    expect(screen.getByText(/Lv 2 · Staked/)).toBeInTheDocument();
    expect(screen.getByText(/Squeeks held in a wallet earn nothing/)).toBeInTheDocument();
    expect(screen.getByText(/no monetary value/)).toBeInTheDocument();
  });
  it("connects with an account request only, never a signature", async () => {
    const { SqueeksPanel } = await import("@/components/panels/squeeks");
    mockApi({ "/squeeks/owner/": owned, "/auth/me": { user: null } });
    const request = vi.fn(async () => [W]);
    vi.stubGlobal("ethereum", { request });
    window.ethereum = { request } as never;
    render(<SqueeksPanel />);
    fireEvent.click(screen.getByText("Connect wallet"));
    expect(await screen.findByText("#322")).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    delete (window as { ethereum?: unknown }).ethereum;
  });
  it("uses a signed-in member's linked wallet without asking", async () => {
    const { SqueeksPanel } = await import("@/components/panels/squeeks");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: W, role: "member" }, loaded: true });
    mockApi({ "/squeeks/owner/": owned });
    render(<SqueeksPanel />);
    expect(await screen.findByText("#322")).toBeInTheDocument();
  });
  it("says so when the API is down, rather than showing an empty wallet", async () => {
    const { SqueeksPanel } = await import("@/components/panels/squeeks");
    useMe.setState({ me: { id: "1", username: "ann", displayName: null, bio: "", wallet: W, role: "member" }, loaded: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "The official API can't show this wallet's Squeeks right now." }), { status: 503 })));
    render(<SqueeksPanel />);
    expect(await screen.findByText(/can't show this wallet/)).toBeInTheDocument();
    expect(screen.queryByText(/doesn't hold any Squeeks/)).toBeNull();
  });
});
