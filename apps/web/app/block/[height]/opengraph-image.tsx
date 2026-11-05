import { formatInt, formatUtc } from "@stm/shared";
import { ogCard, OG_SIZE } from "@/lib/og";
import { serverFetch } from "@/lib/server-api";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Squeek block";

export default async function Image({ params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  const b = await serverFetch<{ height: string; completedAt: string; settlement: { completedBlockCount: string } }>(`/blocks/${encodeURIComponent(height)}`);
  if (!b) return ogCard({ eyebrow: "The Block Vault", title: "Squeek Time Machine", foot: "A community-built living archive" });
  return ogCard({ eyebrow: "The Block Vault", title: `Squeek block ${formatInt(b.height)}`, body: `Completed with ${formatInt(b.settlement.completedBlockCount)} blocks in one settlement.`, foot: `${formatUtc(b.completedAt)} · Confirmed on Ethereum` });
}
