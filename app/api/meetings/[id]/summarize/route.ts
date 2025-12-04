// app/api/meetings/[id]/summarize/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { summarizeTranscript } from "@/lib/summarize-meeting";

// Pour éviter plusieurs synthèses simultanées
const activeSummaries = new Set<string>();

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    // 🔹 IMPORTANT : on attend la Promise pour récupérer l'id
    const { id } = await context.params;
    const meetingId = id;

    // 0) Vérif session
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Anti double-clic : une seule synthèse à la fois pour ce meeting
    if (activeSummaries.has(meetingId)) {
        return NextResponse.json(
            { error: "Synthèse déjà en cours pour cette réunion" },
            { status: 429 }
        );
    }

    activeSummaries.add(meetingId);

    try {
        // 2) On récupère la réunion
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }

        // 3) On vérifie qu'on a bien un fullTranscript
        const fullTranscript = meeting.fullTranscript;
        if (!fullTranscript || !fullTranscript.trim()) {
            return NextResponse.json(
                { error: "Pas de transcription complète disponible" },
                { status: 400 }
            );
        }

        // 4) Appel OpenAI via notre helper (qui fait aussi le post-processing)
        const summaryJson = await summarizeTranscript(fullTranscript, {
            title: meeting.title || "Réunion sans titre",
            // tu peux ajuster ces valeurs si tu veux
            minWords: 1200,
            maxWords: 1800,
        });

        // 5) Sauvegarde en BDD
        await prisma.meeting.update({
            where: { id: meetingId },
            data: {
                summaryJson,
                status: "summarized",
            },
        });

        return NextResponse.json({ ok: true, summary: summaryJson });
    } catch (err) {
        console.error("[summarize] erreur :", err);
        return NextResponse.json(
            { error: "Erreur lors de la génération de la synthèse" },
            { status: 500 }
        );
    } finally {
        activeSummaries.delete(meetingId);
    }
}
