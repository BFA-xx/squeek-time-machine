import type { Metadata } from "next";
import { ArchiveHome } from "@/components/hud/ArchiveHome";

export const metadata: Metadata = { title: "2D archive | Squeek Time Machine", description: "All of Squeekchain's history in a lightweight, accessible view." };

export default function Page() {
  return <ArchiveHome />;
}
