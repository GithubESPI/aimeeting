"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    CalendarDays,
    Video,
    User,
    Sparkles,
    ArrowRight,
    Mail,
    FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Meeting = {
    id: string;
    eventId: string;
    subject: string;
    start: string | null;
    end: string | null;
    joinUrl: string | null;
    organizer: { name: string | null; address: string | null };
    role: "organisateur" | "participant";
    attendeesCount: number;
    transcripts: any[];
};

type ApiResponse = {
    user: { displayName: string };
    meetings: Meeting[];
    stats?: {
        total: number;
        withSummary: number;
        withTranscript: number;
        asOrganizer: number;
        asParticipant: number;
    };
};

function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d);
}

export default function DashboardPage() {
    const router = useRouter();
    const { data: session } = useSession();

    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [meetings, setMeetings] = React.useState<Meeting[]>([]);
    const [apiStats, setApiStats] = React.useState<ApiResponse['stats'] | null>(null);

    React.useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`/api/dashboard/meetings`, {
                    method: "GET",
                    cache: "no-store",
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = (await res.json()) as ApiResponse;

                setMeetings(json.meetings ?? []);
                setApiStats(json.stats ?? null);

                console.log("📊 Dashboard data:", {
                    total: json.meetings?.length,
                    firstMeeting: json.meetings?.[0],
                    stats: json.stats,
                });
            } catch (e: any) {
                setError(e?.message ?? "Erreur lors du chargement");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const stats = React.useMemo(() => {
        const total = apiStats?.total ?? meetings.length;
        const asOrganizer = apiStats?.asOrganizer ?? meetings.filter((m) => m.role === "organisateur").length;
        const asParticipant = apiStats?.asParticipant ?? meetings.filter((m) => m.role === "participant").length;
        const totalTranscripts = apiStats?.withTranscript ?? meetings.reduce((acc, m) => acc + (m.transcripts?.length ?? 0), 0);
        const withSummary = apiStats?.withSummary ?? meetings.length;
        const last = meetings[0] ?? null;
        return { total, asOrganizer, asParticipant, totalTranscripts, withSummary, last };
    }, [meetings, apiStats]);

    const top5 = React.useMemo(() => meetings.slice(0, 5), [meetings]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-7xl px-4 py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-[var(--color-dark-100)]">
                            Bienvenue {session?.user?.name ?? "👋"}
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Accédez rapidement à vos réunions avec synthèse IA générée.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={() => router.push("/meetings")}
                            className="gap-2 bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white"
                        >
                            <CalendarDays className="h-4 w-4" />
                            Mes réunions
                        </Button>

                        <Button
                            className="gap-2 bg-[#F76A6A] hover:bg-[#e55555]"
                            onClick={() => signOut({ callbackUrl: "/" })}
                        >
                            Se déconnecter
                        </Button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="pt-6">
                            <p className="text-sm text-red-600">{error}</p>
                        </CardContent>
                    </Card>
                )}

                {/* Stats Grid */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Total réunions */}
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardContent className="pt-6 pb-6">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-white/80">
                                        Total des réunions avec transcriptions
                                    </p>
                                    <p className="text-4xl font-bold text-white">
                                        {loading ? "—" : stats.total}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white/10 p-3">
                                    <CalendarDays className="h-6 w-6 text-white" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Avec synthèse IA */}
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardContent className="pt-6 pb-6">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-white/80">
                                        Comptes-rendus générés avec l&apos;IA
                                    </p>
                                    <p className="text-4xl font-bold text-white">
                                        {loading ? "—" : stats.withSummary}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white/10 p-3">
                                    <Sparkles className="h-6 w-6 text-white" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Organisateur */}
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardContent className="pt-6 pb-6">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-white/80">
                                        Réunions en tant qu&apos;organisateur
                                    </p>
                                    <p className="text-4xl font-bold text-white">
                                        {loading ? "—" : stats.asOrganizer}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white/10 p-3">
                                    <Video className="h-6 w-6 text-white" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Participant */}
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardContent className="pt-6 pb-6">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-white/80">
                                        Réunions en tant que participant
                                    </p>
                                    <p className="text-4xl font-bold text-white">
                                        {loading ? "—" : stats.asParticipant}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white/10 p-3">
                                    <User className="h-6 w-6 text-white" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Grid */}
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Recent meetings */}
                    <Card className="lg:col-span-2 shadow-md">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-[var(--color-dark-100)] text-xl">
                                Dernières réunions avec les synthèses IA
                            </CardTitle>
                            <CardDescription className="text-gray-600">
                                Toutes les réunions qui ont des synthèses générées par l&apos;IA
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-24 w-full" />
                                    ))}
                                </div>
                            ) : top5.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                                        <FileText className="h-8 w-8 text-gray-400" />
                                    </div>
                                    <p className="text-gray-600 mb-4">Aucune réunion avec synthèse générée.</p>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push("/meetings")}
                                        className="gap-2 border-[var(--color-dark-100)] text-[var(--color-dark-100)] hover:bg-[var(--color-dark-100)] hover:text-white"
                                    >
                                        Aller à mes réunions <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                top5.map((m) => (
                                    <div
                                        key={m.id}
                                        className="rounded-lg shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8] text-white p-5 hover:shadow-lg transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-semibold text-lg line-clamp-1">{m.subject}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge
                                                        className={cn(
                                                            "rounded-md font-medium",
                                                            m.role === "organisateur"
                                                                ? "bg-[#F76A6A] hover:bg-[#e55555] text-white"
                                                                : "bg-white/20 hover:bg-white/30 text-white"
                                                        )}
                                                    >
                                                        {m.role === "organisateur" ? "Organisateur" : "Participant"}
                                                    </Badge>
                                                    <Badge className="gap-1 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-md font-medium">
                                                        <Sparkles className="h-3 w-3" />
                                                        Synthèse IA
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-white/80">
                                                    {formatDateTime(m.start)} • {m.organizer?.name ?? "Organisateur —"}
                                                </p>
                                            </div>

                                            <Button
                                                size="sm"
                                                onClick={() => router.push(`/meetings/${m.id}`)}
                                                className="gap-2 bg-white text-[var(--color-dark-100)] hover:bg-[#F76A6A] hover:text-white transition-colors shrink-0"
                                            >
                                                Voir <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* How it works */}
                    <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                        <CardHeader>
                            <CardTitle className="text-white text-xl">Comment ça marche</CardTitle>
                            <CardDescription className="text-white/80">Étape par étape</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="rounded-lg bg-white p-4 shadow-sm">
                                <p className="font-semibold text-[var(--color-dark-100)] mb-2">
                                    1) Ouvre une réunion
                                </p>
                                <p className="text-sm text-gray-600">
                                    Va dans &quot;Mes réunions&quot; et choisis un enregistrement.
                                </p>
                            </div>

                            <div className="rounded-lg bg-white p-4 shadow-sm">
                                <p className="font-semibold text-[var(--color-dark-100)] mb-2">
                                    2) Génère la synthèse IA
                                </p>
                                <p className="text-sm text-gray-600">
                                    Clique sur &quot;Voir la transcription&quot; puis clique sur le bouton &quot;Générer la synthèse&quot;.
                                </p>
                            </div>

                            <div className="rounded-lg bg-white p-4 shadow-sm">
                                <p className="font-semibold text-[var(--color-dark-100)] mb-2">
                                    3) PDF + Envoi
                                </p>
                                <p className="text-sm text-gray-600">
                                    Télécharge le PDF ou envoie-le aux participants.
                                </p>
                            </div>

                            <div className="rounded-lg bg-white/10 border border-white/20 p-4">
                                <p className="font-semibold flex items-center gap-2 text-white mb-2">
                                    <Mail className="h-4 w-4" />
                                    Astuce
                                </p>
                                <p className="text-sm text-white/90">
                                    Seules les réunions avec des synthèses générées apparaissent ici.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}