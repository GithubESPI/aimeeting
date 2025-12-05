"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type GenerateSummaryButtonProps = {
    meetingId: string;
    disabled?: boolean;
};

export function GenerateSummaryButton({
                                          meetingId,
                                          disabled,
                                      }: GenerateSummaryButtonProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    async function handleClick() {
        if (disabled || isLoading) return;

        setIsLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch(`/api/meetings/${meetingId}/summarize`, {
                method: "POST",
            });

            if (!res.ok) {
                let msg = "Erreur lors de la génération de la synthèse.";
                try {
                    const data = await res.json();
                    if (data?.error) msg = data.error;
                } catch {
                    // ignore JSON parse error
                }
                setErrorMsg(msg);
            } else {
                // on recharge pour récupérer summaryJson + status à jour
                router.refresh();
            }
        } catch (err) {
            console.error("[GenerateSummaryButton] error", err);
            setErrorMsg("Erreur réseau pendant la génération.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                type="button"
                size="sm"
                onClick={handleClick}
                disabled={disabled || isLoading}
                className="bg-red-400 text-dark-900 hover:bg-red-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {isLoading ? "Synthèse en cours…" : "Générer la synthèse avec l'IA"}
            </Button>

            {errorMsg && (
                <p className="text-[11px] text-red-300 max-w-xs text-right">
                    {errorMsg}
                </p>
            )}
        </div>
    );
}
