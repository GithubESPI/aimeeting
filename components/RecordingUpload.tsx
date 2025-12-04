"use client";

import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

type RecordingUploadProps = {
    onUploadedAction: (url: string) => void;
};

export default function RecordingUpload(props: any) {
    // On récupère le typage fort en interne
    const { onUploadedAction } = props as RecordingUploadProps;

    return (
        <div className="inline-flex flex-col gap-2">
            <UploadButton<OurFileRouter, "meetingRecording">
                endpoint="meetingRecording"
                onClientUploadComplete={(res) => {
                    const url = res?.[0]?.url;
                    if (url) {
                        onUploadedAction(url);
                    }
                }}
                onUploadError={(err) => {
                    console.error(err);
                    alert("Erreur lors de l’upload du fichier.");
                }}
                className="ut-button:bg-gradient-to-r ut-button:from-purple-600 ut-button:to-indigo-600 ut-button:hover:from-purple-700 ut-button:hover:to-indigo-700 ut-button:text-xs ut-button:font-medium ut-button:text-white ut-button:shadow-sm"
            />
            <p className="text-[11px] text-slate-400">
                Formats audio/vidéo – max 512 Mo. Le fichier sera stocké puis transcrit.
            </p>
        </div>
    );
}
