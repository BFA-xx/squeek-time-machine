-- CreateTable
CREATE TABLE "DigTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "crew" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigTask_installationId_crew_idx" ON "DigTask"("installationId", "crew");

-- CreateIndex
CREATE INDEX "DigTask_installationId_createdAt_idx" ON "DigTask"("installationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigTask_userId_installationId_day_task_key" ON "DigTask"("userId", "installationId", "day", "task");

-- AddForeignKey
ALTER TABLE "DigTask" ADD CONSTRAINT "DigTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
