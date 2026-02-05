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
    const { data: session, status } = useSession();
    const router = useRouter();

    // States
    const [email, setEmail] = React.useState("l.vaughn@groupe-espi.fr");
    const [startDate, setStartDate] = React.useState("2026-01-01");
    const [endDate, setEndDate] = React.useState("2026-12-31");
    const [onlyWithTranscripts, setOnlyWithTranscripts] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [data, setData] = React.useState<ApiResponse | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState("");

    // Vérification Admin (Sécurité Client-side)
    const isAdmin = session?.user?.email === "a.vespuce@groupe-espi.fr";

    React.useEffect(() => {
        if (status === "unauthenticated" || (status === "authenticated" && !isAdmin)) {
            router.push("/dashboard");
        }
    }, [isAdmin, status, router]);

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

            const json = await res.json();

            if (!res.ok) {
                throw new Error(json?.error || `Erreur ${res.status}`);
            }

            setData(json);
        } catch (e: any) {
            console.error("Fetch error:", e);
            setError(e?.message || "Erreur lors du chargement des réunions");
        } finally {
            setLoading(false);
        }
    }

    const filteredMeetings = React.useMemo(() => {
        if (!data?.meetings) return [];
        let filtered = data.meetings;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter((m) =>
                m.subject?.toLowerCase().includes(q) ||
                m.organizer?.emailAddress?.address?.toLowerCase().includes(q) ||
                m.organizer?.emailAddress?.name?.toLowerCase().includes(q)
            );
        }

        return filtered;
    }, [data, searchQuery]);

    // État de chargement de la session
    if (status === "loading") {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-dark-100)]" />
            </div>
        );
    }

    if (!isAdmin) return null; // Le useEffect gère la redirection

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
                        Visualisez et dépannez les réunions Microsoft Graph pour n&apos;importe quel utilisateur.
                    </p>
                </div>

                {/* Formulaire de recherche */}
                <Card className="mb-6 shadow-md border-t-4 border-t-[var(--color-dark-100)]">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Paramètres de recherche
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Email de l&apos;utilisateur</label>
                                <Input
                                    type="email"
                                    placeholder="email@groupe-espi.fr"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && fetchMeetings()}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date de début</label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date de fin</label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="onlyTranscripts"
                                    checked={onlyWithTranscripts}
                                    onChange={(e) => setOnlyWithTranscripts(e.target.checked)}
                                    className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                                />
                                <label htmlFor="onlyTranscripts" className="text-sm font-medium text-gray-700 cursor-pointer">
                                    📝 Uniquement avec transcription
                                </label>
                            </div>

                            <Button
                                onClick={fetchMeetings}
                                disabled={loading || !email}
                                className="bg-[var(--color-dark-100)] hover:bg-[#004a6b] text-white min-w-[150px]"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                                Rechercher
                            </Button>
                        </div>

                        {/* Liens rapides */}
                        <div className="flex gap-2 flex-wrap pt-2 border-t mt-4">
                            <span className="text-xs font-semibold uppercase text-gray-400 w-full mb-1">Accès rapide</span>
                            {["l.vaughn@groupe-espi.fr", "didier.latour@groupe-espi.fr", "a.vespuce@groupe-espi.fr"].map((acc) => (
                                <Button
                                    key={acc}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => {
                                        setEmail(acc);
                                        // Petit délai pour laisser le state se mettre à jour avant de fetcher
                                        setTimeout(() => fetchMeetings(), 50);
                                    }}
                                >
                                    {acc.split('@')[0].replace('.', ' ')}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <Card className="mb-6 border-red-200 bg-red-50">
                        <CardContent className="pt-6 flex items-center gap-3 text-red-700">
                            <AlertCircle className="h-5 w-5" />
                            <p className="font-medium">{error}</p>
                        </CardContent>
                    </Card>
                )}

                {data && (
                    <>
                        {/* Stats Cards */}
                        <div className="grid gap-4 md:grid-cols-4 mb-6">
                            {[
                                { label: "Utilisateur", val: data.email, icon: User, color: "from-blue-600 to-blue-700" },
                                { label: "Total Réunions", val: data.count, icon: Calendar, color: "from-slate-700 to-slate-800" },
                                { label: "Teams Meetings", val: data.meetings.filter(m => m.isOnlineMeeting).length, icon: CheckCircle2, color: "from-green-600 to-green-700" },
                                { label: "Transcriptions", val: data.meetings.filter(m => m.hasTranscript).length, icon: RefreshCw, color: "from-amber-500 to-amber-600" },
                            ].map((stat, i) => (
                                <Card key={i} className={`shadow-md text-white bg-gradient-to-br ${stat.color} border-none`}>
                                    <CardContent className="pt-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-medium opacity-80 uppercase tracking-wider">{stat.label}</p>
                                                <p className="text-xl font-bold truncate max-w-[180px]">{stat.val}</p>
                                            </div>
                                            <stat.icon className="h-8 w-8 opacity-30" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Search in results */}
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                placeholder="Rechercher par titre ou organisateur dans cette liste..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 shadow-sm"
                            />
                        </div>

                        {/* List */}
                        <div className="space-y-4">
                            {filteredMeetings.length === 0 ? (
                                <Card className="bg-gray-50 border-dashed">
                                    <CardContent className="py-12 text-center text-gray-400">
                                        Aucune réunion trouvée.
                                    </CardContent>
                                </Card>
                            ) : (
                                filteredMeetings.map((meeting) => {
                                    const start = new Date(meeting.start.dateTime);
                                    const end = new Date(meeting.end.dateTime);
                                    return (
                                        <Card
                                            key={meeting.id}
                                            className="hover:shadow-md transition-all cursor-pointer border-l-4 border-l-[var(--color-dark-100)]"
                                            onClick={() => router.push(`/admin/debug-meetings/${meeting.id}?userEmail=${encodeURIComponent(email)}`)}
                                        >
                                            <CardContent className="p-5">
                                                <div className="flex flex-col md:flex-row gap-5 items-start">
                                                    {/* Date Badge */}
                                                    <div className="bg-gray-100 rounded-lg p-3 min-w-[80px] text-center shadow-inner">
                                                        <span className="block text-2xl font-black text-gray-800">{start.getDate()}</span>
                                                        <span className="block text-xs font-bold uppercase text-gray-500">
                                                            {start.toLocaleDateString("fr-FR", { month: "short" })}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <h3 className="text-lg font-bold text-gray-900 truncate">
                                                                {meeting.subject || "(Pas de sujet)"}
                                                            </h3>
                                                            {meeting.hasTranscript && <Badge className="bg-amber-500 text-white border-none">📝 Transcript</Badge>}
                                                            {meeting.isOnlineMeeting && <Badge className="bg-green-600 text-white border-none">Teams</Badge>}
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-sm text-gray-600">
                                                            <div className="flex items-center gap-2">
                                                                <span className="opacity-70">⏰</span>
                                                                {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="opacity-70">👤</span>
                                                                <span className="truncate">{meeting.organizer?.emailAddress?.name || meeting.organizer?.emailAddress?.address}</span>
                                                            </div>
                                                            {meeting.attendees && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="opacity-70">👥</span>
                                                                    {meeting.attendees.length} participant(s)
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center self-center">
                                                        <Button variant="ghost" size="sm" className="text-[var(--color-dark-100)]">
                                                            Détails →
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}

                {loading && (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-28 w-full rounded-xl" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}