// app/api/meetings/[id]/route.ts
// ✅ Version avec logs de debug pour comprendre les problèmes d'accès

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { Prisma } from "@prisma/client";

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

        console.log(`\n🔍 [GET /api/meetings/${meetingId}]`);
        console.log(`   User: ${userEmail} (ID: ${userId})`);

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
            console.log(`   ❌ Meeting not found`);
            return NextResponse.json(
                { error: "Réunion non trouvée" },
                { status: 404 }
            );
        }

        console.log(`   ✅ Meeting found: "${meeting.title}"`);
        console.log(`   Organizer: ${meeting.organizerEmail}`);
        console.log(`   Has transcriptRaw: ${!!meeting.transcriptRaw}`);

        // Vérifier les permissions LECTURE (tous les participants)
        const isOwner = meeting.userId === userId;
        const isParticipant = meeting.attendees.some(
            (a) => a.participant.email?.toLowerCase() === userEmail
        );
        const participantsEmails = (meeting.participantsEmails as string[]) ?? [];
        const isInEmails = participantsEmails.some(
            (email) => email.toLowerCase() === userEmail
        );

        // 🔍 DEBUG: Log les vérifications d'accès
        console.log(`\n   📋 Access check:`);
        console.log(`   - isOwner: ${isOwner} (meeting.userId: ${meeting.userId})`);
        console.log(`   - isParticipant: ${isParticipant}`);
        console.log(`   - isInEmails: ${isInEmails}`);
        console.log(`   - participantsEmails (${participantsEmails.length}):`, participantsEmails);
        console.log(`   - attendees emails (${meeting.attendees.length}):`, meeting.attendees.map(a => a.participant.email));

        // ✅ LECTURE : Autoriser tous les participants (organisateur OU participant)
        if (!isOwner && !isParticipant && !isInEmails) {
            console.log(`\n   ❌ ACCESS DENIED for ${userEmail}`);
            return NextResponse.json(
                { error: "Accès non autorisé à cette réunion" },
                { status: 403 }
            );
        }

        console.log(`   ✅ ACCESS GRANTED for ${userEmail}`);

        // ✅ Déterminer si l'utilisateur est l'organisateur
        const userIsOrganizer = meeting.organizerEmail?.toLowerCase() === userEmail;
        console.log(`   📝 Is organizer: ${userIsOrganizer}\n`);

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

            // ✅ NOUVEAU : Indiquer si l'utilisateur est l'organisateur
            isOrganizer: userIsOrganizer,

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

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
        }

        const meetingId = params.id;
        const userId = (session.user as any).id;
        const userEmail = session.user.email?.toLowerCase();

        const body = await req.json().catch(() => ({}));
        const summaryJson = body?.summaryJson as Prisma.InputJsonValue | undefined;

        if (!summaryJson) {
            return NextResponse.json({ error: "summaryJson manquant" }, { status: 400 });
        }

        // ✅ Autorisation "test" : utilisateur connecté qui a accès à la réunion
        // (propriétaire OU participant via attendees.participant.email)
        const meeting = await prisma.meeting.findFirst({
            where: {
                id: meetingId,
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
            select: { id: true },
        });

        if (!meeting) {
            return NextResponse.json({ error: "Réunion introuvable ou accès refusé" }, { status: 404 });
        }

        const updated = await prisma.meeting.update({
            where: { id: meetingId },
            data: {
                summaryJson,
                updatedAt: new Date(),
            },
            select: { id: true, summaryJson: true },
        });

        return NextResponse.json({ ok: true, meeting: updated });
    } catch (e: any) {
        console.error("[API] PATCH /api/meetings/[id]/summary error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}