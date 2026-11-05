"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { api, type EventSummary } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { audio } from "@/lib/audio";
import { RoomSign, useSolid, useSpots } from "./common";

const COLORS: Record<string, string> = { settlement: "#5b7cfa", checkpoint: "#a8baff", milestone: "#f2c230", record: "#ffc048", merge: "#f08fb0", squeek: "#b6b6c2", rewards: "#35d07f", archive: "#fdfbc8", other: "#82828f" };

const AISLE = 1.7;

/** The real timeline as a spiral of pillars. It walks outward from the oldest record at the centre. */
function pillarPosition(i: number, total: number): [number, number] {
  const t = total <= 1 ? 0 : i / (total - 1);
  const angle = t * Math.PI * 6;
  const r = 2.6 + t * 10.4;
  const x = Math.sin(angle) * r;
  const z = -Math.cos(angle) * r;
  // Keeps an aisle clear from the door to the middle of the room.
  return z > 0 && Math.abs(x) < AISLE ? [x < 0 ? -AISLE : AISLE, z] : [x, z];
}

const DARK = new THREE.Color("#1d1916");

export default function TimelineRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.eventBump);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    let live = true;
    api<{ events: EventSummary[] }>("/events?limit=100&minSignificance=2").then((r) => live && setEvents(r.events.slice().reverse())).catch(() => undefined);
    return () => { live = false; };
  }, [bump]);
  useSolid(index, events.map((_, i) => { const [x, z] = pillarPosition(i, events.length); return [x, z, 0.5]; }));
  useSpots(index, events.map((e, i) => {
    const [lx, lz] = pillarPosition(i, events.length);
    return { key: `pillar-${e.id}`, lx, lz, r: 2, label: `Read: ${e.title}`, action: () => { audio?.select(); open({ kind: "event", id: e.id }); } };
  }), events);
  const color = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    const m = ref.current;
    if (!m || !events.length) return;
    const d = new THREE.Object3D();
    events.forEach((e, i) => {
      const [x, z] = pillarPosition(i, events.length);
      const h = 0.7 + e.significance * 0.45;
      d.position.set(x, h / 2, z);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      // Dark columns, with each record's category kept to a thin lit cap.
      const tone = COLORS[e.categorySlug] ?? "#82828f";
      m.setColorAt(i, color.set(tone).lerp(DARK, 0.82));
      const cap = caps.current;
      if (cap) {
        d.position.set(x, h + 0.012, z);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        cap.setMatrixAt(i, d.matrix);
        cap.setColorAt(i, color.set(tone));
      }
    });
    m.count = events.length;
    if (caps.current) {
      caps.current.count = events.length;
      caps.current.instanceMatrix.needsUpdate = true;
      if (caps.current.instanceColor) caps.current.instanceColor.needsUpdate = true;
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [events, color]);
  const hovered = hover !== null ? events[hover] : null;
  const hoveredAt = hover !== null ? pillarPosition(hover, events.length) : null;
  return (
    <group>
      <RoomSign text="The Timeline" color="#5b7cfa" />
      <instancedMesh ref={ref} args={[undefined, undefined, 100]} castShadow
        onClick={(e) => { e.stopPropagation(); if (e.delta < 6 && e.instanceId !== undefined && events[e.instanceId]) { audio?.select(); open({ kind: "event", id: events[e.instanceId].id }); } }}
        onPointerMove={(e) => { e.stopPropagation(); setHover(e.instanceId ?? null); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}>
        <boxGeometry args={[0.42, 1, 0.42]} />
        <meshStandardMaterial roughness={0.36} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, 100]}>
        <boxGeometry args={[0.42, 0.025, 0.42]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {hovered && hoveredAt && (
        <Html position={[hoveredAt[0], 3.6, hoveredAt[1]]} center style={{ pointerEvents: "none", width: 220 }}>
          <div className="card px-2 py-1 text-xs"><p className="text-ink">{hovered.title}</p><p className="font-data text-gray">{hovered.occurredAt.slice(0, 16).replace("T", " ")} UTC</p></div>
        </Html>
      )}
    </group>
  );
}
