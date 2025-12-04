"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Download, Send } from "lucide-react";

type Props = {
    meetingId: string;
};

export function MeetingSummaryClient({ meetingId }: Props) {
    const [sending, setSending] = useState(false);

    async function handleSendEmails() {
        try {
            setSending(true);

            const res = await fetch(`/api/meetings/${meetingId}/export-pdf`, {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error ?? "Erreur lors de l'envoi des mails");
                return;
            }

            alert(`Compte rendu envoyé à ${data.sent} destinataire(s)`);
        } catch (e) {
            console.error(e);
            alert("Erreur inattendue lors de l'envoi des mails");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Bouton de téléchargement PDF (GET) */}
            <Button
                asChild
                size="sm"
                variant="outline"
                className="h-9 rounded-full border-blue/60 bg-blue/10 text-[12px] font-medium text-blue hover:bg-blue/20 hover:border-blue/80 gap-2"
            >
                <a
                    href={`/api/meetings/${meetingId}/export-pdf`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <Download className="h-3 w-3" />
                    Télécharger le PDF
                </a>
            </Button>

            {/* Bouton d’envoi par mail (POST) */}
            <Button
                type="button"
                onClick={handleSendEmails}
                disabled={sending}
                size="sm"
                className="h-9 rounded-full bg-gradient-to-r from-emerald-400/80 to-teal-400/80 text-[12px] font-medium text-black hover:from-emerald-300 hover:to-teal-300 disabled:opacity-60 gap-2 shadow-[0_0_18px_rgba(16,185,129,0.35)]"
            >
                <Send className="h-3 w-3" />
                {sending ? "Envoi en cours..." : "Envoyer le compte-rendu par mail"}
            </Button>
        </div>
    );
}
