// lib/graph/verifyMeetings.ts
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";
import { Client } from "@microsoft/microsoft-graph-client";

function getGraphClient(accessToken: string) {
    return Client.init({
        authProvider: (done) => done(null, accessToken),
    });
}

type GraphTranscriptList = {
    value?: { id: string; transcriptContentUrl?: string }[];
};

export async function verifyMeetingsTranscripts(session: Session) {
    const accessToken = (session as any).accessToken as string | undefined;
    if (!accessToken) {
        throw new Error("Pas de accessToken dans la session");
    }

    const client = getGraphClient(accessToken);

    // 1) On prend toutes les réunions qui ont un onlineMeetingId
    const meetings = await prisma.meeting.findMany({
        where: { onlineMeetingId: { not: null } },
        select: {
            id: true,
            title: true,
            onlineMeetingId: true,
            hasGraphTranscript: true,
        },
    });

    const results: {
        id: string;                        // ⬅️ AVANT: number
        title: string;
        onlineMeetingId: string;
        dbHasTranscript: boolean;
        graphHasTranscript: boolean;
    }[] = [];

    for (const m of meetings) {
        if (!m.onlineMeetingId) continue;

        try {
            const list = (await client
                .api(
                    `/users/{userId}/onlineMeetings/${encodeURIComponent(
                        m.onlineMeetingId
                    )}/transcripts`
                )
                .version("beta")
                .select(["id", "transcriptContentUrl"])
                .get()) as GraphTranscriptList;

            const graphHas = Array.isArray(list.value) && list.value.length > 0;

            results.push({
                id: m.id,
                title: m.title,
                onlineMeetingId: m.onlineMeetingId,
                dbHasTranscript: m.hasGraphTranscript,
                graphHasTranscript: graphHas,
            });
        } catch (e) {
            console.warn("[verifyMeetingsTranscripts] erreur Graph", m.title, e);
            results.push({
                id: m.id,
                title: m.title,
                onlineMeetingId: m.onlineMeetingId,
                dbHasTranscript: m.hasGraphTranscript,
                graphHasTranscript: false,
            });
        }
    }

    return results;
}
