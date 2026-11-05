import { net } from "@/lib/multiplayer";

/**
 * The rideable wheels. The visitor's own legs drive them. None of this is telemetry, and it
 * never touches the archive or the measured figures shown next to it.
 */
const MM_PER_REV = 878; // From the official status example: 1127 mm/s at 77.005 RPM.
export const MAX_RPM = 260;
const BEST_KEY = "stm.ride.best";

export const ride = { rpm: 0, distanceMm: 0, topSpeedMmS: 0, best: 0, boost: 0, angle: 0, netAccel: 0, lastRpm: 0 };

export const speedMmS = (rpm: number) => (rpm / 60) * MM_PER_REV;

/** 0 at a standstill, 1 flat out. Every speed effect reads this. */
export const rideIntensity = () => Math.min(1, ride.rpm / MAX_RPM);

export const rideTier = (rpm: number) => (rpm >= 200 ? "OVERDRIVE" : rpm >= 130 ? "INSANE" : rpm >= 70 ? "FAST" : rpm > 5 ? "ROLLING" : "READY");

export function rideStart() {
  ride.rpm = 0;
  ride.distanceMm = 0;
  ride.topSpeedMmS = 0;
  ride.boost = 0;
  ride.angle = 0;
  ride.netAccel = 0;
  ride.lastRpm = 0;
  try {
    ride.best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    ride.best = 0;
  }
}

/** A tap is worth more while boosting: hold R2, Shift or the boost button. */
export function rideTap() {
  ride.rpm = Math.min(MAX_RPM, ride.rpm + 11 + 18 * ride.boost);
  net.taps++;
  if (ride.boost > 0.5) net.boosted = true;
}

/**
 * Where the rider sits around the rim, in radians from the bottom. Slowing down, they stop keeping
 * up with the wheel, so it carries them up the side along the rim, and they swing back to rest.
 */
export function rideAngleUpdate(dt: number) {
  const accel = (ride.rpm - ride.lastRpm) / Math.max(dt, 0.001);
  ride.lastRpm = ride.rpm;
  ride.netAccel += (accel - ride.netAccel) * Math.min(1, dt * 5);
  const target = ride.netAccel < 0 ? Math.min(1.05, -ride.netAccel * 0.013) : Math.max(-0.1, -ride.netAccel * 0.0015);
  ride.angle += (target - ride.angle) * Math.min(1, dt * 3.2);
  return ride.angle;
}

/** `shared` is what everyone on this wheel has built up between them. Running with others pulls you up to it. */
export function rideUpdate(dt: number, shared = 0) {
  // Fades quickly, and boost holds it up. Unboosted, about seven steps a second holds 80 RPM.
  const fade = (ride.rpm * 0.9 + 6) * (1 - 0.4 * ride.boost);
  ride.rpm = Math.max(0, ride.rpm - fade * dt);
  if (shared > ride.rpm) ride.rpm = Math.min(MAX_RPM, ride.rpm + (shared - ride.rpm) * Math.min(1, dt * 4));
  const speed = speedMmS(ride.rpm);
  ride.distanceMm += speed * dt;
  if (speed > ride.topSpeedMmS) ride.topSpeedMmS = speed;
  if (speed > ride.best) {
    ride.best = speed;
    try {
      localStorage.setItem(BEST_KEY, String(Math.round(speed)));
    } catch {}
  }
}

/** The practice wheel as seen by someone standing next to it: your own run, or else whoever's on it. */
export const practiceWheel = {
  get rpm() {
    return ride.rpm > 0 ? ride.rpm : Math.min(MAX_RPM, net.wheels[2][0]);
  },
};
/** The giant wheel while other players are running it. */
export const hubWheel = {
  get rpm() {
    return Math.min(MAX_RPM, net.wheels[1][0]);
  },
};
