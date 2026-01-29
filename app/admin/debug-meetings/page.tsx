// app/admin/debug-meetings/page.tsx
"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Search,
    RefreshCw,
    Shield,
    User,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Loader2
} from "lucide-react";

type Meeting = {
    id: string;
    subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    organizer: { emailAddress: { name: string; address: string } };
    isOnlineMeeting: boolean;
    onlineMeeting?: {
        joinUrl: string;
    };
    attendees?: Array<{
        emailAddress: { name: string; address: string };
        type: string;
    }>;
    hasTranscript?: boolean;
    onlineMeetingId?: string;
};

type ApiResponse = {
    email: string;
    count: number;
    meetings: Meeting[];
};

export default function AdminDebugMeetingsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [email, setEmail] = React.useState("l.vaughn@groupe-espi.fr");
    const [startDate, setStartDate] = React.useState("2026-01-01");
    const [endDate, setEndDate] = React.useState("2026-12-31");
    const [onlyWithTranscripts, setOnlyWithTranscripts] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [data, setData] = React.useState<ApiResponse | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState("");

    // Vérifier que l&apos;utilisateur est admin
    const isAdmin = session?.user?.email === "a.vespuce@groupe-espi.fr";

    React.useEffect(() => {
        if (!isAdmin && session) {
            window.location.href = "/dashboard";
        }
    }, [isAdmin, session]);

    async function fetchMeetings() {
        if (!email) return;

        setLoading(true);
        setError(null);
        setData(null);

        try {
            const params = new URLSearchParams({
                email: email,
                startDate: startDate,
                endDate: endDate,
                onlyWithTranscripts: onlyWithTranscripts.toString()
            });

            const res = await fetch(`/api/admin/debug-meetings?${params.toString()}`, {
                cache: "no-store",
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
            }

            const json = await res.json();
            setData(json);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du chargement");
        } finally {
            setLoading(false);
        }
    }

    const filteredMeetings = React.useMemo(() => {
        if (!data?.meetings) return [];
        if (!searchQuery) return data.meetings;

        const q = searchQuery.toLowerCase();
        return data.meetings.filter((m) =>
            m.subject.toLowerCase().includes(q) ||
            m.organizer.emailAddress.address.toLowerCase().includes(q)
        );
    }, [data, searchQuery]);

    if (!session) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-96">
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-[var(--color-dark-100)]" />
                            <p className="text-sm text-gray-600">Vérification des accès...</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-96 border-[#F76A6A]">
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-[#F76A6A]" />
                            <h3 className="text-lg font-semibold mb-2">Accès refusé</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Cette page est réservée aux administrateurs.
                            </p>
                            <Button onClick={() => window.location.href = "/dashboard"}>
                                Retour au dashboard
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-7xl px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="h-8 w-8 text-[var(--color-dark-100)]" />
                        <h1 className="text-4xl font-bold tracking-tight text-[var(--color-dark-100)]">
                            Admin - Debug Réunions
                        </h1>
                    </div>
                    <p className="text-gray-600">
                        Testez les réunions Microsoft Graph pour n&apos;importe quel utilisateur
                    </p>
                </div>

                {/* Search Form */}
                <Card className="mb-6 shadow-md">
                    <CardHeader>
                        <CardTitle className="text-[var(--color-dark-100)] flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Rechercher les réunions d&apos;un utilisateur
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <Input
                                    type="email"
                                    placeholder="email@groupe-espi.fr"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="flex-1"
                                    onKeyDown={(e) => e.key === "Enter" && fetchMeetings()}
                                />
                                <Button
                                    onClick={fetchMeetings}
                                    disabled={loading || !email}
                                    className="bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Chargement...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="h-4 w-4" />
                                            Rechercher
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Date Range */}
                            <div className="flex gap-3 items-center">
                                <span className="text-sm text-gray-600 whitespace-nowrap">Période :</span>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="flex-1"
                                />
                                <span className="text-gray-600">→</span>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="flex-1"
                                />
                            </div>

                            {/* Filter Transcriptions */}
                            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="onlyTranscripts"
                                    checked={onlyWithTranscripts}
                                    onChange={(e) => setOnlyWithTranscripts(e.target.checked)}
                                    className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                                />
                                <label htmlFor="onlyTranscripts" className="text-sm font-medium text-gray-700 cursor-pointer">
                                    📝 Afficher uniquement les réunions avec transcription
                                </label>
                            </div>

                            {/* Quick links */}
                            <div className="mt-4 flex gap-2 flex-wrap">
                                <span className="text-sm text-gray-600">Accès rapide :</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setEmail("l.vaughn@groupe-espi.fr");
                                        setTimeout(() => fetchMeetings(), 100);
                                    }}
                                >
                                    Leïla VAUGHN
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setEmail("didier.latour@groupe-espi.fr");
                                        setTimeout(() => fetchMeetings(), 100);
                                    }}
                                >
                                    Didier LATOUR
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setEmail("a.vespuce@groupe-espi.fr");
                                        setTimeout(() => fetchMeetings(), 100);
                                    }}
                                >
                                    Andy VESPUCE
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Error Message */}
                {error && (
                    <Card className="mb-6 border-[#F76A6A] bg-[#F76A6A]/10">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-[#F76A6A]" />
                                <p className="text-sm text-[#F76A6A] font-medium">{error}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Results */}
                {data && (
                    <>
                        {/* Stats */}
                        <div className="grid gap-4 md:grid-cols-4 mb-6">
                            <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-white/80">Utilisateur</p>
                                            <p className="text-2xl font-bold text-white">{data.email}</p>
                                        </div>
                                        <User className="h-8 w-8 text-white/50" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-white/80">Réunions trouvées</p>
                                            <p className="text-2xl font-bold text-white">{data.count}</p>
                                        </div>
                                        <Calendar className="h-8 w-8 text-white/50" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-white/80">Teams Meetings</p>
                                            <p className="text-2xl font-bold text-white">
                                                {data.meetings.filter(m => m.isOnlineMeeting).length}
                                            </p>
                                        </div>
                                        <CheckCircle2 className="h-8 w-8 text-white/50" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-md border-amber-500/20 bg-gradient-to-r from-amber-500 to-amber-600">
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-white/80">Avec transcription</p>
                                            <p className="text-2xl font-bold text-white">
                                                {data.meetings.filter(m => m.hasTranscript).length}
                                            </p>
                                        </div>
                                        <RefreshCw className="h-8 w-8 text-white/50" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Filter */}
                        <Card className="mb-6 shadow-sm">
                            <CardContent className="pt-6">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <Input
                                        placeholder="Filtrer par titre ou organisateur..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Meetings List */}
                        {filteredMeetings.length === 0 ? (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                    <p className="text-gray-600">
                                        {searchQuery ? "Aucune réunion ne correspond à votre recherche" : "Aucune réunion trouvée"}
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {filteredMeetings.map((meeting, idx) => {
                                    const startDate = new Date(meeting.start.dateTime);
                                    const endDate = new Date(meeting.end.dateTime);

                                    return (
                                        <Card
                                            key={meeting.id}
                                            onClick={() => router.push(`/admin/debug-meetings/${meeting.id}?userEmail=${encodeURIComponent(email)}`)}
                                            className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                        >
                                            <CardContent className="pt-6">
                                                <div className="flex items-start gap-4">
                                                    {/* Date Box */}
                                                    <div className="flex flex-col items-center justify-center rounded-lg bg-[var(--color-dark-100)] text-white px-4 py-3 min-w-[70px]">
                                                        <div className="text-3xl font-bold leading-none">
                                                            {startDate.getDate()}
                                                        </div>
                                                        <div className="text-xs uppercase font-medium mt-1 opacity-90">
                                                            {startDate.toLocaleDateString("fr-FR", { month: "short" })}
                                                        </div>
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <h3 className="text-lg font-semibold text-[var(--color-dark-100)]">
                                                                {meeting.subject}
                                                            </h3>
                                                            <div className="flex gap-2">
                                                                {meeting.hasTranscript && (
                                                                    <Badge className="bg-amber-500 text-white">
                                                                        📝 Transcription
                                                                    </Badge>
                                                                )}
                                                                {meeting.isOnlineMeeting && (
                                                                    <Badge className="bg-[#4CAF50] text-white">
                                                                        Teams Meeting
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                                                            <span>
                                                                ⏰ {startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - {endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                                            </span>
                                                            <span>•</span>
                                                            <span>
                                                                👤 {meeting.organizer.emailAddress.name || meeting.organizer.emailAddress.address}
                                                            </span>
                                                        </div>

                                                        {meeting.attendees && meeting.attendees.length > 0 && (
                                                            <div className="text-sm text-gray-600">
                                                                👥 {meeting.attendees.length} participant(s)
                                                            </div>
                                                        )}

                                                        {meeting.onlineMeeting?.joinUrl && (
                                                            <a
                                                                href={meeting.onlineMeeting.joinUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm text-[var(--color-dark-100)] hover:underline"
                                                            >
                                                                🔗 Rejoindre la réunion
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-32 w-full" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}