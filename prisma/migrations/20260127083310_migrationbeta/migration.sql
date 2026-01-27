/*
  Warnings:

  - The `status` column on the `Meeting` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'TRANSCRIPT_READY', 'SUMMARY_READY', 'PDF_READY', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "lastEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "lastPdfGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "participantsEmails" JSONB,
ADD COLUMN     "reportFilename" TEXT,
ADD COLUMN     "userId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "Participant" ALTER COLUMN "displayName" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "to" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_meetingId_idx" ON "EmailLog"("meetingId");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "Meeting_userId_idx" ON "Meeting"("userId");

-- CreateIndex
CREATE INDEX "Meeting_startDateTime_idx" ON "Meeting"("startDateTime");

-- CreateIndex
CREATE INDEX "MeetingParticipant_participantId_idx" ON "MeetingParticipant"("participantId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
