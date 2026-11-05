/** Hidden seeds around the world. Each one holds a real fact from the official docs. */
export const SEEDS = [
  { slug: "seed-magnet", room: "hub", at: [-14, 11] as const, title: "The magnet", body: "One work unit is one accepted wheel-magnet passage. The sensor counts passages. It can't tell why the wheel moved.", source: "https://docs.squeekchain.com/system/squeektoshi/" },
  { slug: "seed-sand", room: "beginning", at: [3.5, -8.5] as const, title: "A sand bath", body: "The care policy calls for an accessible bath of low-dust, additive-free sand, and 25–30 cm of bedding he can burrow in.", source: "https://docs.squeekchain.com/system/squeektoshi/#care-policy" },
  { slug: "seed-zero", room: "timeline", at: [-9, 5] as const, title: "Unknown isn't zero", body: "Rounds after the settled frontier are unknown, not zero. It's the first rule of reading this chain.", source: "https://docs.squeekchain.com/llms.txt" },
  { slug: "seed-wheel-size", room: "wheel", at: [9, 6] as const, title: "At least 30 cm", body: "The wheel must be stable, solid-surface and at least 30 cm across, and bigger if his back wouldn't stay straight.", source: "https://docs.squeekchain.com/system/squeektoshi/#care-policy" },
  { slug: "seed-many", room: "vault", at: [-6, -9] as const, title: "Many blocks, one transaction", body: "One settlement can complete several Squeek blocks inside a single Ethereum block.", source: "https://docs.squeekchain.com/system/rounds-and-blocks/" },
  { slug: "seed-burn", room: "evolution", at: [8, -7] as const, title: "The donor is gone", body: "A merge permanently burns the donor NFT. The survivor moves up a level, and its power grows.", source: "https://docs.squeekchain.com/squeeks/merge/" },
  { slug: "seed-rest", room: "future", at: [-8, 7] as const, title: "He gets to rest", body: "Nobody wakes him for mining. The care policy says periods without blocks have to be accepted.", source: "https://docs.squeekchain.com/system/squeektoshi/#care-policy" },
] as const;
