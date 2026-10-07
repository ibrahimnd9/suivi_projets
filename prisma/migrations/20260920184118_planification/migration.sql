-- CreateEnum
CREATE TYPE "WorkItemKind" AS ENUM ('PHASE', 'ACTIVITE', 'SOUS_ACTIVITE', 'TACHE');

-- CreateEnum
CREATE TYPE "DependencyKind" AS ENUM ('FIN_DEBUT', 'DEBUT_DEBUT', 'FIN_FIN');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PREVU', 'ATTEINT', 'ANNULE');

-- AlterEnum
ALTER TYPE "RefKind" ADD VALUE 'TASK_STATUS';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "progressAuto" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "WorkItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "statusId" TEXT,
    "priorityId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "plannedHours" DECIMAL(8,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemAssignee" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WorkItemAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemDependency" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "kind" "DependencyKind" NOT NULL DEFAULT 'FIN_DEBUT',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItemDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PREVU',
    "ownerId" TEXT,
    "criticalityId" TEXT,
    "workItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkItem_projectId_sortOrder_idx" ON "WorkItem"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkItem_parentId_idx" ON "WorkItem"("parentId");

-- CreateIndex
CREATE INDEX "WorkItem_ownerId_idx" ON "WorkItem"("ownerId");

-- CreateIndex
CREATE INDEX "WorkItemAssignee_userId_idx" ON "WorkItemAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemAssignee_workItemId_userId_key" ON "WorkItemAssignee"("workItemId", "userId");

-- CreateIndex
CREATE INDEX "WorkItemDependency_dependsOnId_idx" ON "WorkItemDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemDependency_itemId_dependsOnId_key" ON "WorkItemDependency"("itemId", "dependsOnId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_dueDate_idx" ON "Milestone"("projectId", "dueDate");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemAssignee" ADD CONSTRAINT "WorkItemAssignee_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemAssignee" ADD CONSTRAINT "WorkItemAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemDependency" ADD CONSTRAINT "WorkItemDependency_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemDependency" ADD CONSTRAINT "WorkItemDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_criticalityId_fkey" FOREIGN KEY ("criticalityId") REFERENCES "RefItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
