import { describe, expect, it } from "vitest";
import { ApiEvent, blocksFromSettlement, checkUserText, formatSqk, milestonesCrossed, nextDistanceThresholds, normalizeEvent, parseSubject, usernameAllowed } from "./index";

const chainEvent = {
  id: "chain:1:a:b:243:system.settlement_completed", eventVersion: 2, occurredAt: "2026-10-28T23:30:36.000Z", recordedAt: "2026-10-28T23:30:36.000Z",
  source: { kind: "chain", chainId: "11155111", target: "sepolia", releaseId: "r1", contractAddress: "0xabc", blockNumber: "12015621", blockHash: "0xdef", transactionHash: "0x1656", transactionIndex: "103", logIndex: "243", confirmationStatus: "safe" },
  type: "system.settlement_completed",
  payload: { previousSettledThroughRound: "345", settledThroughRound: "346", activeRoundCount: "1", workAdded: "609", completedBlockCount: "56", firstCompletedBlock: "2311", lastCompletedBlock: "2366" },
};
const measuredEvent = {
  id: "measurement:i:p:measurement.distance_milestone:20000000", eventVersion: 1, occurredAt: "2026-10-28T22:39:10.693Z", recordedAt: "2026-10-28T22:39:11.288Z",
  source: { kind: "measurement", installationId: "i", receiptCursor: "1", telemetryId: "t", observedAt: "2026-10-28T22:39:10.693Z", receivedAt: "2026-10-28T22:39:11.288Z", policyVersion: "p", disposition: "accepted" },
  type: "measurement.distance_milestone", payload: { thresholdDistanceMm: "20000000", observedLifetimeDistanceMm: "20005230" },
};

describe("normalizeEvent", () => {
  it("keeps chain provenance and states what the payload said", () => {
    const n = normalizeEvent(ApiEvent.parse(chainEvent));
    expect(n.title).toBe("56 Squeek blocks settled");
    expect(n.transactionHash).toBe("0x1656");
    expect(n.provisional).toBe(false);
    expect(n.confirmationStatus).toBe("safe");
    expect(n.occurredAt.toISOString()).toBe("2026-10-28T23:30:36.000Z");
  });
  it("marks wheel measurements provisional, never confirmed", () => {
    const n = normalizeEvent(ApiEvent.parse(measuredEvent));
    expect(n.provisional).toBe(true);
    expect(n.transactionHash).toBeNull();
    expect(n.category).toBe("milestone");
    expect(n.title).toBe("20 km lifetime distance");
  });
  it("keeps an unknown event type instead of dropping or inventing it", () => {
    const n = normalizeEvent(ApiEvent.parse({ ...chainEvent, id: "x", type: "system.something_new", payload: { a: "1" } }));
    expect(n.category).toBe("other");
    expect(n.title).toBe("system.something_new");
  });
  it("refuses a malformed event", () => {
    expect(ApiEvent.safeParse({ ...chainEvent, source: { kind: "chain" } }).success).toBe(false);
  });
  it("refuses an unreadable timestamp rather than inventing one", () => {
    expect(() => normalizeEvent(ApiEvent.parse({ ...chainEvent, occurredAt: "not-a-real-date" }))).toThrow(/timestamp/);
  });
});

describe("blocksFromSettlement", () => {
  it("lists each completed block", () => {
    expect(blocksFromSettlement({ transactionHash: "t", firstCompletedBlock: "349", lastCompletedBlock: "351", completedBlockCount: "3" })).toEqual([349n, 350n, 351n]);
  });
  it("gives nothing for a quiet settlement", () => {
    expect(blocksFromSettlement({ transactionHash: "t", firstCompletedBlock: null, lastCompletedBlock: null, completedBlockCount: "0" })).toEqual([]);
  });
  it("refuses a range that disagrees with its count", () => {
    expect(() => blocksFromSettlement({ transactionHash: "t", firstCompletedBlock: "1", lastCompletedBlock: "5", completedBlockCount: "2" })).toThrow();
  });
});

describe("milestones", () => {
  it("produces stable keys, so a replay can't duplicate one", () => {
    const a = milestonesCrossed("i", { blockHeight: 366n, settlements: 43n });
    const b = milestonesCrossed("i", { blockHeight: 366n, settlements: 43n });
    expect(a.map((m) => m.key)).toEqual(b.map((m) => m.key));
    expect(a.map((m) => m.key)).toContain("i:blocks:250");
    expect(a.map((m) => m.key)).not.toContain("i:blocks:500");
  });
  it("follows the documented distance ladder", () => {
    expect(nextDistanceThresholds(3_351_326n, 3)).toEqual([5, 10, 15]);
    expect(nextDistanceThresholds(120_000_000n, 2)).toEqual([150, 200]);
  });
});

describe("community text", () => {
  it("accepts ordinary memories", () => expect(checkUserText("I was here when this block finished 🐹", 400).ok).toBe(true));
  it("blocks outside links", () => {
    expect(checkUserText("claim at https://squeek-claim.xyz/now", 400).reason).toBe("links_blocked");
    expect(checkUserText("visit evil-site.top", 400).reason).toBe("links_blocked");
  });
  it("allows the official site and the explorer", () => {
    expect(checkUserText("see https://sepolia.etherscan.io/tx/0xabc", 400).ok).toBe(true);
    expect(checkUserText("https://squeekchain.com/status", 400).ok).toBe(true);
  });
  it("blocks wallet phishing language", () => expect(checkUserText("send me your seed phrase", 400).ok).toBe(false));
  it("strips control and direction-override characters", () => expect(checkUserText("hi‮there\u0000", 400).text).toBe("hithere"));
  it("enforces length", () => expect(checkUserText("a b ".repeat(200), 100).reason).toBe("too_long"));
  it("keeps markup as inert text", () => expect(checkUserText("<script>alert(1)</script>", 400).text).toContain("<script>"));
  it("reserves official names", () => {
    expect(usernameAllowed("Squeektoshi")).toBe(false);
    expect(usernameAllowed("outis_1")).toBe(true);
    expect(usernameAllowed("a b")).toBe(false);
  });
  it("only accepts known subjects", () => {
    expect(parseSubject("event:abc")).toEqual({ kind: "event", id: "abc" });
    expect(parseSubject("admin:1")).toBeNull();
  });
});

describe("format", () => {
  it("uses integer maths for SQK", () => expect(formatSqk("66142272600198236206048", 2)).toBe("66,142.27"));
});
