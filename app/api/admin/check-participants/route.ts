// app/api/admin/check-participants/route.ts
// 🔍 Endpoint temporaire pour diagnostiquer les problèmes de transcription

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || session.user.email.toLowerCase() !== "a.vespuce@groupe-espi.fr") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const meetingTitle = searchParams.get("title") || "test";
        const userEmail = searchParams.get("email");

        console.log(`\n🔍 [Admin] Vérification des participants pour "${meetingTitle}"`);

        // Étape 1 : Trouver les réunions correspondantes
        const meetings = await prisma.meeting.findMany({
            where: {
                title: {
                    contains: meetingTitle,
                    mode: 'insensitive'
                }
            },
            select: {
                id: true,
                title: true,
                organizerEmail: true,
                participantsEmails: true,
                transcriptRaw: true,
                status: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 5
        });

        console.log(`📊 Trouvé ${meetings.length} réunion(s)`);

        const results = [];

        for (const meeting of meetings) {
            console.log(`\n📅 Réunion: "${meeting.title}" (ID: ${meeting.id})`);

            // Étape 2 : Récupérer les participants de MeetingParticipant
            const participants = await prisma.meetingParticipant.findMany({
                where: {
                    meetingId: meeting.id
                },
                include: {
                    participant: {
                        select: {
                            email: true,
                            displayName: true
                        }
                    }
                }
            });

            console.log(`👥 ${participants.length} participant(s) dans MeetingParticipant`);

            const participantsList = participants.map(mp => ({
                email: mp.participant.email,
                displayName: mp.participant.displayName,
                role: mp.role,
                responseStatus: mp.responseStatus,
                present: mp.present
            }));

            const participantsEmails = (meeting.participantsEmails as string[]) || [];
            const hasTranscriptRaw = !!meeting.transcriptRaw;

            console.log(`📧 participantsEmails (${participantsEmails.length}):`, participantsEmails);
            console.log(`📝 hasTranscriptRaw: ${hasTranscriptRaw}`);

            // Vérifier si un utilisateur spécifique est dans les participants
            let userCheck = null;
            if (userEmail) {
                const normalizedUserEmail = userEmail.toLowerCase();

                const isInMeetingParticipant = participants.some(
                    mp => mp.participant.email?.toLowerCase() === normalizedUserEmail
                );

                const isInParticipantsEmails = participantsEmails.some(
                    email => email.toLowerCase() === normalizedUserEmail
                );

                userCheck = {
                    email: userEmail,
                    isInMeetingParticipant,
                    isInParticipantsEmails,
                    shouldHaveAccess: isInMeetingParticipant || isInParticipantsEmails
                };

                console.log(`\n🔍 Vérification pour ${userEmail}:`);
                console.log(`   - Dans MeetingParticipant: ${isInMeetingParticipant}`);
                console.log(`   - Dans participantsEmails: ${isInParticipantsEmails}`);
                console.log(`   - Devrait avoir accès: ${userCheck.shouldHaveAccess}`);
            }

            results.push({
                meetingId: meeting.id,
                title: meeting.title,
                organizerEmail: meeting.organizerEmail,
                status: meeting.status,
                hasTranscriptRaw,
                createdAt: meeting.createdAt,
                participantsEmails,
                participantsInDB: participantsList,
                userCheck
            });
        }

        // Étape 4 : Si un email est spécifié, vérifier toutes ses participations
        let userAllMeetings = null;
        if (userEmail) {
            const normalizedUserEmail = userEmail.toLowerCase();

            const participant = await prisma.participant.findFirst({
                where: {
                    email: {
                        equals: normalizedUserEmail,
                        mode: 'insensitive'
                    }
                },
                include: {
                    meetings: {
                        select: {
                            role: true,
                            meetingId: true,
                            meeting: {
                                select: {
                                    title: true,
                                    createdAt: true
                                }
                            }
                        }
                    }
                }
            });

            if (participant) {
                userAllMeetings = {
                    email: participant.email,
                    displayName: participant.displayName,
                    totalMeetings: participant.meetings.length,
                    meetings: participant.meetings.map(m => ({
                        meetingId: m.meetingId,
                        title: m.meeting.title,
                        role: m.role,
                        createdAt: m.meeting.createdAt
                    }))
                };

                console.log(`\n📊 ${userEmail} participe à ${participant.meetings.length} réunion(s) en DB`);
            } else {
                console.log(`\n❌ ${userEmail} n'existe pas dans la table Participant`);
            }
        }

        return NextResponse.json({
            query: {
                title: meetingTitle,
                userEmail: userEmail || null
            },
            meetingsFound: results.length,
            meetings: results,
            userAllMeetings
        });

    } catch (e: any) {
        console.error("❌ Erreur:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur" }, { status: 500 });
    }
}