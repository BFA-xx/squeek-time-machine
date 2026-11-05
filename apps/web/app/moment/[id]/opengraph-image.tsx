import { formatUtc } from "@stm/shared";
import { ogCard, OG_SIZE } from "@/lib/og";
import { serverFetch } from "@/lib/server-api";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A moment in Squeekchain's history";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await serverFetch<{ title: string; summary: string; occurredAt: string; provisional: boolean; sourceKind: string; category: { label: string } }>(`/events/${encodeURIComponent(decodeURIComponent(id))}`);
  if (!e) return ogCard({ eyebrow: "Squeek Time Machine", title: "Walk through Squeekchain's history", foot: "A community-built living archive" });
  const proof = e.sourceKind === "archive" ? "Archive note" : e.provisional ? "Device measurement" : "Confirmed on Ethereum";
  return ogCard({ eyebrow: e.category.label, title: e.title, body: e.summary, foot: `${formatUtc(e.occurredAt)} · ${proof}` });
}
