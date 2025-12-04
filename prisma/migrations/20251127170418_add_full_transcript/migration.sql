-- DropIndex
DROP INDEX "Meeting_organizerEmail_idx";

-- DropIndex
DROP INDEX "Meeting_startDateTime_idx";

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "fullTranscript" TEXT;
