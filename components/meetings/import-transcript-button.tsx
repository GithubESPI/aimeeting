// components/meetings/import-transcript-button.tsx
"use client";

import { useTransition } from "react";

export function ImportTranscriptButton({ meetingId }: { meetingId: string }) {
    const [pending, startTransition] = useTransition();

    return (
        <button
            type="button"
            disabled={pending}
            className="text-xs text-emerald-300 hover:text-emerald-200 underline"
            onClick={() =>
                startTransition(async () => {
                    await fetch(`/api/meetings/${meetingId}/import-transcript`, {
                        method: "POST",
                    });
                    // On recharge la page pour voir les nouveaux segments
                    window.location.reload();
                })
            }
        >
            {pending ? "Import en cours..." : "Importer la transcription détaillée"}
        </button>
    );
}
