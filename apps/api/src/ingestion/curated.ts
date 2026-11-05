/**
 * Hand-written archive entries for things the API can no longer tell us, because each new
 * release starts a new reporting history. Every entry says where it came from.
 * Observed values were read from the public API by this project's author at the stated time.
 */
export const INSTALLATION_NOTES = [
  {
    id: "archive:genesis:stream-game-sepolia-test-20261025-01",
    installationId: "stream-game-sepolia-test-20261025-01",
    releaseId: "stream-game-sepolia-test-20261026-01",
    occurredAt: "2026-10-26T13:50:00.000Z",
    title: "A reporting history begins",
    summary: "The stream-game test installation's configured round clock starts. Its genesis timestamp was read from /v1/core while that installation was live.",
    sourceRef: "https://docs.squeekchain.com/developers/api/",
    significance: 6,
  },
  {
    id: "archive:snapshot:stream-game-sepolia-test-20261025-01:2026-11-04",
    installationId: "stream-game-sepolia-test-20261025-01",
    releaseId: "stream-game-sepolia-test-20261026-01",
    occurredAt: "2026-11-04T05:45:39.000Z",
    title: "Last reading of the old counter: 8,430 blocks, 81.4 km",
    summary: "The last time this archive's author read that installation: block height 8,430, work 92,730, 81.4 km observed lifetime distance. This is a late reading, not necessarily its final state.",
    sourceRef: "https://api.squeekchain.com/v1/status",
    significance: 6,
  },
  {
    id: "archive:genesis:sepolia-core-sepolia-20261103",
    installationId: "sepolia-core-sepolia-20261103",
    releaseId: "core-sepolia-20261103",
    occurredAt: "2026-11-03T19:50:00.000Z",
    title: "The counter starts again",
    summary: "Release core-sepolia-20261103 begins its own round clock on new contracts. Work and block height start counting from zero, and earlier numbers belong to the previous history.",
    sourceRef: "https://api.squeekchain.com/v1/core",
    significance: 6,
  },
] as const;
