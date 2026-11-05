"use client";
import { formatInt, mmPerSecToKmh } from "@stm/shared";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { input } from "../world/input";
import { ride, rideTap, rideTier, speedMmS } from "../world/ride";

/** The Wheel Room's game: how close can you get to the speed Squeektoshi really hit? */
export function RidePanel() {
  const setRide = useWorld((s) => s.setRide);
  const [, tick] = useState(0);
  const run = useRef<HTMLButtonElement>(null);
  const { data } = useApi<{ stats: { records?: { peakObservedSpeedMmPerSecond?: { value: string } } } | null }>("/wheel");
  const record = Number(data?.stats?.records?.peakObservedSpeedMmPerSecond?.value ?? 0) || null;
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);
  const where = useWorld((s) => s.ride);
  const best = ride.topSpeedMmS;
  const tier = rideTier(ride.rpm);
  const beat = record !== null && best > record;
  return (
    <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 pointer-events-none">
      <section aria-label="Wheel run" className="card pointer-events-auto w-full max-w-md p-3 bg-bg/90">
        <div className="flex items-center justify-between gap-2">
          <h2 className="title text-2xl text-amber">{where === "hub" ? "The giant wheel" : "Practice wheel"} <span className={`ml-1 font-data text-xs align-middle ${tier === "OVERDRIVE" ? "text-rose" : tier === "INSANE" ? "text-amber" : "text-gray"}`}>{tier}</span></h2>
          <button className="btn" onClick={() => setRide(false)}>Hop off</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 font-data text-center">
          <div><p className="label">RPM</p><p className="text-2xl text-ink">{Math.round(ride.rpm)}</p></div>
          <div><p className="label">km/h</p><p className="text-2xl text-ink">{mmPerSecToKmh(speedMmS(ride.rpm))}</p></div>
          <div><p className="label">Metres</p><p className="text-2xl text-ink">{formatInt(Math.floor(ride.distanceMm / 1000))}</p></div>
        </div>
        <p className="text-xs text-dim mt-2">
          {record === null ? "Your top" : "Your top vs Squeektoshi's measured best"}: <span className="text-ink font-data">{mmPerSecToKmh(best)} km/h</span>
          {record !== null && <> vs <span className="text-gold font-data">{mmPerSecToKmh(record)} km/h</span></>}
          {" "}· personal best <span className="font-data text-ink">{mmPerSecToKmh(ride.best)}</span>
          {beat && <span className="block text-mint mt-1">You beat his record. On a practice wheel, anyway.</span>}
        </p>
        <button ref={run} className="btn btn-gold w-full mt-2 py-3 text-base touch-manipulation" onPointerDown={(e) => { e.preventDefault(); rideTap(); }} onClick={(e) => { if (e.detail === 0) rideTap(); }}>
          RUN <span className="hidden md:inline opacity-70">(tap Space, W or X)</span><span className="md:hidden">(keep tapping)</span>
        </button>
        <button className="btn w-full mt-1 py-2 touch-manipulation select-none" aria-label="Hold to boost" onPointerDown={(e) => { e.preventDefault(); input.keyBoost = 1; }} onPointerUp={() => { input.keyBoost = 0; }} onPointerCancel={() => { input.keyBoost = 0; }} onPointerLeave={() => { input.keyBoost = 0; }}>
          HOLD TO BOOST <span className="hidden md:inline opacity-70">(or hold Shift or R2)</span>
        </button>
        <p className="text-[11px] text-gray mt-2">Just for fun. Your run isn't work, isn't recorded, and never counts as wheel data.</p>
      </section>
    </div>
  );
}
