/** The Beginning. Facts paraphrased from the official docs, each with its source. No invented lore. */
const D = "https://docs.squeekchain.com";
export const ORIGIN_ARTIFACTS = [
  { slug: "squeektoshi", shape: "portrait", title: "Squeektoshi", body: "A white-orange male Syrian hamster, two months old as of October 2026. He runs the WHEELY9000 on livestream, and his wheel activity is the work that settles on Ethereum.", source: `${D}/system/squeektoshi/` },
  { slug: "care-policy", shape: "tablet", title: "The care policy", body: "Hamster welfare comes before mining output. Only freely chosen activity is recorded. Nobody forces him to run, wakes him for mining or restricts food or rest, so quiet periods with no blocks are expected.", source: `${D}/system/squeektoshi/#care-policy` },
  { slug: "wheely", shape: "wheel", title: "The WHEELY9000", body: "The hamster mining device. It records wheel activity as work: one work unit for each accepted wheel-magnet passage, under fixed measurement rules.", source: `${D}/system/installation/` },
  { slug: "three-clocks", shape: "clock", title: "Three different clocks", body: "A measurement round is 600 seconds. A Squeek block is one billion earned block units. An Ethereum block is Ethereum's own. One settlement can complete many Squeek blocks inside a single Ethereum block.", source: `${D}/system/rounds-and-blocks/` },
  { slug: "proof", shape: "stone", title: "Hamster proof of work", body: "Squeekchain's name for the record of accepted wheel-magnet passages. Ethereum stores that record and settles it in ordinary transactions. Ethereum's own blocks still come from its validators.", source: `${D}/start/faq/` },
  { slug: "squeeks", shape: "nft", title: "Squeeks", body: "NFTs that share in the SQK the hamster's work creates. The hamster mines blocks; Squeeks don't mine. Merging two same-level Squeeks makes one a level higher and permanently burns the donor.", source: `${D}/squeeks/` },
  { slug: "sqk", shape: "coin", title: "SQK", body: "An ERC-20 issued by completed Squeek blocks, with a 10% premine for liquidity and a fixed lifetime cap. Testnet SQK and Squeeks have no monetary value.", source: `${D}/rewards/` },
  { slug: "testnet", shape: "sign", title: "Everything here is testnet so far", body: "The contracts run on Sepolia only, and each new release can start a fresh reporting history. That's why this archive keeps every record tied to the installation it came from.", source: `${D}/developers/` },
] as const;

/** The Future. Everything is labelled by how much we actually know. */
export const FUTURE_NOTES = [
  { verification: "official", title: "6,900 SQK per block at launch", body: "The docs give 5,600 SQK per completed block on the Sepolia deployment and 6,900 at launch.", source: `${D}/llms.txt` },
  { verification: "official", title: "Squeektoshi will level up", body: "The docs say his speed, distance, running streaks and co-op pet-care activities will build his progress, and that progress will influence how SQK is distributed. More details are promised.", source: `${D}/system/squeektoshi/#leveling-up` },
  { verification: "official", title: "Squeek staking is in active development", body: "The docs describe staking SQK to raise a Squeek's active power as Proof of Squeek, and warn that it's still changing.", source: `${D}/rewards/staking/` },
  { verification: "unconfirmed", title: "Mainnet", body: "The docs say there's no mainnet deployment yet, and this archive has no confirmed date. Treat any date you read elsewhere as unconfirmed.", source: `${D}/developers/` },
] as const;
