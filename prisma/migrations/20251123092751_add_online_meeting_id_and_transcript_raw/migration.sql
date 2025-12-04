/*
  Warnings:

  - A unique constraint covering the columns `[onlineMeetingId]` on the table `Meeting` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "onlineMeetingId" TEXT,
ADD COLUMN     "transcriptRaw" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_onlineMeetingId_key" ON "Meeting"("onlineMeetingId");
