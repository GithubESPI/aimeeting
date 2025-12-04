// app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const ourFileRouter = {
    // endpoint: "meetingRecording"
    meetingRecording: f({
        audio: { maxFileSize: "512MB" },
        video: { maxFileSize: "512MB" },
    }).onUploadComplete(async ({ file }) => {
        // Tu peux logger ou enrichir si besoin
        console.log("Upload meeting recording:", file.url);
        return { url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
