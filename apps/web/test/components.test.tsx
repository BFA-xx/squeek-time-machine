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
    useMe.setState({ me: { id: "1", username: "ann", wallet: null, role: "member" }, loaded: true });
    mockApi({ "/community/memories": [] });
    render(<IWasHere subject="event:abc" />);
    fireEvent.change(screen.getByPlaceholderText("I was here when…"), { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Leave a memory"));
    await waitFor(() => expect((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.some(([u, i]) => String(u).includes("/community/memories") && i?.method === "POST" && String(i.body).includes("hello"))).toBe(true));
  });
  it("shows the server's refusal", async () => {
    useMe.setState({ me: { id: "1", username: "ann", wallet: null, role: "member" }, loaded: true });
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
