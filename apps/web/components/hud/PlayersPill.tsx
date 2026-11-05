"use client";
import { CREWS, EMOTES, ROOMS, type Emote } from "@stm/shared";
import { useEffect, useState } from "react";
import { net, sendEmote, useNet } from "@/lib/multiplayer";
import { useWorld } from "@/lib/store";
import { locate } from "../world/layout";

const EMOTE_NAME: Record<Emote, string> = { wave: "Wave", squeek: "Squeek", cheese: "Cheese", wheel: "Wheel" };

function where(id: number) {
  const p = net.players.get(id);
  if (!p) return "";
  if (p.r === 1) return "On the giant wheel";
  if (p.r === 2) return "On the practice wheel";
  const at = locate({ x: p.x, z: p.z });
  return at === "hub" ? "The Burrow" : at === "tunnel" ? "In a tunnel" : ROOMS.find((r) => r.slug === at)?.name ?? "";
}

/** Who else is here. It stays out of the way when multiplayer's off, so single-player looks the same as ever. */
export function PlayersPill() {
  const status = useNet((s) => s.status);
  const roster = useNet((s) => s.roster);
  const open = useWorld((s) => s.openPanel);
  const [expanded, setExpanded] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const t = setInterval(() => tick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, [expanded]);
  if (status === "off" || status === "connecting") return null;
  if (status === "full") return <p className="label bg-bg/60 px-2 py-1 w-fit">The burrow's full. Trying again soon.</p>;
  if (status === "replaced") return <p className="label bg-bg/60 px-2 py-1 w-fit">You're playing in another tab.</p>;
  const count = roster.length;
  return (
    <div className="bg-bg/70 w-fit max-w-[18rem] pointer-events-auto">
      <button className="label px-2 py-1 flex items-center gap-1.5" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-mint" />
        {count === 0 ? "Just you here" : `${count} other${count === 1 ? "" : "s"} here`}
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          <div className="flex flex-wrap gap-1 mb-1.5">
            {EMOTES.map((e, i) => <button key={e} className="btn py-0.5 px-1.5 text-xs" onClick={() => sendEmote(e)}>{EMOTE_NAME[e]} <span className="hidden md:inline opacity-60">{i + 1}</span></button>)}
          </div>
          {count === 0 ? <p className="text-xs text-dim">Nobody else is in the burrow right now.</p> : (
            <ul className="max-h-48 overflow-y-auto text-xs space-y-1">
              {roster.map((p) => {
                const crew = CREWS.find((c) => c.slug === p.crew);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    {p.username
                      ? <button className="truncate text-left text-ink underline-offset-2 hover:underline" style={{ color: crew?.color }} onClick={() => open({ kind: "user", username: p.username! })}>{p.name}</button>
                      : <span className="truncate text-dim">{p.name}</span>}
                    <span className="text-gray shrink-0">{where(p.id)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
