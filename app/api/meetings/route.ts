// app/api/meetings/route.ts
// ✅ Version corrigée avec les bons types TypeScript et syntaxe Prisma

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

        const { searchParams } = new URL(req.url);
        const statusFilter = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") ?? "100", 10);
        const withSummary = searchParams.get("withSummary") === "true";

        // ✅ Construction du where clause
        const whereClause: Prisma.MeetingWhereInput = {
            OR: [
                // Propriétaire
                { userId },
                // Participant via la table de liaison
                {
                    attendees: {
                        some: {
                            participant: {
                                email: userEmail,
                            },
                        },
                    },
                },
            ],
        };

        // Filtres optionnels
        if (statusFilter) {
            whereClause.status = statusFilter as any;
        }

        if (withSummary) {
            whereClause.summaryJson = { not: Prisma.DbNull };
        }

        // ✅ Récupérer les réunions
        const meetings = await prisma.meeting.findMany({
            where: whereClause,
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
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 1,
                },
            },
            orderBy: {
                startDateTime: "desc",
            },
            take: limit,
        });

        // ✅ Formater les données pour le frontend
        const formattedMeetings = meetings.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            startDateTime: m.startDateTime?.toISOString() ?? null,
            endDateTime: m.endDateTime?.toISOString() ?? null,
            organizerEmail: m.organizerEmail,
            joinUrl: m.joinUrl,

            // Indicateurs
            hasSummary: m.summaryJson !== null,
            hasTranscript: m.transcript !== null || m.fullTranscript !== null,
            hasGraphTranscript: m.hasGraphTranscript,
            hasGraphRecording: m.hasGraphRecording,

            // Participants
            participantsEmails: (m.participantsEmails as any) ?? null,
            attendeesCount: m.attendees.length,
            attendees: m.attendees.map((a) => ({
                id: a.id,
                role: a.role,
                present: a.present,
                responseStatus: a.responseStatus,
                participant: {
                    id: a.participant.id,
                    displayName: a.participant.displayName,
                    email: a.participant.email,
                },
            })),

            // Métadonnées
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            lastEmailSentAt: m.lastEmailSentAt?.toISOString() ?? null,
            lastPdfGeneratedAt: m.lastPdfGeneratedAt?.toISOString() ?? null,

            // Dernier email envoyé
            lastEmailLog: m.emailLogs[0] ?? null,
        }));

        return NextResponse.json({
            user: {
                id: userId,
                email: userEmail,
                name: session.user.name,
            },
            count: formattedMeetings.length,
            meetings: formattedMeetings,
        });
    } catch (e: any) {
        console.error("[API] /api/meetings error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}