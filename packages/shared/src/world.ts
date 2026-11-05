export const ROOMS = [
  { slug: "beginning", name: "The Beginning", tagline: "Where the wheel started turning", color: "#f2c230", angle: 0 },
  { slug: "timeline", name: "The Timeline", tagline: "Walk through everything that happened", color: "#5b7cfa", angle: 1 },
  { slug: "wheel", name: "The Wheel Room", tagline: "WHEELY9000, measured", color: "#ffc048", angle: 2 },
  { slug: "vault", name: "The Block Vault", tagline: "Every Squeek block, on the shelf", color: "#35d07f", angle: 3 },
  { slug: "evolution", name: "The Evolution Room", tagline: "How the numbers grew", color: "#a8baff", angle: 4 },
  { slug: "community", name: "The Community Archive", tagline: "I was here", color: "#f08fb0", angle: 5 },
  { slug: "future", name: "The Future", tagline: "What's still locked", color: "#fdfbc8", angle: 6 },
] as const;
export type RoomSlug = (typeof ROOMS)[number]["slug"];

export const BRAND = {
  bg: "#0b0b0d",
  raised: "#0f0f12",
  bench: "#1a1a20",
  line: "#26262f",
  ink: "#e6e6ec",
  dim: "#b6b6c2",
  gray: "#82828f",
  gold: "#f2c230",
  goldHi: "#ffc048",
  blue: "#5b7cfa",
  blueHi: "#a8baff",
  green: "#35d07f",
  cream: "#fdfbc8",
  fur: "#c99762",
  face: "#d4a775",
  ear: "#c07e72",
} as const;

export type Verification = "verified" | "official" | "community" | "unconfirmed";
export const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: "Verified fact",
  official: "Official docs",
  community: "Community prediction",
  unconfirmed: "Unconfirmed",
};
