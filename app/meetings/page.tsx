// app/meetings/page.tsx
// ✅ Version finale avec style ESPI + formatage des status

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
    CalendarDays,
    RefreshCw,
    Search,
    Users,
    Video,
    Clock,
    User,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    FileText,
    ArrowLeft,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Meeting = {
    id: string;
    title: string;
    status: string;
    startDateTime: string | null;
    endDateTime: string | null;
    organizerEmail: string | null;
    joinUrl: string | null;

    hasSummary: boolean;
    hasTranscript: boolean;
    hasGraphTranscript: boolean;
    hasGraphRecording: boolean;

    participantsEmails: string[] | null;
    attendeesCount: number;
    attendees: Array<{
        id: string;
        role: string | null;
        participant: {
            displayName: string | null;
            email: string | null;
        };
    }>;

    createdAt: string;
    lastEmailSentAt: string | null;
    lastPdfGeneratedAt: string | null;
};

type ApiResponse = {
    user: { name: string | null };
    count: number;
    meetings: Meeting[];
};

function formatDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);
}

function formatTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC" // ✅ AJOUTEZ CETTE LIGNE
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

export default function MeetingsPage() {
    const router = useRouter();

    const [loading, setLoading] = React.useState(true);
    const [syncing, setSyncing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    const [data, setData] = React.useState<ApiResponse | null>(null);

    React.useEffect(() => {
        fetchMeetings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchMeetings() {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/meetings", {
                method: "GET",
                cache: "no-store",
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
            }

            const json = (await res.json()) as ApiResponse;
            setData(json);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du chargement");
        } finally {
            setLoading(false);
        }
    }

    // ✅ Bouton Actualiser : appelle my-meetings-with-transcripts avec persist=true
    async function syncMeetings() {
        setSyncing(true);
        setError(null);
        setSyncSuccess(null);

        try {
            console.log("🔄 Synchronisation depuis Microsoft Graph...");

            const res = await fetch("/api/my-meetings-with-transcripts?persist=true&onlyWithTranscripts=true", {
                method: "GET",
                cache: "no-store",
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
            }

            const json = await res.json();

            console.log("✅ Synchronisation terminée:", json);

            setSyncSuccess(`✅ ${json.count} réunions synchronisées`);

            // Recharger les données depuis la DB
            setTimeout(() => fetchMeetings(), 1000);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors de la synchronisation");
        } finally {
            setSyncing(false);
        }
    }

    const meetings = React.useMemo(() => {
        const list = data?.meetings ?? [];
        const q = query.trim().toLowerCase();
        if (!q) return list;

        return list.filter((m) => {
            const hay = [m.title, m.organizerEmail ?? ""].join(" ").toLowerCase();
            return hay.includes(q);
        });
    }, [data, query]);

    const stats = React.useMemo(() => {
        const total = meetings.length;
        const withSummary = meetings.filter((m) => m.hasSummary).length;
        const withTranscript = meetings.filter((m) => m.hasTranscript || m.hasGraphTranscript).length;
        const asOrganizer = meetings.filter((m) =>
            m.attendees.some(a => a.role === "organizer")
        ).length;

        return { total, withSummary, withTranscript, asOrganizer };
    }, [meetings]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-7xl px-4 py-8">
                {/* Header */}
                <div className="mb-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight text-[var(--color-dark-100)]">
                                Mes Réunions
                            </h1>
                            <p className="mt-2 text-gray-600">
                                {data?.user?.name && `${data.user.name} • `}
                                Gérez vos réunions Teams et leurs enregistrements
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                onClick={() => router.push("/dashboard")}
                                variant="outline"
                                className="gap-2 border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Retour
                            </Button>

                            <Button
                                onClick={syncMeetings}
                                disabled={loading || syncing}
                                className="gap-2 bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                            >
                                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                                Actualiser
                            </Button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                            <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-white/80">Total</p>
                                        <p className="text-4xl font-bold text-white">{stats.total}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/10 p-3">
                                        <CalendarDays className="h-6 w-6 text-white" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                            <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-white/80">Organisées</p>
                                        <p className="text-4xl font-bold text-white">{stats.asOrganizer}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/10 p-3">
                                        <User className="h-6 w-6 text-white" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                            <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-white/80">Avec synthèse</p>
                                        <p className="text-4xl font-bold text-white">{stats.withSummary}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/10 p-3">
                                        <Sparkles className="h-6 w-6 text-white" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                            <CardContent className="pt-6 pb-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-white/80">Avec transcription</p>
                                        <p className="text-4xl font-bold text-white">{stats.withTranscript}</p>
                                    </div>
                                    <div className="rounded-lg bg-white/10 p-3">
                                        <Video className="h-6 w-6 text-white" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Success message */}
                {syncSuccess && (
                    <Card className="mb-6 border-[#4CAF50] bg-[#4CAF50]/10 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-[#4CAF50]" />
                                <p className="text-sm text-[#4CAF50] font-medium">{syncSuccess}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Error message */}
                {error && (
                    <Card className="mb-6 border-[#F76A6A] bg-[#F76A6A]/10 shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-[#F76A6A]" />
                                <p className="text-sm text-[#F76A6A] font-medium">{error}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Search */}
                <Card className="mb-6 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                className="pl-9 border-gray-300 bg-white focus:border-[var(--color-dark-100)] focus:ring-[var(--color-dark-100)]"
                                placeholder="Rechercher une réunion..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Meetings List */}
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-48 w-full rounded-lg" />
                        ))}
                    </div>
                ) : meetings.length === 0 ? (
                    <Card className="shadow-sm">
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <div className="rounded-full bg-[var(--color-dark-100)]/10 p-6 mb-4">
                                <FileText className="h-12 w-12 text-[var(--color-dark-100)]" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-[var(--color-dark-100)]">
                                Aucune réunion trouvée
                            </h3>
                            <p className="text-sm text-gray-600 text-center max-w-sm mb-4">
                                Cliquez sur &quot;Actualiser&quot; pour synchroniser vos réunions Teams
                            </p>
                            <Button
                                onClick={syncMeetings}
                                disabled={syncing}
                                className="bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
                                Synchroniser mes réunions
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {meetings.map((m) => {
                            const isOrganizer = m.attendees.some(a => a.role === "organizer");

                            return (
                                <Card
                                    key={m.id}
                                    className={cn(
                                        "overflow-hidden transition-all hover:shadow-xl cursor-pointer border shadow-sm",
                                        m.hasSummary
                                            ? "bg-gradient-to-r from-white to-[var(--color-dark-100)]/5 border-[var(--color-dark-100)]/20"
                                            : "bg-white border-gray-300"
                                    )}
                                    onClick={() => router.push(`/meetings/${m.id}`)}
                                >
                                    <CardHeader className="pb-4">
                                        <div className="flex items-start gap-4">
                                            {/* Date Box */}
                                            <div className="flex flex-col items-center justify-center rounded-lg bg-[var(--color-dark-100)] text-white px-4 py-3 min-w-[70px] shadow-sm">
                                                <div className="text-3xl font-bold leading-none">
                                                    {m.startDateTime ? new Date(m.startDateTime).getDate() : "?"}
                                                </div>
                                                <div className="text-xs uppercase font-medium mt-1 opacity-90">
                                                    {formatDate(m.startDateTime).split(" ")[1]}
                                                </div>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="space-y-2 flex-1">
                                                        <CardTitle className="text-xl flex items-center gap-2 flex-wrap text-[var(--color-dark-100)]">
                                                            {m.title}
                                                            {m.hasSummary && (
                                                                <Badge className="gap-1 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-md font-medium">
                                                                    <Sparkles className="h-3 w-3" />
                                                                    Synthèse IA
                                                                </Badge>
                                                            )}
                                                            {m.hasGraphTranscript && (
                                                                <Badge variant="outline" className="gap-1 border-[var(--color-dark-100)] text-[var(--color-dark-100)] rounded-md">
                                                                    <Video className="h-3 w-3" />
                                                                    Transcription
                                                                </Badge>
                                                            )}
                                                        </CardTitle>

                                                        <CardDescription className="flex items-center gap-3 text-sm flex-wrap text-gray-600">
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3.5 w-3.5" />
                                                                {formatTime(m.startDateTime)} - {formatTime(m.endDateTime)}
                                                            </span>
                                                            {m.organizerEmail && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="flex items-center gap-1">
                                                                        <User className="h-3.5 w-3.5" />
                                                                        {m.organizerEmail}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </CardDescription>
                                                    </div>
                                                </div>

                                                {/* Badges */}
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge
                                                        className={cn(
                                                            "rounded-md font-medium",
                                                            isOrganizer
                                                                ? "bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                                                                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                                        )}
                                                    >
                                                        {isOrganizer ? "Organisateur" : "Participant"}
                                                    </Badge>

                                                    <Badge
                                                        className={cn(
                                                            "rounded-md font-medium",
                                                            m.status.toUpperCase() === "SUMMARY_READY"
                                                                ? "bg-[#4CAF50] hover:bg-[#45a049] text-white"
                                                                : m.status.toUpperCase() === "CREATED"
                                                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                                                    : "border-gray-300 text-gray-700 bg-gray-100"
                                                        )}
                                                    >
                                                        {formatStatus(m.status)}
                                                    </Badge>

                                                    <Badge
                                                        variant="outline"
                                                        className="gap-1 border-gray-300 text-gray-700 rounded-md"
                                                    >
                                                        <Users className="h-3 w-3" />
                                                        {m.attendeesCount} participants
                                                    </Badge>

                                                    {m.lastEmailSentAt && (
                                                        <Badge
                                                            className="gap-1 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-md font-medium"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            PDF envoyé
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}