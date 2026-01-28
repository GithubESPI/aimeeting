// app/meetings/[id]/page.tsx
// ✅ Avec restriction : seul l'organisateur peut générer une synthèse

"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ArrowLeft,
    Download,
    Mail,
    Calendar,
    Users,
    FileText,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    ShieldAlert
} from "lucide-react";
import { formatParticipants } from "@/lib/participants";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";


type ActionItem = {
    tache: string;
    owner: string;
    deadline: string | null
};

type AiSummary = {
    titre: string;
    date: string;
    heure: string;
    participants: string[];
    synthese_4_5_lignes: string;
    decisions?: string[];
    taches?: ActionItem[];
    compte_rendu_10_points: string[];
    compte_rendu_10_points_developpes: string[];
};

type TranscriptContent = {
    timestamp: string;
    text: string;
    speaker?: string;
};

type TranscriptData = {
    type: "vtt" | "video" | "not_generated" | "not_accessible" | "not_available" | "other";
    parsed?: TranscriptContent[];
    message?: string;
};

type Meeting = {
    id: string;
    title: string;
    status: string;
    startDateTime: string | null;
    endDateTime: string | null;
    organizerEmail: string | null;
    summaryJson: AiSummary | null;
    participantsEmails: string[] | null;
    graphId: string | null;
    onlineMeetingId: string | null;
    transcriptRaw: any;
    fullTranscript: string | null;
    joinUrl: string | null;
    emailLogs: Array<{
        id: string;
        status: string;
        to: string[];
        subject: string;
        error: string | null;
        createdAt: string;
    }>;
    createdAt: string;
    lastEmailSentAt: string | null;
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

function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(d);
}

function formatStatus(status: string): string {
    const normalized = status.toUpperCase();

    switch (normalized) {
        case "SUMMARY_READY":
            return "Synthèse générée";
        case "CREATED":
            return "Aucune synthèse générée";
        case "PROCESSING":
            return "En cours de traitement";
        case "ERROR":
            return "Erreur";
        default:
            return status;
    }
}

export default function MeetingDetailPage() {
    const params = useParams();
    const router = useRouter();
    const meetingId = params.id as string;

    // ✅ Récupérer la session pour connaître l'email de l'utilisateur connecté
    const { data: session } = useSession();
    const currentUserEmail = session?.user?.email?.toLowerCase();

    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [meeting, setMeeting] = React.useState<Meeting | null>(null);

    const [sending, setSending] = React.useState(false);
    const [sendSuccess, setSendSuccess] = React.useState<string | null>(null);
    const [sendError, setSendError] = React.useState<string | null>(null);

    const [editMode, setEditMode] = React.useState(false);
    const [editedSummary, setEditedSummary] = React.useState<AiSummary | null>(null);
    const [savingSummary, setSavingSummary] = React.useState(false);
    const [saveSummaryError, setSaveSummaryError] = React.useState<string | null>(null);
    const [saveSummarySuccess, setSaveSummarySuccess] = React.useState<string | null>(null);


    // ✅ Dialog transcription
    const [transcriptDialog, setTranscriptDialog] = React.useState<{
        open: boolean;
        loading: boolean;
        data: TranscriptData | null;
        error: string | null;
    }>({
        open: false,
        loading: false,
        data: null,
        error: null,
    });

    // ✅ États pour la génération de synthèse
    const [generatingSummary, setGeneratingSummary] = React.useState(false);
    const [summaryError, setSummaryError] = React.useState<string | null>(null);

    // ✅ Vérifier si l'utilisateur connecté est l'organisateur
    const isOrganizer = React.useMemo(() => {
        if (!meeting?.organizerEmail || !currentUserEmail) return false;
        return meeting.organizerEmail.toLowerCase() === currentUserEmail;
    }, [meeting?.organizerEmail, currentUserEmail]);

    React.useEffect(() => {
        fetchMeeting();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetingId]);

    async function fetchMeeting() {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/meetings/${meetingId}`, {
                method: "GET",
                cache: "no-store",
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
            }

            const json = await res.json();
            setMeeting(json.meeting);
            setEditedSummary(json.meeting?.summaryJson ?? null);
            setEditMode(false);
            setSaveSummaryError(null);
            setSaveSummarySuccess(null);

        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du chargement");
        } finally {
            setLoading(false);
        }
    }

    async function saveEditedSummary() {
        if (!meeting?.id || !editedSummary) return;

        setSavingSummary(true);
        setSaveSummaryError(null);
        setSaveSummarySuccess(null);

        try {
            const res = await fetch(`/api/meetings/${meeting.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ summaryJson: editedSummary }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error ?? "Erreur lors de l'enregistrement");

            setSaveSummarySuccess("✅ Modifications enregistrées.");
            setEditMode(false);

            // re-sync UI depuis DB
            await fetchMeeting();
        } catch (e: any) {
            setSaveSummaryError(e?.message ?? "Erreur lors de l'enregistrement");
        } finally {
            setSavingSummary(false);
        }
    }

    function toMultiline(arr?: string[]) {
        return (arr ?? []).join("\n");
    }

    // ✅ garde les lignes vides (ne filtre plus Boolean)
    function fromMultilineKeepEmpty(text: string) {
        // on garde tel quel, juste normalize
        return text.replace(/\r\n/g, "\n").split("\n");
    }



    // ✅ Ouvrir le dialog transcription
    async function openTranscriptDialog() {
        if (!meeting?.transcriptRaw || !Array.isArray(meeting.transcriptRaw) || meeting.transcriptRaw.length === 0) {
            setError("Aucune transcription disponible");
            return;
        }

        const transcript = meeting.transcriptRaw[0];
        const ownerEmail = transcript.organizerEmail || meeting.organizerEmail;

        setTranscriptDialog({
            open: true,
            loading: true,
            data: null,
            error: null,
        });

        try {
            const params = new URLSearchParams({
                ownerEmail: ownerEmail!,
                fileId: transcript.id,
                meetingSubject: meeting.title,
            });

            if (transcript.meetingId) {
                params.set("meetingId", transcript.meetingId);
            }

            if (meeting.joinUrl) {
                params.set("joinUrl", meeting.joinUrl);
            }

            if (meeting.startDateTime) {
                params.set("meetingDate", meeting.startDateTime);
            }

            const res = await fetch(`/api/transcript-content?${params.toString()}`);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || "Erreur lors du chargement");
            }

            const td: TranscriptData = await res.json();

            console.log("📝 Transcription reçue:", {
                type: td.type,
                parsedLength: td.parsed?.length ?? 0,
                firstItem: td.parsed?.[0],
            });

            setTranscriptDialog((prev) => ({
                ...prev,
                loading: false,
                data: td,
            }));
        } catch (e: any) {
            setTranscriptDialog((prev) => ({
                ...prev,
                loading: false,
                error: e.message || "Erreur lors du chargement de la transcription",
            }));
        }
    }

    function fromMultilineKeepEmptyKeepEmpty(text: string) {
        // garde les lignes vides pour permettre l'aération
        return text.replace(/\r/g, "").split("\n");
    }

    function toMultilineKeepEmptyKeepEmpty(arr?: string[]) {
        return (arr ?? []).join("\n");
    }

    // ✅ Générer la synthèse depuis le dialog
    async function generateSummaryFromTranscript() {
        if (!meeting || !transcriptDialog.data?.parsed) return;

        setGeneratingSummary(true);
        setSummaryError(null);

        try {
            const parsed = transcriptDialog.data.parsed;

            // Formater la transcription
            const transcriptText = parsed
                .map((p) => `${p.speaker ? `${p.speaker}: ` : ""}${p.text}`.trim())
                .filter(Boolean)
                .join("\n");

            if (transcriptText.length < 20) {
                throw new Error("Transcription trop courte");
            }

            // Préparer les participants
            const speakersFromTranscript = Array.from(
                new Set(parsed.map((p) => p.speaker).filter(Boolean))
            ) as string[];

            // ✅ Créer une map email -> nom pour associer les speakers avec leurs emails
            const emailToName = new Map<string, string>();
            for (const speaker of speakersFromTranscript) {
                const participantEmails = meeting.participantsEmails as string[] || [];
                const email = participantEmails.find((e: string) => {
                    const namePart = e.split('@')[0].toLowerCase().replace(/[._-]/g, ' ');
                    const speakerLower = speaker.toLowerCase();
                    return speakerLower.includes(namePart) || namePart.includes(speakerLower);
                });
                if (email) {
                    emailToName.set(email, speaker);
                }
            }

            // ✅ Formater les participants : "Nom Prénom (email)"
            const participantEmails = Array.from(
                new Set([
                    ...(meeting.participantsEmails as string[] ?? []),
                    meeting.organizerEmail ?? "",
                ].filter(Boolean))
            );

            const participants = participantEmails.map(email => {
                const name = emailToName.get(email);
                return name ? `${name} (${email})` : email;
            });

            const date = meeting.startDateTime
                ? new Date(meeting.startDateTime).toLocaleDateString("fr-FR")
                : "Non précisé";

            const heure =
                meeting.startDateTime && meeting.endDateTime
                    ? `${new Date(meeting.startDateTime).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC"
                    })} - ${new Date(meeting.endDateTime).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC"
                    })}`
                    : "Non précisé";

            console.log("🤖 Génération de la synthèse IA...");

            const res = await fetch("/api/ai/meeting-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    titre: meeting.title,
                    date,
                    heure,
                    participants,
                    transcriptText,
                    graphId: meeting.graphId,
                    onlineMeetingId: meeting.onlineMeetingId,
                    participantsEmails: meeting.participantsEmails ?? [],
                    organizerEmail: meeting.organizerEmail,
                    startDateTime: meeting.startDateTime,
                    endDateTime: meeting.endDateTime,
                }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? `Erreur IA HTTP ${res.status}`);

            console.log("✅ Synthèse générée avec succès");

            // Fermer le dialog et recharger
            setTranscriptDialog({ open: false, loading: false, data: null, error: null });
            await fetchMeeting();

        } catch (e: any) {
            console.error("❌ Erreur:", e);
            setSummaryError(e?.message ?? "Erreur lors de la génération");
        } finally {
            setGeneratingSummary(false);
        }
    }

    async function downloadPdf() {
        if (!meeting?.summaryJson) return;

        try {
            const res = await fetch("/api/meetings/summary-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(meeting.summaryJson),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error ?? "Erreur génération PDF");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `compte-rendu-${(meeting.title || "reunion").replace(/[^\w\-]+/g, "_")}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            URL.revokeObjectURL(url);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du téléchargement");
        }
    }

    async function sendPdfToParticipants() {
        if (!meeting?.summaryJson) return;

        const to = (meeting.participantsEmails ?? []).filter(Boolean);
        if (!to.length) {
            setSendError("Aucun email participant trouvé");
            return;
        }

        setSending(true);
        setSendError(null);
        setSendSuccess(null);

        try {
            const pdfRes = await fetch("/api/meetings/summary-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(meeting.summaryJson),
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
                    meetingId: meeting.id,
                    to,
                    subject: `Compte-rendu — ${meeting.title}`,
                    message: `Bonjour,\n\nVeuillez trouver ci-joint le compte-rendu de la réunion : ${meeting.title}.\n\nCordialement,`,
                    filename: `compte-rendu-${(meeting.title || "reunion").replace(/[^\w\-]+/g, "_")}.pdf`,
                    pdfBase64: base64,
                }),
            });

            const json = await sendRes.json().catch(() => ({}));

            if (!sendRes.ok) {
                throw new Error(json?.error ?? "Erreur envoi email");
            }

            setSendSuccess(`PDF envoyé à ${to.length} participant(s).`);
            setTimeout(() => fetchMeeting(), 1000);
        } catch (e: any) {
            setSendError(e?.message ?? "Erreur lors de l'envoi");
        } finally {
            setSending(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto max-w-5xl px-4 py-8 space-y-4">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-96 w-full rounded-lg" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto max-w-5xl px-4 py-8">
                    <Card className="border-[#F76A6A] bg-[#F76A6A]/10 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertCircle className="h-5 w-5 text-[#F76A6A]" />
                                <p className="font-semibold text-[#F76A6A]">Erreur</p>
                            </div>
                            <p className="text-sm text-[#F76A6A] mb-4">{error}</p>
                            <Button
                                variant="outline"
                                className="border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                                onClick={() => router.push("/meetings")}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    if (!meeting) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto max-w-5xl px-4 py-8">
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <p className="text-sm text-gray-600 mb-4">Réunion non trouvée.</p>
                            <Button
                                variant="outline"
                                className="border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                                onClick={() => router.push("/meetings")}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    const summary = meeting.summaryJson;
    const hasTranscript = meeting.transcriptRaw && Array.isArray(meeting.transcriptRaw) && meeting.transcriptRaw.length > 0;

    console.log("📊 Meeting data:", {
        id: meeting.id,
        title: meeting.title,
        hasTranscript,
        transcriptRaw: meeting.transcriptRaw,
        hasSummary: !!summary,
        isOrganizer,
        currentUserEmail,
        organizerEmail: meeting.organizerEmail,
    });

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/meetings")}
                        className="gap-2 border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Retour
                    </Button>

                    <div className="flex gap-2 flex-wrap">
                        {/* Bouton Voir transcription */}
                        {hasTranscript && (
                            <Button
                                variant="outline"
                                onClick={openTranscriptDialog}
                                className="gap-2 border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                            >
                                <FileText className="h-4 w-4" />
                                Voir transcription
                            </Button>
                        )}

                        {/* Boutons PDF/Email */}
                        {summary && (
                            <>
                                <Button
                                    onClick={downloadPdf}
                                    variant="outline"
                                    className="gap-2 border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                                >
                                    <Download className="h-4 w-4" />
                                    Télécharger PDF
                                </Button>

                                <Button
                                    onClick={sendPdfToParticipants}
                                    disabled={sending || !meeting.participantsEmails?.length}
                                    className="gap-2 bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                                >
                                    {sending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Envoi...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="h-4 w-4" />
                                            Envoyer
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Messages Success */}
                {sendSuccess && (
                    <Card className="border-[#4CAF50] bg-[#4CAF50]/10 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-[#4CAF50]" />
                                <p className="text-sm text-[#4CAF50] font-medium">{sendSuccess}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Messages Error */}
                {(sendError || summaryError) && (
                    <Card className="border-[#F76A6A] bg-[#F76A6A]/10 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-[#F76A6A]" />
                                <p className="text-sm text-[#F76A6A] font-medium">{sendError || summaryError}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Meeting Info Card */}
                <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8] rounded-md">
                    <CardHeader className="bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8] text-white rounded-t-md">
                        <div className="flex items-start justify-between flex-wrap gap-4">
                            <div className="space-y-3">
                                <CardTitle className="text-2xl font-bold">{meeting.title}</CardTitle>
                                <div className="flex flex-wrap gap-4 text-sm">
                                    {meeting.startDateTime && (
                                        <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-md">
                                            <Calendar className="h-4 w-4" />
                                            {formatDateTime(meeting.startDateTime)}
                                        </span>
                                    )}
                                    {meeting.organizerEmail && (
                                        <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-md">
                                            <Users className="h-4 w-4" />
                                            {meeting.organizerEmail}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Badge
                                className={cn(
                                    "rounded-md font-medium p-2",
                                    meeting.status.toUpperCase() === "SUMMARY_READY"
                                        ? "bg-[#4CAF50] hover:bg-[#45a049] text-white border-[#4CAF50]"
                                        : meeting.status.toUpperCase() === "CREATED"
                                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"
                                            : "bg-white/20 hover:bg-white/30 text-white border-white/30"
                                )}
                            >
                                {formatStatus(meeting.status)}
                            </Badge>
                        </div>
                    </CardHeader>

                    {meeting.participantsEmails && meeting.participantsEmails.length > 0 && (
                        <CardContent className="pt-6">
                            <div className="text-sm">
                                <p className="font-semibold text-white mb-3">
                                    Participants ({meeting.participantsEmails.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {meeting.participantsEmails.map((email, i) => (
                                        <Badge
                                            key={i}
                                            variant="outline"
                                            className="border-white/30 text-white p-2 rounded-md"
                                        >
                                            {email}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Email Logs */}
                {meeting.emailLogs && meeting.emailLogs.length > 0 && (
                    <Card className="shadow-md">
                        <CardHeader>
                            <CardTitle className="text-lg text-[var(--color-dark-100)] flex items-center gap-2">
                                <Mail className="h-5 w-5" />
                                Historique d&apos;envoi
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {meeting.emailLogs.map((log) => (
                                    <div key={log.id} className="flex items-start justify-between p-4 border border-gray-200 rounded-lg bg-white hover:shadow-sm transition-shadow">
                                        <div className="space-y-2 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge
                                                    className={log.status === "SENT"
                                                        ? "bg-[#4CAF50] hover:bg-[#45a049] text-white"
                                                        : "bg-[#F76A6A] hover:bg-[#e55555] text-white"
                                                    }
                                                >
                                                    {log.status}
                                                </Badge>
                                                <span className="text-sm font-medium text-[var(--color-dark-100)]">{log.subject}</span>
                                            </div>
                                            <p className="text-xs text-gray-600">À : {log.to.join(", ")}</p>
                                            {log.error && <p className="text-xs text-[#F76A6A]">{log.error}</p>}
                                        </div>
                                        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* AI Summary or Empty State */}
                {!summary ? (
                    <Card className="shadow-md">
                        <CardContent className="pt-6">
                            <div className="text-center py-12">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--color-dark-100)]/10 flex items-center justify-center">
                                    <FileText className="h-10 w-10 text-[var(--color-dark-100)]" />
                                </div>
                                <h3 className="text-lg font-semibold text-[var(--color-dark-100)] mb-2">
                                    Aucune synthèse IA disponible
                                </h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    Cette réunion n&apos;a pas encore de compte-rendu généré.
                                </p>
                                {hasTranscript && isOrganizer && (
                                    <p className="text-xs text-gray-500 mb-6">
                                        Cliquez sur &quot;Voir transcription&quot; puis &quot;Générer la synthèse&quot;
                                    </p>
                                )}
                                {hasTranscript && !isOrganizer && (
                                    <p className="text-xs text-amber-600 mb-6 flex items-center justify-center gap-2">
                                        <ShieldAlert className="h-4 w-4" />
                                        Seul l&apos;organisateur peut générer une synthèse
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardHeader className="border-b border-[var(--color-dark-100)]/20 bg-[var(--color-dark-100)]/5">
                            <div className="flex items-start justify-between flex-wrap gap-3">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Sparkles className="h-5 w-5 text-white" />
                                        Synthèse générée par IA
                                    </CardTitle>
                                    <CardDescription className="mt-2 text-white/70">
                                        {summary.date} • {summary.heure}
                                    </CardDescription>
                                </div>
                            </div>

                            {summary.participants?.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-[var(--color-dark-100)]/10">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">

                                        {/* ⬅️ Participants */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-white mr-2">
                                                Participants :
                                            </span>

                                            {formatParticipants(summary.participants).map((p, i) => (
                                                <Badge
                                                    key={i}
                                                    variant="outline"
                                                    className="text-xs border-[var(--color-dark-100)]/30 text-[var(--color-dark-100)] bg-white"
                                                >
                                                    {p.label}
                                                </Badge>
                                            ))}
                                        </div>

                                        {/* ➡️ Boutons */}
                                        <div className="flex gap-2 shrink-0">
                                            {!editMode ? (
                                                <Button
                                                    onClick={() => {
                                                        setEditedSummary(summary);
                                                        setEditMode(true);
                                                        setSaveSummaryError(null);
                                                        setSaveSummarySuccess(null);
                                                    }}
                                                    variant="outline"
                                                    className="border-white/30 text-white bg-green-600 hover:bg-green-700 hover:text-white"
                                                >
                                                    Modifier
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button
                                                        onClick={() => {
                                                            setEditMode(false);
                                                            setEditedSummary(summary);
                                                            setSaveSummaryError(null);
                                                            setSaveSummarySuccess(null);
                                                        }}
                                                        variant="outline"
                                                        className="border-red-400 text-white bg-red-400 hover:bg-red-500 hover:text-white"
                                                        disabled={savingSummary}
                                                    >
                                                        Annuler
                                                    </Button>

                                                    <Button
                                                        onClick={saveEditedSummary}
                                                        className="bg-white text-[var(--color-dark-100)] hover:bg-white/90"
                                                        disabled={savingSummary}
                                                    >
                                                        {savingSummary ? "Enregistrement..." : "Enregistrer"}
                                                    </Button>
                                                </>
                                            )}
                                        </div>

                                    </div>
                                </div>
                            )}





                        </CardHeader>



                        <CardContent className="space-y-8 pt-6">
                            {/* Synthèse */}
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-[var(--color-dark-100)]/10">
                                <h3 className="font-bold text-[var(--color-dark-100)] mb-3 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Synthèse (4–5 lignes)
                                </h3>
                                {editMode ? (
                                    <textarea
                                        className="w-full min-h-[110px] rounded-md border border-gray-300 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-dark-100)]"
                                        value={editedSummary?.synthese_4_5_lignes ?? ""}
                                        onChange={(e) =>
                                            setEditedSummary((prev) =>
                                                prev ? { ...prev, synthese_4_5_lignes: e.target.value } : prev
                                            )
                                        }
                                    />
                                ) : (
                                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                                        {summary.synthese_4_5_lignes}
                                    </p>
                                )}

                            </div>

                            {/* Décisions */}
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-[var(--color-dark-100)]/10">
                                <h3 className="font-bold text-[var(--color-dark-100)] mb-3 flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Décisions
                                </h3>
                                {editMode ? (
                                    <textarea
                                        className="w-full min-h-[120px] rounded-md border border-gray-300 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-dark-100)]"
                                        value={toMultiline(editedSummary?.decisions)}
                                        onChange={(e) =>
                                            setEditedSummary((prev) =>
                                                prev ? { ...prev, decisions: fromMultilineKeepEmpty(e.target.value) } : prev
                                            )
                                        }

                                        placeholder={"1 décision par ligne"}
                                    />
                                ) : (
                                    <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                                        {(summary.decisions?.length ? summary.decisions : ["Aucune décision formalisée"]).map((d, i) => (
                                            <li key={i}>{d}</li>
                                        ))}
                                    </ul>
                                )}

                            </div>

                            {/* Tâches */}
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-[var(--color-dark-100)]/10">
                                <h3 className="font-bold text-[var(--color-dark-100)] mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Tâches à réaliser
                                </h3>
                                {editMode ? (
                                    <div className="space-y-3">
                                        {(editedSummary?.taches ?? []).map((t, idx) => (
                                            <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                <Input
                                                    value={t.tache ?? ""}
                                                    onChange={(e) => {
                                                        setEditedSummary((prev) => {
                                                            if (!prev) return prev;
                                                            const next = [...(prev.taches ?? [])];
                                                            next[idx] = { ...next[idx], tache: e.target.value };
                                                            return { ...prev, taches: next };
                                                        });
                                                    }}
                                                    placeholder="Tâche"
                                                />
                                                <Input
                                                    value={t.owner ?? ""}
                                                    onChange={(e) => {
                                                        setEditedSummary((prev) => {
                                                            if (!prev) return prev;
                                                            const next = [...(prev.taches ?? [])];
                                                            next[idx] = { ...next[idx], owner: e.target.value };
                                                            return { ...prev, taches: next };
                                                        });
                                                    }}
                                                    placeholder="Owner"
                                                />
                                                <Input
                                                    value={t.deadline ?? ""}
                                                    onChange={(e) => {
                                                        setEditedSummary((prev) => {
                                                            if (!prev) return prev;
                                                            const next = [...(prev.taches ?? [])];
                                                            next[idx] = { ...next[idx], deadline: e.target.value || null };
                                                            return { ...prev, taches: next };
                                                        });
                                                    }}
                                                    placeholder="Deadline (optionnel)"
                                                />
                                            </div>
                                        ))}

                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditedSummary((prev) => {
                                                        if (!prev) return prev;
                                                        return {
                                                            ...prev,
                                                            taches: [
                                                                ...(prev.taches ?? []),
                                                                { tache: "", owner: "", deadline: null },
                                                            ],
                                                        };
                                                    });
                                                }}
                                            >
                                                + Ajouter une tâche
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditedSummary((prev) => {
                                                        if (!prev) return prev;
                                                        const t = [...(prev.taches ?? [])];
                                                        t.pop();
                                                        return { ...prev, taches: t };
                                                    });
                                                }}
                                                disabled={!(editedSummary?.taches?.length)}
                                            >
                                                - Supprimer la dernière
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    summary.taches?.length ? (
                                        <ul className="list-disc pl-5 space-y-3 text-sm">
                                            {summary.taches.map((a, i) => (
                                                <li key={i}>
                                                    <span className="font-semibold text-gray-900">{a.tache}</span>
                                                    <span className="text-gray-600">
                                                        {" — Owner: "}
                                                        <span className="text-[var(--color-dark-100)]">{a.owner || "Non précisé"}</span>
                                                        {a.deadline ? ` • Deadline: ${a.deadline}` : ""}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-gray-500">Aucune tâche formalisée.</p>
                                    )
                                )}

                            </div>

                            {/* Compte-rendu 10 points */}
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-[var(--color-dark-100)]/10">
                                <h3 className="font-bold text-[var(--color-dark-100)] mb-3">
                                    Compte-rendu (10 points)
                                </h3>
                                {editMode ? (
                                    <textarea
                                        className="w-full min-h-[140px] rounded-md border border-gray-300 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-dark-100)]"
                                        value={toMultiline(editedSummary?.compte_rendu_10_points)}
                                        onChange={(e) =>
                                            setEditedSummary((prev) =>
                                                prev ? { ...prev, compte_rendu_10_points: fromMultilineKeepEmpty(e.target.value) } : prev
                                            )
                                        }
                                        placeholder={"1 point par ligne"}
                                    />
                                ) : (
                                    <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                                        {summary.compte_rendu_10_points?.map((b, i) => (
                                            <li key={i}>{b}</li>
                                        ))}
                                    </ul>
                                )}

                            </div>

                            {/* Compte-rendu développé */}
                            <div className="bg-white rounded-lg p-5 shadow-sm border border-[var(--color-dark-100)]/10">
                                <h3 className="font-bold text-[var(--color-dark-100)] mb-4">
                                    Compte-rendu (10 points développés)
                                </h3>
                                {editMode ? (
                                    <div className="space-y-4">
                                        {(editedSummary?.compte_rendu_10_points_developpes ?? []).map((txt, idx) => (
                                            <div key={idx} className="space-y-2">
                                                <p className="text-sm font-semibold text-[var(--color-dark-100)]">
                                                    Point {idx + 1}
                                                </p>
                                                <textarea
                                                    className="w-full min-h-[140px] rounded-md border border-gray-300 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-dark-100)]"
                                                    value={txt ?? ""}
                                                    onChange={(e) => {
                                                        setEditedSummary((prev) => {
                                                            if (!prev) return prev;
                                                            const next = [...(prev.compte_rendu_10_points_developpes ?? [])];
                                                            next[idx] = e.target.value; // ✅ garde les sauts de ligne
                                                            return { ...prev, compte_rendu_10_points_developpes: next };
                                                        });
                                                    }}
                                                />
                                            </div>
                                        ))}

                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditedSummary((prev) => {
                                                        if (!prev) return prev;
                                                        return {
                                                            ...prev,
                                                            compte_rendu_10_points_developpes: [
                                                                ...(prev.compte_rendu_10_points_developpes ?? []),
                                                                "",
                                                            ],
                                                        };
                                                    });
                                                }}
                                            >
                                                + Ajouter un point développé
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditedSummary((prev) => {
                                                        if (!prev) return prev;
                                                        const arr = [...(prev.compte_rendu_10_points_developpes ?? [])];
                                                        arr.pop();
                                                        return { ...prev, compte_rendu_10_points_developpes: arr };
                                                    });
                                                }}
                                                disabled={!(editedSummary?.compte_rendu_10_points_developpes?.length)}
                                            >
                                                - Supprimer le dernier
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {summary.compte_rendu_10_points_developpes?.map((point, i) => (
                                            <div key={i} className="space-y-2 pb-4 border-b border-gray-200 last:border-0 last:pb-0">
                                                <p className="text-sm font-semibold text-[var(--color-dark-100)]">
                                                    Point {i + 1}
                                                </p>
                                                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                                                    {point}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}


                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Dialog Transcription */}
                <Dialog open={transcriptDialog.open} onOpenChange={(open) => !transcriptDialog.loading && setTranscriptDialog({ open, loading: false, data: null, error: null })}>
                    <DialogContent className="max-w-4xl max-h-[85vh]">
                        <DialogHeader>
                            <DialogTitle className="text-[var(--color-dark-100)]">{meeting.title}</DialogTitle>
                            <DialogDescription>Transcription de la réunion</DialogDescription>

                            {/* ✅ Bouton conditionnel selon le rôle */}

                            <div className="flex gap-2 mt-4">
                                <Button
                                    onClick={generateSummaryFromTranscript}
                                    disabled={transcriptDialog.loading || generatingSummary || !transcriptDialog.data?.parsed?.length}
                                    className="gap-2 bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                                >
                                    {generatingSummary ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Génération...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            Générer la synthèse
                                        </>
                                    )}
                                </Button>
                            </div>

                        </DialogHeader>

                        <ScrollArea className="h-[60vh] pr-4">
                            {transcriptDialog.loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-dark-100)]" />
                                </div>
                            ) : transcriptDialog.error ? (
                                <Card className="border-[#F76A6A] bg-[#F76A6A]/10">
                                    <CardContent className="pt-6">
                                        <p className="text-sm text-[#F76A6A]">{transcriptDialog.error}</p>
                                    </CardContent>
                                </Card>
                            ) : transcriptDialog.data?.parsed ? (
                                <div className="space-y-4">
                                    {transcriptDialog.data.parsed.map((item, i) => (
                                        <div key={i} className="border-l-4 border-[var(--color-dark-100)] pl-4 py-3 bg-gray-50 rounded-r-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                {item.speaker && (
                                                    <p className="text-sm font-bold text-[var(--color-dark-100)]">{item.speaker}</p>
                                                )}
                                                <p className="text-xs text-gray-500">{item.timestamp}</p>
                                            </div>
                                            {item.text && (
                                                <p className="text-sm leading-relaxed text-gray-700">{item.text}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Card className="border-gray-200">
                                    <CardContent className="pt-6">
                                        <p className="text-sm text-gray-600">Aucune transcription disponible.</p>
                                    </CardContent>
                                </Card>
                            )}
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}