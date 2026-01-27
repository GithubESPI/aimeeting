// app/api/meetings/[id]/route.ts
// ✅ Version corrigée qui retourne transcriptRaw, graphId, onlineMeetingId, etc.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { error: "Non authentifié" },
                { status: 401 }
            );
        }

        const userId = (session.user as any).id;
        const userEmail = session.user.email?.toLowerCase();
        const meetingId = params.id;

        // Récupérer la réunion avec tous les champs nécessaires
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            include: {
                attendees: {
                    include: {
                        participant: {
                            select: {
                                id: true,
                                displayName: true,
                                email: true,
                            },
                        },
                    },
                },
                emailLogs: {
                    select: {
                        id: true,
                        status: true,
                        to: true,
                        subject: true,
                        error: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
        });

        if (!meeting) {
            return NextResponse.json(
                { error: "Réunion non trouvée" },
                { status: 404 }
            );
        }

        // Vérifier les permissions
        const isOwner = meeting.userId === userId;
        const isParticipant = meeting.attendees.some(
            (a) => a.participant.email?.toLowerCase() === userEmail
        );
        const participantsEmails = (meeting.participantsEmails as string[]) ?? [];
        const isInEmails = participantsEmails.some(
            (email) => email.toLowerCase() === userEmail
        );

        if (!isOwner && !isParticipant && !isInEmails) {
            return NextResponse.json(
                { error: "Accès non autorisé à cette réunion" },
                { status: 403 }
            );
        }

        // ✅ Formater la réponse avec TOUS les champs nécessaires
        const formattedMeeting = {
            id: meeting.id,
            title: meeting.title,
            status: meeting.status,
            startDateTime: meeting.startDateTime?.toISOString() ?? null,
            endDateTime: meeting.endDateTime?.toISOString() ?? null,
            organizerEmail: meeting.organizerEmail,
            joinUrl: meeting.joinUrl,

            // ✅ Champs critiques pour la transcription et la synthèse
            graphId: meeting.graphId,
            onlineMeetingId: meeting.onlineMeetingId,
            transcriptRaw: meeting.transcriptRaw, // ✅ IMPORTANT
            fullTranscript: meeting.fullTranscript,

            // Synthèse et métadonnées
            summaryJson: meeting.summaryJson,
            participantsEmails: participantsEmails,

            // Participants
            attendees: meeting.attendees.map((a) => ({
                id: a.id,
                role: a.role,
                present: a.present,
                responseStatus: a.responseStatus,
                participant: a.participant,
            })),

            // Logs d'email
            emailLogs: meeting.emailLogs.map((log) => ({
                id: log.id,
                status: log.status,
                to: log.to as string[],
                subject: log.subject,
                error: log.error,
                createdAt: log.createdAt.toISOString(),
            })),

            // Métadonnées
            createdAt: meeting.createdAt.toISOString(),
            updatedAt: meeting.updatedAt.toISOString(),
            lastEmailSentAt: meeting.lastEmailSentAt?.toISOString() ?? null,
            lastPdfGeneratedAt: meeting.lastPdfGeneratedAt?.toISOString() ?? null,
        };

        return NextResponse.json({
            meeting: formattedMeeting,
        });
    } catch (e: any) {
        console.error("[API] /api/meetings/[id] error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}