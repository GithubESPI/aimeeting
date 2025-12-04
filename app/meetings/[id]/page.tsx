// app/meetings/[id]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { format, differenceInMinutes } from "date-fns";
import { fr } from "date-fns/locale";

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { GenerateSummaryButton } from "@/components/meetings/generate-summary-button";
import { ClientSummary } from "@/components/meetings/client-summary";
import { MeetingSummaryClient } from "@/app/meetings/[id]/meeting-summary-client";
import React from "react";

/* ------- Types ------- */

type PageProps = {
    params: { id: string };
};

type Participant = {
    displayName?: string | null;
    email?: string | null;
};


/* ------- Helpers UI ------- */

function DetailItem(props: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-light-200">
                {props.label}
            </p>
            <div>{props.children}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const normalized = status?.toLowerCase() ?? "";

    if (
        normalized === "processed" ||
        normalized === "traitee" ||
        normalized === "summarized"
    ) {
        return (
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/40 text-[11px]">
                Synthèse prête
            </Badge>
        );
    }

    if (normalized === "error" || normalized === "erreur") {
        return (
            <Badge className="bg-red-500/10 text-red-300 border-red-500/40 text-[11px]">
                Erreur
            </Badge>
        );
    }

    return (
        <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/40 text-[11px]">
            En attente
        </Badge>
    );
}

/* --- Helper pour nettoyer le VTT Teams --- */
// ⚠️ NE PAS exporter cette fonction
function cleanTeamsTranscript(vtt: string): string {
    return vtt
        // 0. Enlever explicitement "WEBVTT" et les lignes vides juste après
        .replace(/^WEBVTT.*\n?/i, "")
        // 1. Enlever les timestamps
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> .*$/gm, "")
        // 2. Transformer <v Speaker>Texte</v> → "Speaker : Texte"
        .replace(
            /<v\s+([^>]+)>([\s\S]*?)<\/v>/gm,
            (_match: string, speaker: string, text: string) => {
                return `${speaker.trim()} : ${text.trim()}`;
            }
        )
        // 3. Retirer balises résiduelles <v> ou HTML
        .replace(/<v[^>]*>/g, "")
        .replace(/<\/v>/g, "")
        .replace(/<\/?[^>]+>/g, "")
        // 4. Nettoyer espaces inutiles
        .replace(/\n{2,}/g, "\n")
        // 5. Trim final
        .trim();
}

/* ------- Logic : garantir fullTranscript ------- */

async function ensureFullTranscript(
    meeting: any,
    session: any
): Promise<string | null> {
    // 1) Si déjà présent → on renvoie direct
    if (
        typeof meeting.fullTranscript === "string" &&
        meeting.fullTranscript.trim() !== ""
    ) {
        return meeting.fullTranscript;
    }

    // 2) Si pas de transcriptRaw → on ne peut rien faire
    if (!meeting.transcriptRaw) {
        console.warn("[ensureFullTranscript] pas de transcriptRaw en BDD");
        return null;
    }

    // 3) On parse transcriptRaw (le JSON brut Graph)
    let raw: any;
    try {
        raw =
            typeof meeting.transcriptRaw === "string"
                ? JSON.parse(meeting.transcriptRaw)
                : meeting.transcriptRaw;
    } catch (err) {
        console.error(
            "[ensureFullTranscript] impossible de parser transcriptRaw :",
            err
        );
        return null;
    }

    const contentUrl: string | null =
        raw.transcriptContentUrl ?? raw.contentUrl ?? null;

    if (!contentUrl) {
        console.warn(
            "[ensureFullTranscript] aucun transcriptContentUrl/contentUrl trouvé dans transcriptRaw"
        );
        return null;
    }

    // 4) On utilise de la session
    const accessToken = (session as any).accessToken as string | undefined;
    if (!accessToken) {
        console.warn(
            "[ensureFullTranscript] aucun accessToken sur la session, impossible d'appeler Graph"
        );
        return null;
    }

    try {
        const res = await fetch(contentUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "text/vtt",
            },
        });

        if (!res.ok) {
            console.error(
                "[ensureFullTranscript] fetch contentUrl status",
                res.status,
                await res.text()
            );
            return null;
        }

        const vtt = await res.text();

        // 🔹 Nettoyage VTT → texte
        const cleaned = cleanTeamsTranscript(vtt);

        // 5) On sauvegarde en BDD pour les prochaines fois
        await prisma.meeting.update({
            where: { id: meeting.id },
            data: { fullTranscript: cleaned },
        });

        return cleaned;
    } catch (err) {
        console.error("[ensureFullTranscript] erreur Graph :", err);
        return null;
    }
}

/* ------- Page ------- */

export default async function MeetingDetailPage({ params }: PageProps) {
    const { id } = params; // ⬅️ plus de `await params`, ce n’est pas une Promise

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/");
    }

    const email = session.user.email;

    const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: {
            attendees: { include: { participant: true } },
            segments: { orderBy: { startMs: "asc" } },
        },
    });

    if (!meeting) {
        notFound();
    }

    const isOrganizer =
        meeting.organizerEmail?.toLowerCase() === email.toLowerCase();
    const originLabel = meeting.graphId
        ? "Réunion Teams"
        : "Réunion présentielle";

    const start = meeting.startDateTime ?? meeting.createdAt;
    const end = meeting.endDateTime ?? null;
    const durationMinutes = end ? differenceInMinutes(end, start) : null;

    const participantList =
        meeting.attendees
            ?.map((a: { participant: any }) => a.participant)
            .filter((p: any): p is { id: string; displayName: string | null; email: string | null } =>
                Boolean(p)
            ) ?? [];


    const participantsFromDb =
        participantList
            .map((p: Participant) => p.displayName || p.email)
            .filter((v): v is string => Boolean(v));



    const hasSummary = Boolean(meeting.summaryJson);

    const fullTranscript =
        (await ensureFullTranscript(meeting as any, session)) ?? null;

    return (
        <section className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <Link
                        href="/meetings/teams"
                        className="text-xs text-light-200 hover:text-white transition-colors"
                    >
                        ← Retour aux réunions Teams
                    </Link>

                    <h1 className="text-3xl font-schibsted-grotesk font-bold text-white">
                        {meeting.title || "Réunion sans titre"}
                    </h1>

                    <p className="text-sm text-light-200 max-w-xl">
                        Détail de la réunion et accès à la synthèse IA.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        <Badge className="bg-dark-200 text-light-100 border-border-dark">
                            {originLabel}
                        </Badge>

                        <StatusBadge status={meeting.status} />

                        <span className="text-light-200">
              {format(start, "EEEE d MMMM yyyy · HH:mm", { locale: fr })}
            </span>

                        {durationMinutes !== null && (
                            <span className="text-light-200">
                · Durée approx. {durationMinutes} min
              </span>
                        )}

                        <span className="ml-2 rounded-full bg-dark-200 px-3 py-1 text-[11px] uppercase tracking-wide text-light-200">
              {isOrganizer ? "Organisateur" : "Participant"}
            </span>
                    </div>
                </div>
            </div>

            {/* Grille principale */}
            <div className="grid gap-6 lg:grid-cols-[2fr,1.4fr]">
                {/* Colonne gauche */}
                <div className="space-y-6">
                    {/* Détails */}
                    <Card className="bg-dark-100 border-border-dark">
                        <CardHeader>
                            <CardTitle className="text-white text-base">
                                Détails de la réunion
                            </CardTitle>
                            <CardDescription className="text-light-200">
                                Informations générales et métadonnées techniques.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm text-light-100">
                            <DetailItem label="Date & heure">
                                {format(start, "dd/MM/yyyy · HH:mm", { locale: fr })}
                            </DetailItem>

                            <DetailItem label="Durée">
                                {durationMinutes !== null
                                    ? `${durationMinutes} min`
                                    : "Non renseignée"}
                            </DetailItem>

                            <DetailItem label="Rôle">
                                {isOrganizer ? "Organisateur" : "Participant"}
                            </DetailItem>

                            <DetailItem label="Origine">{originLabel}</DetailItem>

                            <DetailItem label="Transcription Teams">
                                {meeting.hasGraphTranscript ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/40 text-[11px]">
                                        Disponible
                                    </Badge>
                                ) : (
                                    <span className="text-light-200 text-xs">
                    Non détectée
                  </span>
                                )}
                            </DetailItem>

                            <DetailItem label="Enregistrement">
                                {meeting.hasGraphRecording ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/40 text-[11px]">
                                        Disponible
                                    </Badge>
                                ) : (
                                    <span className="text-light-200 text-xs">
                    Non détecté
                  </span>
                                )}
                            </DetailItem>

                            {meeting.transcriptSource && (
                                <DetailItem label="Source principale">
                                    {meeting.transcriptSource === "graph"
                                        ? "Microsoft Graph"
                                        : meeting.transcriptSource}
                                </DetailItem>
                            )}

                            <DetailItem label="ID Graph">
                                {meeting.graphId ? (
                                    <code className="text-[11px] text-light-200 break-all">
                                        {meeting.graphId}
                                    </code>
                                ) : (
                                    <span className="text-light-200 text-xs">
                    Aucun (réunion hors Teams)
                  </span>
                                )}
                            </DetailItem>
                        </CardContent>
                    </Card>

                    {/* Participants */}
                    <Card className="bg-dark-100 border-border-dark">
                        <CardHeader>
                            <CardTitle className="text-white text-base">
                                Participants
                            </CardTitle>
                            <CardDescription className="text-light-200">
                                Personnes rattachées à cette réunion.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-light-100">
                            {participantList.length === 0 ? (
                                <p className="text-light-200 text-xs">
                                    Aucun participant n’est encore synchronisé pour cette
                                    réunion.
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {participantList.map((p) => (
                                        <li
                                            key={p.id}
                                            className="flex items-center justify-between rounded-md bg-dark-200 px-3 py-2"
                                        >
                                            <div className="flex flex-col">
                        <span className="text-sm">
                          {p.displayName || p.email}
                        </span>
                                                <span className="text-xs text-light-200">
                          {p.email}
                        </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    {/* Transcription complète */}
                    <section className="mt-2 rounded-xl bg-dark-100 border border-border-dark p-6">
                        <h2 className="text-base font-semibold text-white">
                            Transcription complète
                        </h2>
                        <p className="mt-1 text-sm text-light-200">
                            Texte Teams extrait automatiquement.
                        </p>

                        {fullTranscript ? (
                            <pre className="mt-4 whitespace-pre-wrap text-sm text-light-100 max-h-[420px] overflow-y-auto">
                {fullTranscript}
              </pre>
                        ) : (
                            <p className="mt-4 text-sm text-light-200">
                                Aucune transcription disponible.
                            </p>
                        )}
                    </section>
                </div>

                {/* Colonne droite : Synthèse IA */}
                <div className="space-y-4">
                    <Card className="bg-dark-100 border-border-dark">
                        <CardHeader>
                            <CardTitle className="text-white text-base">
                                Synthèse IA
                            </CardTitle>
                            <CardDescription className="text-light-200">
                                Résumé automatique, décisions et tâches.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 text-sm text-light-100">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={meeting.status} />

                                    {meeting.summaryJson && (
                                        <MeetingSummaryClient meetingId={id} />
                                    )}
                                </div>

                                {!hasSummary && (
                                    <GenerateSummaryButton
                                        meetingId={id}
                                        disabled={
                                            !meeting.hasGraphTranscript &&
                                            !meeting.hasGraphRecording &&
                                            !fullTranscript
                                        }
                                    />
                                )}
                            </div>

                            {meeting.status === "error" && (
                                <p className="text-[12px] text-red-300">
                                    Une erreur est survenue lors de la dernière génération. Tu
                                    peux réessayer.
                                </p>
                            )}

                            {meeting.summaryJson ? (
                                <ClientSummary
                                    meetingId={id}
                                    initialSummary={meeting.summaryJson}
                                    participants={participantsFromDb}
                                />
                            ) : (
                                <p className="text-xs text-light-200">
                                    Aucune synthèse n’a encore été générée pour cette réunion.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    );
}
