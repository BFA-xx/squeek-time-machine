-- CreateTable
CREATE TABLE "DigContribution" (
    "txHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "crew" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "tokenIds" TEXT[],
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigContribution_pkey" PRIMARY KEY ("txHash")
);

-- CreateIndex
CREATE INDEX "DigContribution_installationId_createdAt_idx" ON "DigContribution"("installationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DigContribution_userId_installationId_idx" ON "DigContribution"("userId", "installationId");

-- CreateIndex
CREATE INDEX "DigContribution_installationId_crew_idx" ON "DigContribution"("installationId", "crew");

-- AddForeignKey
ALTER TABLE "DigContribution" ADD CONSTRAINT "DigContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
