import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedRecord } from "@/components/hud/SharedRecord";
import { serverFetch } from "@/lib/server-api";

type Props = { params: Promise<{ height: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { height } = await params;
  const t = `Squeek block ${height}`;
  return { title: `${t} | Squeek Time Machine`, description: `${t} in the Block Vault.`, openGraph: { title: t }, twitter: { card: "summary_large_image", title: t } };
}

export default async function BlockPage({ params }: Props) {
  const { height } = await params;
  if (!(await serverFetch(`/blocks/${encodeURIComponent(height)}`))) notFound();
  return <SharedRecord panel={{ kind: "block", height }} worldHref={`/?block=${encodeURIComponent(height)}`} />;
}
