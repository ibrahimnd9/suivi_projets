-- CreateEnum
CREATE TYPE "KpiFrequency" AS ENUM ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE', 'PONCTUELLE');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HAUSSE', 'BAISSE');

-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('RISQUE', 'PROBLEME');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFIE', 'EN_TRAITEMENT', 'MAITRISE', 'AVERE', 'CLOS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefKind" ADD VALUE 'DILIGENCE_STATUS';
ALTER TYPE "RefKind" ADD VALUE 'BUDGET_NATURE';

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" TEXT,
    "typeId" TEXT,
    "unit" TEXT,
    "frequency" "KpiFrequency" NOT NULL DEFAULT 'MENSUELLE',
    "direction" "KpiDirection" NOT NULL DEFAULT 'HAUSSE',
    "baseline" DECIMAL(16,2),
    "target" DECIMAL(16,2),
    "ownerId" TEXT,
    "source" TEXT,
    "alertThreshold" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "okThreshold" DECIMAL(5,2) NOT NULL DEFAULT 95,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiValue" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "value" DECIMAL(16,2) NOT NULL,
    "comment" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diligence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "origin" TEXT,
    "description" TEXT,
    "ownerId" TEXT,
    "issuedAt" DATE,
    "dueDate" DATE,
    "closedAt" DATE,
    "statusId" TEXT NOT NULL,
    "priorityId" TEXT,
    "comment" TEXT,
    "proofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "RiskKind" NOT NULL DEFAULT 'RISQUE',
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT,
    "probability" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "ownerId" TEXT,
    "identifiedAt" DATE,
    "mitigationPlan" TEXT,
    "dueDate" DATE,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFIE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "natureId" TEXT,
    "workItemId" TEXT,
    "period" DATE,
    "initial" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "revised" DECIMAL(16,2),
    "committed" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "spent" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kpi_projectId_idx" ON "Kpi"("projectId");

-- CreateIndex
CREATE INDEX "KpiValue_kpiId_period_idx" ON "KpiValue"("kpiId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "KpiValue_kpiId_period_key" ON "KpiValue"("kpiId", "period");

-- CreateIndex
CREATE INDEX "Diligence_projectId_dueDate_idx" ON "Diligence"("projectId", "dueDate");

-- CreateIndex
CREATE INDEX "Diligence_ownerId_idx" ON "Diligence"("ownerId");

-- CreateIndex
CREATE INDEX "Risk_projectId_idx" ON "Risk"("projectId");

-- CreateIndex
CREATE INDEX "BudgetLine_projectId_sortOrder_idx" ON "BudgetLine"("projectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValue" ADD CONSTRAINT "KpiValue_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiValue" ADD CONSTRAINT "KpiValue_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diligence" ADD CONSTRAINT "Diligence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diligence" ADD CONSTRAINT "Diligence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diligence" ADD CONSTRAINT "Diligence_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "RefItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diligence" ADD CONSTRAINT "Diligence_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_natureId_fkey" FOREIGN KEY ("natureId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
