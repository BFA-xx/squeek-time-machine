/** Things a visitor can use once they're close. Rooms add them as they load, and take them away when they unload. */
export interface Spot { key: string; x: number; z: number; r: number; label: string; action: () => void }
type Point = { x: number; z: number };
type Resolver = (p: Point) => Spot | null;

const spots = new Set<Spot>();
const resolvers = new Set<Resolver>();

export function addSpots(list: Spot[]) {
  list.forEach((s) => spots.add(s));
  return () => list.forEach((s) => spots.delete(s));
}

/** For long rows of objects, where one spot per object would be wasteful. */
export function addResolver(fn: Resolver) {
  resolvers.add(fn);
  return () => {
    resolvers.delete(fn);
  };
}

/** The closest usable thing, measured against its own reach. */
export function nearestSpot(p: Point): Spot | null {
  let best: Spot | null = null;
  let bestScore = Infinity;
  const check = (s: Spot) => {
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < s.r && d / s.r < bestScore) {
      best = s;
      bestScore = d / s.r;
    }
  };
  spots.forEach(check);
  resolvers.forEach((fn) => {
    const s = fn(p);
    if (s) check(s);
  });
  return best;
}

export const focus: { current: (Point & { r: number }) | null } = { current: null };
