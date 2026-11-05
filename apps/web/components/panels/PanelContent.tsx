"use client";
import { useWorld, type Panel } from "@/lib/store";
import { AccountPanel } from "./account";
import { SEEDS } from "./discoveries";
import { BlockView, EventView, TimelinePanel, VaultPanel } from "./records";
import { ArtifactView, BeginningPanel, CommunityPanel, EvolutionPanel, FuturePanel, SearchPanel, UserPanel, WheelPanel } from "./rooms";
import { SettingsPanel } from "../hud/SettingsPanel";
import { Heading } from "./ui";

export function PanelContent({ panel }: { panel: Panel }) {
  const found = useWorld((s) => s.found);
  switch (panel.kind) {
    case "room":
      switch (panel.room) {
        case "beginning": return <BeginningPanel />;
        case "timeline": return <TimelinePanel />;
        case "wheel": return <WheelPanel />;
        case "vault": return <VaultPanel />;
        case "evolution": return <EvolutionPanel />;
        case "community": return <CommunityPanel />;
        case "future": return <FuturePanel />;
      }
      return null;
    case "event": return <EventView key={panel.id} id={panel.id} />;
    case "block": return <BlockView key={panel.height} height={panel.height} />;
    case "artifact": return <ArtifactView slug={panel.slug} />;
    case "user": return <UserPanel key={panel.username} username={panel.username} />;
    case "search": return <SearchPanel />;
    case "settings": return <SettingsPanel />;
    case "account": return <AccountPanel />;
    case "discovery": {
      const s = SEEDS.find((x) => x.slug === panel.slug);
      if (!s) return null;
      return (
        <article>
          <Heading eyebrow={`Discovery ${found.length} of ${SEEDS.length}`} title={s.title} />
          <p className="text-ink leading-relaxed">{s.body}</p>
          <p className="mt-3"><a className="text-sky underline underline-offset-2 text-sm" href={s.source} target="_blank" rel="noopener noreferrer nofollow">From the official docs ↗</a></p>
        </article>
      );
    }
  }
}
