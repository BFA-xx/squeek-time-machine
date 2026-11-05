-- CreateTable
CREATE TABLE "DigMember" (
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "crew" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "squeekId" TEXT,
    "squeekLevel" INTEGER,
    "squeekCheckedAt" TIMESTAMP(3),

    CONSTRAINT "DigMember_pkey" PRIMARY KEY ("userId","installationId")
);

-- CreateTable
CREATE TABLE "DigShift" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startRound" BIGINT NOT NULL,
    "endRound" BIGINT NOT NULL,
    "workUnits" BIGINT NOT NULL,
    "band" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "transactionHash" TEXT,

    CONSTRAINT "DigShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigCall" (
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "shiftIndex" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "crew" TEXT NOT NULL,
    "correct" BOOLEAN,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigCall_pkey" PRIMARY KEY ("userId","installationId","shiftIndex")
);

-- CreateTable
CREATE TABLE "DigChamber" (
    "installationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "target" BIGINT NOT NULL,
    "brokeAt" TIMESTAMP(3) NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "crew" TEXT,

    CONSTRAINT "DigChamber_pkey" PRIMARY KEY ("installationId","number")
);

-- CreateIndex
CREATE INDEX "DigMember_installationId_crew_idx" ON "DigMember"("installationId", "crew");

-- CreateIndex
CREATE INDEX "DigMember_squeekCheckedAt_idx" ON "DigMember"("squeekCheckedAt");

-- CreateIndex
CREATE INDEX "DigShift_installationId_index_idx" ON "DigShift"("installationId", "index" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DigShift_installationId_index_key" ON "DigShift"("installationId", "index");

-- CreateIndex
CREATE INDEX "DigCall_installationId_shiftIndex_idx" ON "DigCall"("installationId", "shiftIndex");

-- CreateIndex
CREATE INDEX "DigCall_installationId_crew_idx" ON "DigCall"("installationId", "crew");

-- AddForeignKey
ALTER TABLE "DigMember" ADD CONSTRAINT "DigMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigCall" ADD CONSTRAINT "DigCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
