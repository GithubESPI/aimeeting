// app/admin/debug-meetings/[id]/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ArrowLeft,
    Calendar,
    Clock,
    User,
    Users,
    Video,
    FileText,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Database,
} from "lucide-react";

type MeetingDetail = {
    id: string;
    subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    organizer: {
        emailAddress: { name: string; address: string };
    };
    attendees: Array<{
        emailAddress: { name: string; address: string };
        type: string;
        status: { response: string; time: string };
    }>;
    isOnlineMeeting: boolean;
    onlineMeeting?: {
        joinUrl: string;
        conferenceId: string;
        tollNumber: string;
    };
    onlineMeetingProvider: string;
    body: {
        contentType: string;
        content: string;
    };
    location: {
        displayName: string;
    };
    hasTranscript?: boolean;
    transcripts?: Array<{
        id: string;
        createdDateTime: string;
    }>;
    inDatabase?: boolean;
    databaseId?: string;
};

export default function AdminMeetingDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();
    const meetingId = params.id as string;

    const [loading, setLoading] = React.useState(true);
    const [meeting, setMeeting] = React.useState<MeetingDetail | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const isAdmin = session?.user?.email === "a.vespuce@groupe-espi.fr";

    React.useEffect(() => {
        if (!isAdmin && session) {
            router.push("/dashboard");
        }
    }, [isAdmin, session, router]);

    React.useEffect(() => {
        if (isAdmin && meetingId) {
            fetchMeetingDetail();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetingId, isAdmin]);

    async function fetchMeetingDetail() {
        setLoading(true);
        setError(null);

        try {
            // Récupérer userEmail depuis l'URL
            const searchParams = new URLSearchParams(window.location.search);
            const userEmail = searchParams.get('userEmail');

            if (!userEmail) {
                throw new Error("Email utilisateur manquant dans l'URL");
            }

            const res = await fetch(
                `/api/admin/meeting-detail?meetingId=${encodeURIComponent(meetingId)}&userEmail=${encodeURIComponent(userEmail)}`,
                { cache: "no-store" }
            );

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
            }

            const data = await res.json();
            setMeeting(data.meeting);
        } catch (e: any) {
            setError(e?.message ?? "Erreur lors du chargement");
        } finally {
            setLoading(false);
        }
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-dark-100)]" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Card className="w-96 border-[#F76A6A]">
                    <CardContent className="pt-6 text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-[#F76A6A]" />
                        <h3 className="text-lg font-semibold mb-2">Accès refusé</h3>
                        <p className="text-sm text-gray-600">Cette page est réservée aux administrateurs.</p>
                    </CardContent>
                </Card>
            </div>
        );
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

    if (error || !meeting) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto max-w-5xl px-4 py-8">
                    <Card className="border-[#F76A6A] bg-[#F76A6A]/10">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertCircle className="h-5 w-5 text-[#F76A6A]" />
                                <p className="font-semibold text-[#F76A6A]">Erreur</p>
                            </div>
                            <p className="text-sm text-[#F76A6A] mb-4">{error || "Réunion non trouvée"}</p>
                            <Button variant="outline" onClick={() => router.push("/admin/debug-meetings")}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    const startDate = new Date(meeting.start.dateTime);
    const endDate = new Date(meeting.end.dateTime);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/admin/debug-meetings")}
                        className="gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Retour
                    </Button>

                    {meeting.inDatabase && meeting.databaseId && (
                        <Button
                            onClick={() => router.push(`/meetings/${meeting.databaseId}`)}
                            className="gap-2 bg-[var(--color-dark-100)] hover:bg-[#004a6b]"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Voir dans l&apos;app
                        </Button>
                    )}
                </div>

                {/* Meeting Info Card */}
                <Card className="shadow-md border-[var(--color-dark-100)]/20 bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8]">
                    <CardHeader className="bg-gradient-to-r from-[var(--color-dark-100)] to-[#007aa8] text-white">
                        <div className="flex items-start justify-between">
                            <div className="space-y-3">
                                <CardTitle className="text-2xl font-bold">{meeting.subject}</CardTitle>
                                <div className="flex flex-wrap gap-3 text-sm">
                                    <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-md">
                                        <Calendar className="h-4 w-4" />
                                        {startDate.toLocaleDateString("fr-FR", {
                                            day: "numeric",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </span>
                                    <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-md">
                                        <Clock className="h-4 w-4" />
                                        {startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                                        {endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                {meeting.isOnlineMeeting && (
                                    <Badge className="bg-[#4CAF50] text-white">Teams Meeting</Badge>
                                )}
                                {meeting.hasTranscript && (
                                    <Badge className="bg-amber-500 text-white">Transcription disponible</Badge>
                                )}
                                {meeting.inDatabase ? (
                                    <Badge className="bg-[#4CAF50] text-white">
                                        <Database className="h-3 w-3 mr-1" />
                                        En DB
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Pas en DB
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6 space-y-4">
                        {/* Organizer */}
                        <div className="flex items-center gap-3 text-white">
                            <User className="h-5 w-5" />
                            <div>
                                <p className="text-sm font-semibold">Organisateur</p>
                                <p className="text-sm opacity-90">
                                    {meeting.organizer.emailAddress.name || meeting.organizer.emailAddress.address}
                                </p>
                            </div>
                        </div>

                        {/* Join Link */}
                        {meeting.onlineMeeting?.joinUrl && (
                            <a
                                href={meeting.onlineMeeting.joinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-white hover:underline text-sm"
                            >
                                <Video className="h-4 w-4" />
                                Rejoindre la réunion Teams
                            </a>
                        )}
                    </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="attendees" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="attendees">
                            <Users className="h-4 w-4 mr-2" />
                            Participants ({meeting.attendees?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="transcripts">
                            <FileText className="h-4 w-4 mr-2" />
                            Transcriptions
                        </TabsTrigger>
                        <TabsTrigger value="details">
                            <Calendar className="h-4 w-4 mr-2" />
                            Détails
                        </TabsTrigger>
                    </TabsList>

                    {/* Participants Tab */}
                    <TabsContent value="attendees" className="space-y-4">
                        <Card className="shadow-md">
                            <CardHeader>
                                <CardTitle className="text-[var(--color-dark-100)]">Participants</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {meeting.attendees && meeting.attendees.length > 0 ? (
                                    <div className="space-y-3">
                                        {meeting.attendees.map((attendee, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div className="flex-1">
                                                    <p className="font-semibold text-[var(--color-dark-100)]">
                                                        {attendee.emailAddress.name || attendee.emailAddress.address}
                                                    </p>
                                                    <p className="text-sm text-gray-600">
                                                        {attendee.emailAddress.address}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Badge variant="outline">{attendee.type}</Badge>
                                                    <Badge
                                                        className={
                                                            attendee.status.response === "accepted"
                                                                ? "bg-[#4CAF50] text-white"
                                                                : attendee.status.response === "tentativelyAccepted"
                                                                    ? "bg-amber-500 text-white"
                                                                    : "bg-gray-200 text-gray-700"
                                                        }
                                                    >
                                                        {attendee.status.response}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-8">Aucun participant</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Transcripts Tab */}
                    <TabsContent value="transcripts" className="space-y-4">
                        <Card className="shadow-md">
                            <CardHeader>
                                <CardTitle className="text-[var(--color-dark-100)]">Transcriptions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {meeting.transcripts && meeting.transcripts.length > 0 ? (
                                    <div className="space-y-3">
                                        {meeting.transcripts.map((transcript, i) => (
                                            <div key={i} className="p-4 border rounded-lg">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-semibold text-[var(--color-dark-100)]">
                                                            Transcription #{i + 1}
                                                        </p>
                                                        <p className="text-sm text-gray-600">
                                                            ID: {transcript.id}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            Créée le:{" "}
                                                            {new Date(transcript.createdDateTime).toLocaleString(
                                                                "fr-FR"
                                                            )}
                                                        </p>
                                                    </div>
                                                    <CheckCircle2 className="h-6 w-6 text-[#4CAF50]" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                        <p className="text-gray-500">Aucune transcription disponible</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Details Tab */}
                    <TabsContent value="details" className="space-y-4">
                        <Card className="shadow-md">
                            <CardHeader>
                                <CardTitle className="text-[var(--color-dark-100)]">Détails techniques</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <p className="text-sm font-semibold text-gray-700">ID Graph</p>
                                    <p className="text-sm text-gray-600 font-mono">{meeting.id}</p>
                                </div>

                                {meeting.databaseId && (
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">ID en base de données</p>
                                        <p className="text-sm text-gray-600 font-mono">{meeting.databaseId}</p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-sm font-semibold text-gray-700">Provider</p>
                                    <p className="text-sm text-gray-600">{meeting.onlineMeetingProvider}</p>
                                </div>

                                {meeting.location?.displayName && (
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">Lieu</p>
                                        <p className="text-sm text-gray-600">{meeting.location.displayName}</p>
                                    </div>
                                )}

                                {meeting.body?.content && (
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700 mb-2">Description</p>
                                        <div
                                            className="text-sm text-gray-600 p-3 bg-gray-50 rounded-lg max-h-48 overflow-y-auto"
                                            dangerouslySetInnerHTML={{ __html: meeting.body.content }}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}