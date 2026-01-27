// app/api/dashboard/meetings/route.ts
// ✅ API qui récupère les réunions depuis Prisma avec SUMMARY_READY

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

        // ✅ Récupérer les réunions avec SUMMARY_READY
        const meetings = await prisma.meeting.findMany({
            where: {
                AND: [
                    {
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
                    },
                    // ✅ UNIQUEMENT les réunions avec synthèse
                    {
                        status: "SUMMARY_READY",
                    },
                ],
            },
            include: {
                attendees: {
                    include: {
                        participant: {
                            select: {
                                email: true,
                                displayName: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 50,
        });

        // ✅ Formater au format attendu par le frontend
        const formattedMeetings = meetings.map((m) => {
            const organizer = m.attendees.find(a => a.role === "organizer")?.participant;
            const isOrganizer = m.attendees.some(a =>
                a.role === "organizer" && a.participant.email?.toLowerCase() === userEmail
            );

            return {
                id: m.id, // ✅ ID Prisma pour la redirection
                eventId: m.graphId || m.id, // Utiliser graphId ou id comme fallback
                subject: m.title,
                start: m.startDateTime?.toISOString() ?? null,
                end: m.endDateTime?.toISOString() ?? null,
                joinUrl: m.joinUrl,
                organizer: {
                    name: organizer?.displayName ?? null,
                    address: organizer?.email ?? m.organizerEmail ?? null,
                },
                role: isOrganizer ? "organisateur" : "participant",
                attendeesCount: m.attendees.length,
                transcripts: m.hasGraphTranscript ? [{ id: "1" }] : [], // Simuler pour compatibilité
            };
        });

        // ✅ Calculer les stats globales
        const totalMeetings = await prisma.meeting.count({
            where: {
                OR: [
                    { userId },
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
            },
        });

        const withSummary = meetings.length;
        const withTranscript = await prisma.meeting.count({
            where: {
                AND: [
                    {
                        OR: [
                            { userId },
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
                    },
                    {
                        hasGraphTranscript: true,
                    },
                ],
            },
        });

        return NextResponse.json({
            user: {
                displayName: session.user.name ?? "Utilisateur",
            },
            meetings: formattedMeetings,
            stats: {
                total: totalMeetings,
                withSummary,
                withTranscript,
                asOrganizer: formattedMeetings.filter(m => m.role === "organisateur").length,
            },
        });
    } catch (e: any) {
        console.error("[API] /api/dashboard/meetings error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}