// app/meetings/summary/SummaryClient.tsx
"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ActionItem = { tache: string; owner: string; deadline: string | null };

type AiSummary = {
    titre: string;
    date: string;
    heure: string;
    participants: string[];
    participantsEmails?: string[];
    synthese_4_5_lignes: string;
    decisions?: string[];
    taches?: ActionItem[];
    compte_rendu_10_points: string[];
    compte_rendu_10_points_developpes: string[];
};

function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export default function SummaryClient() {
    const sp = useSearchParams();
    const router = useRouter();

    const key = sp.get("key");
    const [data, setData] = React.useState<AiSummary | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const [sending, setSending] = React.useState(false);
    const [sentOk, setSentOk] = React.useState<string | null>(null);

    async function downloadPdf() {
        if (!data) return;

        const res = await fetch("/api/meetings/summary-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error ?? "Erreur génération PDF");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `compte-rendu-${(data.titre || "reunion").replace(/[^\w\-]+/g, "_")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);
    }

    async function sendPdfToParticipants() {
        if (!data) return;

        const to = (data.participantsEmails ?? []).filter(Boolean);
        if (!to.length) {
            setError("Aucun email participant trouvé pour l'envoi.");
            return;
        }

        setSending(true);
        setError(null);
        setSentOk(null);

        try {
            const pdfRes = await fetch("/api/meetings/summary-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!pdfRes.ok) {
                const err = await pdfRes.json().catch(() => ({}));
                throw new Error(err?.error ?? "Erreur génération PDF");
            }

            const pdfBlob = await pdfRes.blob();
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);

            const sendRes = await fetch("/api/meetings/send-summary-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to,
                    subject: `Compte-rendu — ${data.titre}`,
                    message: `Bonjour,\n\nVeuillez trouver ci-joint le compte-rendu de la réunion : ${data.titre}.\n\nCordialement,`,
                    filename: `compte-rendu-${(data.titre || "reunion").replace(/[^\w\-]+/g, "_")}.pdf`,
                    pdfBase64: base64,
                }),
            });

            const json = await sendRes.json().catch(() => ({}));

            if (!sendRes.ok) {
                throw new Error(json?.error ?? "Erreur envoi email");
            }

            setSentOk(`PDF envoyé à ${to.length} participant(s).`);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors de l’envoi");
        } finally {
            setSending(false);
        }
    }

    React.useEffect(() => {
        try {
            if (!key) {
                setError("Clé manquante dans l'URL.");
                return;
            }
            const raw = sessionStorage.getItem(key);
            if (!raw) {
                setError("Aucune synthèse trouvée (sessionStorage vide). Relance la génération depuis /meetings.");
                return;
            }
            setData(JSON.parse(raw));
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du chargement");
        }
    }, [key]);

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => router.push("/meetings")}>
                    Retour aux réunions
                </Button>

                <Button onClick={() => downloadPdf().catch((e) => setError(e.message))} className="gap-2">
                    Télécharger le PDF
                </Button>

                <Button
                    onClick={() => sendPdfToParticipants()}
                    disabled={sending || !data?.participantsEmails?.length}
                    className="gap-2"
                >
                    {sending ? "Envoi..." : "Envoyer le PDF aux participants"}
                </Button>

                {sentOk && <p className="text-sm text-green-600">{sentOk}</p>}
            </div>

            {sentOk && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="pt-6">
                        <p className="text-sm text-primary">{sentOk}</p>
                    </CardContent>
                </Card>
            )}

            {error && (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="pt-6">
                        <p className="text-sm text-destructive">{error}</p>
                    </CardContent>
                </Card>
            )}

            {data && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardHeader>
                        <CardTitle>{data.titre}</CardTitle>
                        <CardDescription>
                            {data.date} • {data.heure}
                            {data.participants?.length ? (
                                <span className="block mt-1">Participants : {data.participants.join(", ")}</span>
                            ) : null}
                            {!!data.participantsEmails?.length ? (
                                <span className="block mt-1 text-xs text-muted-foreground">
                                    Emails (envoi) : {data.participantsEmails.join(", ")}
                                </span>
                            ) : null}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div>
                            <h3 className="font-semibold mb-2">Synthèse (4–5 lignes)</h3>
                            <p className="text-sm leading-relaxed whitespace-pre-line">{data.synthese_4_5_lignes}</p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Décisions</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm">
                                {(data.decisions?.length ? data.decisions : ["Aucune décision formalisée"]).map((d, i) => (
                                    <li key={i}>{d}</li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Tâches à réaliser</h3>
                            {data.taches?.length ? (
                                <ul className="list-disc pl-5 space-y-2 text-sm">
                                    {data.taches.map((a, i) => (
                                        <li key={i}>
                                            <span className="font-medium">{a.tache}</span>
                                            {" — "}
                                            <span className="text-muted-foreground">
                                                Owner: {a.owner || "Non précisé"}
                                                {a.deadline ? ` • Deadline: ${a.deadline}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-muted-foreground">Aucune tâche formalisée.</p>
                            )}
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Compte-rendu (10 points)</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm">
                                {data.compte_rendu_10_points?.map((b, i) => (
                                    <li key={i}>{b}</li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Compte-rendu (10 points développés)</h3>
                            <div className="space-y-6">
                                {data.compte_rendu_10_points_developpes?.map((point, i) => (
                                    <div key={i} className="space-y-2">
                                        <p className="text-sm font-medium">Point {i + 1}</p>
                                        <p className="text-sm leading-relaxed whitespace-pre-line">{point}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
