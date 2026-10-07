-- CreateEnum
CREATE TYPE "RaciRole" AS ENUM ('R', 'A', 'C', 'I');

-- CreateTable
CREATE TABLE "RaciAssignment" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RaciRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaciAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaciAssignment_userId_idx" ON "RaciAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RaciAssignment_workItemId_userId_key" ON "RaciAssignment"("workItemId", "userId");

-- AddForeignKey
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
