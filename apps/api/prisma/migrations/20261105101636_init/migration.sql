-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT,
    "coreAddress" TEXT,
    "deploymentBlock" BIGINT,
    "genesisTimestamp" BIGINT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTotals" JSONB,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "reason" TEXT,
    "schemaVersion" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IngestionCursor" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "meta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCursor_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LastGoodState" (
    "key" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LastGoodState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EventCategory" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "HistoricalEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "significance" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "confirmationStatus" TEXT NOT NULL,
    "transactionHash" TEXT,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "logIndex" INTEGER,
    "contractAddress" TEXT,
    "sourceRef" TEXT,
    "payload" JSONB NOT NULL,
    "searchText" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordCorrection" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRecord" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "ethereumBlockNumber" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "previousRound" BIGINT NOT NULL,
    "settledThroughRound" BIGINT NOT NULL,
    "activeRoundCount" INTEGER NOT NULL,
    "workAdded" BIGINT,
    "cumulativeWork" BIGINT NOT NULL,
    "cumulativeBlockUnits" DECIMAL(40,0) NOT NULL,
    "blockHeight" BIGINT NOT NULL,
    "firstCompletedBlock" BIGINT,
    "lastCompletedBlock" BIGINT,
    "completedBlockCount" BIGINT NOT NULL,
    "sqkMintedBaseUnits" DECIMAL(78,0),
    "confirmationStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockRecord" (
    "installationId" TEXT NOT NULL,
    "height" BIGINT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockRecord_pkey" PRIMARY KEY ("installationId","height")
);

-- CreateTable
CREATE TABLE "MiningRecord" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "safeBlock" BIGINT NOT NULL,
    "blockHeight" BIGINT NOT NULL,
    "cumulativeWork" BIGINT NOT NULL,
    "workPerThousandBlocks" INTEGER NOT NULL,
    "settledThroughRound" BIGINT NOT NULL,
    "mintedBaseUnits" DECIMAL(78,0),
    "liveSupplyBaseUnits" DECIMAL(78,0),
    "stakedBaseUnits" DECIMAL(78,0),
    "nftLive" INTEGER,
    "nftBurned" INTEGER,

    CONSTRAINT "MiningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelDay" (
    "installationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "distanceMm" BIGINT NOT NULL,
    "workUnits" BIGINT NOT NULL,
    "coverageBps" INTEGER NOT NULL,
    "buckets" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelDay_pkey" PRIMARY KEY ("installationId","date")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "key" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameLower" TEXT NOT NULL,
    "passwordHash" TEXT,
    "walletAddress" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletChallenge" (
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "CommunityMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'memory',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("userId","subject","kind")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'visible',
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "ShareRecord" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "refId" TEXT,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricalEvent_occurredAt_id_idx" ON "HistoricalEvent"("occurredAt" DESC, "id");

-- CreateIndex
CREATE INDEX "HistoricalEvent_categorySlug_occurredAt_idx" ON "HistoricalEvent"("categorySlug", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "HistoricalEvent_type_idx" ON "HistoricalEvent"("type");

-- CreateIndex
CREATE INDEX "HistoricalEvent_transactionHash_idx" ON "HistoricalEvent"("transactionHash");

-- CreateIndex
CREATE INDEX "HistoricalEvent_significance_occurredAt_idx" ON "HistoricalEvent"("significance", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "RecordCorrection_recordType_recordId_idx" ON "RecordCorrection"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "SettlementRecord_occurredAt_idx" ON "SettlementRecord"("occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRecord_installationId_settledThroughRound_key" ON "SettlementRecord"("installationId", "settledThroughRound");

-- CreateIndex
CREATE INDEX "BlockRecord_height_idx" ON "BlockRecord"("height" DESC);

-- CreateIndex
CREATE INDEX "BlockRecord_settlementId_idx" ON "BlockRecord"("settlementId");

-- CreateIndex
CREATE INDEX "MiningRecord_capturedAt_idx" ON "MiningRecord"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiningRecord_installationId_settledThroughRound_key" ON "MiningRecord"("installationId", "settledThroughRound");

-- CreateIndex
CREATE INDEX "Milestone_achievedAt_idx" ON "Milestone"("achievedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameLower_key" ON "User"("usernameLower");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "CommunityMemory_subject_status_createdAt_idx" ON "CommunityMemory"("subject", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommunityMemory_kind_status_createdAt_idx" ON "CommunityMemory"("kind", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommunityMemory_status_createdAt_idx" ON "CommunityMemory"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_subject_status_createdAt_idx" ON "Comment"("subject", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reaction_subject_kind_idx" ON "Reaction"("subject", "kind");

-- CreateIndex
CREATE INDEX "Poll_scope_status_createdAt_idx" ON "Poll"("scope", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShareRecord_subject_idx" ON "ShareRecord"("subject");

-- CreateIndex
CREATE INDEX "UserContribution_userId_createdAt_idx" ON "UserContribution"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserContribution_createdAt_idx" ON "UserContribution"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModerationReport_status_createdAt_idx" ON "ModerationReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationReport_subject_reporterId_key" ON "ModerationReport"("subject", "reporterId");

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_categorySlug_fkey" FOREIGN KEY ("categorySlug") REFERENCES "EventCategory"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockRecord" ADD CONSTRAINT "BlockRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockRecord" ADD CONSTRAINT "BlockRecord_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SettlementRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningRecord" ADD CONSTRAINT "MiningRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelDay" ADD CONSTRAINT "WheelDay_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMemory" ADD CONSTRAINT "CommunityMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContribution" ADD CONSTRAINT "UserContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
