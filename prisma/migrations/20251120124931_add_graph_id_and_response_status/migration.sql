/*
  Warnings:

  - You are about to drop the column `teamsMeetingId` on the `Meeting` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[graphId]` on the table `Meeting` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Meeting_teamsMeetingId_key";

-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "teamsMeetingId",
ADD COLUMN     "endDateTime" TIMESTAMP(3),
ADD COLUMN     "graphId" TEXT;

-- AlterTable
ALTER TABLE "MeetingParticipant" ADD COLUMN     "responseStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_graphId_key" ON "Meeting"("graphId");

-- CreateIndex
CREATE INDEX "Meeting_organizerEmail_idx" ON "Meeting"("organizerEmail");

-- CreateIndex
CREATE INDEX "Meeting_startDateTime_idx" ON "Meeting"("startDateTime");
