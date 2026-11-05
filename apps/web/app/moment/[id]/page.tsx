import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedRecord } from "@/components/hud/SharedRecord";
import { serverFetch } from "@/lib/server-api";

type Props = { params: Promise<{ id: string }> };
const load = async (id: string) => serverFetch<{ id: string; title: string; summary: string }>(`/events/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await load(decodeURIComponent(id));
  if (!e) return { title: "Squeek Time Machine" };
  return { title: `${e.title} | Squeek Time Machine`, description: e.summary, openGraph: { title: e.title, description: e.summary }, twitter: { card: "summary_large_image", title: e.title, description: e.summary } };
}

export default async function MomentPage({ params }: Props) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  if (!(await load(decoded))) notFound();
  return <SharedRecord panel={{ kind: "event", id: decoded }} worldHref={`/?moment=${encodeURIComponent(decoded)}`} />;
}
