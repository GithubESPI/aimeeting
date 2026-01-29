// app/api/admin/check-meeting-in-db/route.ts
// API pour vérifier si une réunion Graph existe en DB avec transcription

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        // Vérifier l'authentification admin
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || session.user.email.toLowerCase() !== "a.vespuce@groupe-espi.fr") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const graphId = searchParams.get("graphId");

        if (!graphId) {
            return NextResponse.json({ error: "graphId requis" }, { status: 400 });
        }

        // Chercher la réunion en DB par son graphId
        const meeting = await prisma.meeting.findFirst({
            where: {
                graphId: graphId
            },
            select: {
                id: true,
                graphId: true,
                title: true,
                transcriptRaw: true,
                fullTranscript: true,
                summaryJson: true,
                status: true,
            }
        });

        if (!meeting) {
            return NextResponse.json({
                found: false,
                hasTranscript: false,
                meetingId: null
            });
        }

        // Vérifier si elle a une transcription
        const hasTranscript = !!(
            (meeting.transcriptRaw && Array.isArray(meeting.transcriptRaw) && meeting.transcriptRaw.length > 0) ||
            meeting.fullTranscript
        );

        const hasSummary = !!meeting.summaryJson;

        return NextResponse.json({
            found: true,
            hasTranscript,
            hasSummary,
            meetingId: meeting.id,
            status: meeting.status,
            title: meeting.title,
        });

    } catch (e: any) {
        console.error("❌ Erreur check-meeting-in-db:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur" }, { status: 500 });
    }
}