-- CreateEnum
CREATE TYPE "StrategicStatus" AS ENUM ('PREVU', 'EN_COURS', 'ATTEINT', 'PARTIELLEMENT_ATTEINT', 'NON_ATTEINT', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "PtbaYearStatus" AS ENUM ('PREPARATION', 'VALIDATION_DGA', 'VALIDATION_DG', 'SOUMIS_CA', 'EN_EXECUTION', 'CLOS');

-- CreateEnum
CREATE TYPE "PtbaActivityStatus" AS ENUM ('NON_DEMARREE', 'EN_PREPARATION', 'EN_COURS', 'EN_RETARD', 'SUSPENDUE', 'TERMINEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "StrategicPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "vision" TEXT,
    "mission" TEXT,
    "orientations" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicAxis" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "StrategicStatus" NOT NULL DEFAULT 'EN_COURS',
    "budget" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "refItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicAxis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicObjective" (
    "id" TEXT NOT NULL,
    "axisId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "status" "StrategicStatus" NOT NULL DEFAULT 'EN_COURS',
    "budget" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "StrategicStatus" NOT NULL DEFAULT 'PREVU',
    "frequency" "KpiFrequency" NOT NULL DEFAULT 'TRIMESTRIELLE',
    "verification" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpectedResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtbaYear" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "planId" TEXT,
    "status" "PtbaYearStatus" NOT NULL DEFAULT 'PREPARATION',
    "sourceYearId" TEXT,
    "validatedDgaAt" TIMESTAMP(3),
    "validatedDgAt" TIMESTAMP(3),
    "submittedCaAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtbaYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtbaActivity" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resultId" TEXT,
    "ownerId" TEXT,
    "directionId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "priorityId" TEXT,
    "status" "PtbaActivityStatus" NOT NULL DEFAULT 'NON_DEMARREE',
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "progressManual" DECIMAL(5,2),
    "progressComment" TEXT,
    "q1" BOOLEAN NOT NULL DEFAULT false,
    "q2" BOOLEAN NOT NULL DEFAULT false,
    "q3" BOOLEAN NOT NULL DEFAULT false,
    "q4" BOOLEAN NOT NULL DEFAULT false,
    "budgetHr" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "budgetServices" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "budgetInvestment" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "budgetOperating" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "committed" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtbaActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtbaParticipant" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PtbaParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtbaProjectLink" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contribution" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtbaProjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategicPlan_code_key" ON "StrategicPlan"("code");

-- CreateIndex
CREATE INDEX "StrategicAxis_planId_sortOrder_idx" ON "StrategicAxis"("planId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StrategicAxis_planId_code_key" ON "StrategicAxis"("planId", "code");

-- CreateIndex
CREATE INDEX "StrategicObjective_axisId_sortOrder_idx" ON "StrategicObjective"("axisId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StrategicObjective_axisId_code_key" ON "StrategicObjective"("axisId", "code");

-- CreateIndex
CREATE INDEX "ExpectedResult_objectiveId_sortOrder_idx" ON "ExpectedResult"("objectiveId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExpectedResult_objectiveId_code_key" ON "ExpectedResult"("objectiveId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PtbaYear_year_key" ON "PtbaYear"("year");

-- CreateIndex
CREATE UNIQUE INDEX "PtbaYear_sourceYearId_key" ON "PtbaYear"("sourceYearId");

-- CreateIndex
CREATE INDEX "PtbaYear_status_idx" ON "PtbaYear"("status");

-- CreateIndex
CREATE INDEX "PtbaActivity_yearId_sortOrder_idx" ON "PtbaActivity"("yearId", "sortOrder");

-- CreateIndex
CREATE INDEX "PtbaActivity_resultId_idx" ON "PtbaActivity"("resultId");

-- CreateIndex
CREATE INDEX "PtbaActivity_ownerId_idx" ON "PtbaActivity"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "PtbaActivity_yearId_code_key" ON "PtbaActivity"("yearId", "code");

-- CreateIndex
CREATE INDEX "PtbaParticipant_userId_idx" ON "PtbaParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PtbaParticipant_activityId_userId_key" ON "PtbaParticipant"("activityId", "userId");

-- CreateIndex
CREATE INDEX "PtbaProjectLink_projectId_idx" ON "PtbaProjectLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PtbaProjectLink_activityId_projectId_key" ON "PtbaProjectLink"("activityId", "projectId");

-- AddForeignKey
ALTER TABLE "StrategicAxis" ADD CONSTRAINT "StrategicAxis_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategicPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicAxis" ADD CONSTRAINT "StrategicAxis_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicAxis" ADD CONSTRAINT "StrategicAxis_refItemId_fkey" FOREIGN KEY ("refItemId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicObjective" ADD CONSTRAINT "StrategicObjective_axisId_fkey" FOREIGN KEY ("axisId") REFERENCES "StrategicAxis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicObjective" ADD CONSTRAINT "StrategicObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedResult" ADD CONSTRAINT "ExpectedResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "StrategicObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedResult" ADD CONSTRAINT "ExpectedResult_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaYear" ADD CONSTRAINT "PtbaYear_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategicPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaYear" ADD CONSTRAINT "PtbaYear_sourceYearId_fkey" FOREIGN KEY ("sourceYearId") REFERENCES "PtbaYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaActivity" ADD CONSTRAINT "PtbaActivity_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "PtbaYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaActivity" ADD CONSTRAINT "PtbaActivity_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ExpectedResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaActivity" ADD CONSTRAINT "PtbaActivity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaActivity" ADD CONSTRAINT "PtbaActivity_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaActivity" ADD CONSTRAINT "PtbaActivity_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaParticipant" ADD CONSTRAINT "PtbaParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "PtbaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaParticipant" ADD CONSTRAINT "PtbaParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaProjectLink" ADD CONSTRAINT "PtbaProjectLink_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "PtbaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtbaProjectLink" ADD CONSTRAINT "PtbaProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
