/**
 * The rideable wheels. The visitor's own legs drive them. None of this is telemetry, and it
 * never touches the archive or the measured figures shown next to it.
 */
const MM_PER_REV = 878; // From the official status example: 1127 mm/s at 77.005 RPM.
export const MAX_RPM = 260;
const BEST_KEY = "stm.ride.best";

export const ride = { rpm: 0, distanceMm: 0, topSpeedMmS: 0, best: 0, boost: 0 };

export const speedMmS = (rpm: number) => (rpm / 60) * MM_PER_REV;

/** 0 at a standstill, 1 flat out. Every speed effect reads this. */
export const rideIntensity = () => Math.min(1, ride.rpm / MAX_RPM);

export const rideTier = (rpm: number) => (rpm >= 200 ? "OVERDRIVE" : rpm >= 130 ? "INSANE" : rpm >= 70 ? "FAST" : rpm > 5 ? "ROLLING" : "READY");

export function rideStart() {
  ride.rpm = 0;
  ride.distanceMm = 0;
  ride.topSpeedMmS = 0;
  ride.boost = 0;
  try {
    ride.best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    ride.best = 0;
  }
}

/** A tap is worth more while boosting: hold R2, Shift or the boost button. */
export function rideTap() {
  ride.rpm = Math.min(MAX_RPM, ride.rpm + 11 + 18 * ride.boost);
}

export function rideUpdate(dt: number) {
  // Fades quickly, and boost holds it up. Unboosted, about seven steps a second holds 80 RPM.
  const fade = (ride.rpm * 0.9 + 6) * (1 - 0.4 * ride.boost);
  ride.rpm = Math.max(0, ride.rpm - fade * dt);
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
