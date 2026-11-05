"use client";
import { Text } from "@react-three/drei";
import { useEffect } from "react";
import type { Panel } from "@/lib/store";
import { audio } from "@/lib/audio";
import { addObstacles, roomPoint } from "../layout";
import { addSpots, type Spot } from "../spots";

export const WORLD_FONT = "/fonts/barlow-condensed-600.woff";

export const useSolid = (roomI: number, solids: [number, number, number][]) => {
  const key = JSON.stringify(solids);
  useEffect(() => addObstacles(solids.map(([lx, lz, r]) => ({ ...roomPoint(roomI, lx, lz), r }))), [roomI, key]); // eslint-disable-line react-hooks/exhaustive-deps
};

/** Registers things to use, in the room's own coordinates. `version` says when the labels or actions changed. */
export function useSpots(roomI: number, list: (Omit<Spot, "x" | "z"> & { lx: number; lz: number })[], version: unknown) {
  useEffect(() => addSpots(list.map(({ lx, lz, ...s }) => ({ ...s, ...roomPoint(roomI, lx, lz) }))), [roomI, version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function clickable(open: (p: Panel) => void, panel: Panel) {
  return {
    onClick: (e: { stopPropagation: () => void; delta: number }) => {
      e.stopPropagation();
      if (e.delta < 6) {
        audio?.select();
        open(panel);
      }
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  };
}

/** A carved sign over a room's far wall, set in the brand's display face and served from this site. */
export function RoomSign({ text, color, z = -15.2, y = 5.8 }: { text: string; color: string; z?: number; y?: number }) {
  return (
    <Text font={WORLD_FONT} position={[0, y, z]} fontSize={1.5} color={color} anchorX="center" anchorY="middle" letterSpacing={0.04} outlineWidth={0.02} outlineColor="#0b0b0d">
      {text.toUpperCase()}
      <meshBasicMaterial color={color} toneMapped={false} />
    </Text>
  );
}
