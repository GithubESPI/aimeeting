// lib/graph/syncAdminMeetings.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { getAppGraphToken } from "./appToken";

function escapeOData(value: string): string {
    return value.replace(/'/g, "''");
}

type OnlineMeetingList = {
    value?: { id?: string; joinWebUrl?: string | null }[];
};

type ResourceList = {
    value?: unknown[];
};

/**
 * Check via Graph (token app) si la réunion possède au moins
 * une transcription et/ou un enregistrement.
 */
async function checkResourcesApp(
    appToken: string,
    organizerEmail: string,
    onlineMeetingId: string
): Promise<{ hasTranscript: boolean; hasRecording: boolean }> {
    const baseUserPath = `/users/${encodeURIComponent(organizerEmail)}`;

    // transcripts (beta)
    const transcriptUrl =
        `https://graph.microsoft.com/beta${baseUserPath}` +
        `/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts?$top=1`;

    // recordings (v1.0)
    const recordingUrl =
        `https://graph.microsoft.com/v1.0${baseUserPath}` +
        `/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/recordings?$top=1`;

    const [tRes, rRes] = await Promise.all([
        fetch(transcriptUrl, {
            headers: { Authorization: `Bearer ${appToken}` },
        }),
        fetch(recordingUrl, {
            headers: { Authorization: `Bearer ${appToken}` },
        }),
    ]);

    let hasTranscript = false;
    let hasRecording = false;

    if (tRes.ok) {
        const tJson = (await tRes.json()) as ResourceList;
        hasTranscript = Array.isArray(tJson.value) && tJson.value.length > 0;
    }

    if (rRes.ok) {
        const rJson = (await rRes.json()) as ResourceList;
        hasRecording = Array.isArray(rJson.value) && rJson.value.length > 0;
    }

    return { hasTranscript, hasRecording };
}

/**
 * Tente de récupérer l'onlineMeetingId pour une réunion donnée
 * en utilisant l'email de l'organisateur et le joinUrl.
 */
async function ensureOnlineMeetingIdApp(
    appToken: string,
    organizerEmail: string | null,
    joinUrl: string | null,
    existingOnlineMeetingId: string | null
): Promise<string | null> {
    if (existingOnlineMeetingId) return existingOnlineMeetingId;
    if (!organizerEmail || !joinUrl) return null;

    const filter = `joinWebUrl eq '${escapeOData(joinUrl)}'`;
    const url =
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
            organizerEmail
        )}/onlineMeetings?$filter=${encodeURIComponent(filter)}&$top=1`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${appToken}` },
    });

    if (!res.ok) {
        console.warn(
            "[syncAdminMeetings] Impossible de récupérer onlineMeetingId (app) pour",
            joinUrl,
            res.status,
            await res.text()
        );
        return null;
    }

    const json = (await res.json()) as OnlineMeetingList;
    const id = json.value?.[0]?.id ?? null;
    return id;
}

/**
 * Parcourt les réunions existantes dans Prisma et les enrichit
 * avec :
 *  - onlineMeetingId (via token Application)
 *  - hasGraphTranscript / hasGraphRecording
 *  - transcriptRaw (optionnel)
 *
 * Ne s’exécute que côté serveur et avec un token app.
 */
export async function syncAdminMeetings() {
    const appToken = await getAppGraphToken();

    // On cible les réunions pour lesquelles on n'a pas encore les infos
    const meetings = await prisma.meeting.findMany({
        where: {
            // uniquement celles qui ont un joinUrl + organizerEmail
            joinUrl: { not: null },
            organizerEmail: { not: null },
            // et où au moins un des flags n'est pas encore vrai
            OR: [
                { hasGraphTranscript: false },
                { hasGraphRecording: false },
                { onlineMeetingId: null },
            ],
        },
        select: {
            id: true,
            graphId: true,
            joinUrl: true,
            organizerEmail: true,
            onlineMeetingId: true,
        },
        take: 200, // pour éviter de tout traiter d'un coup
    });

    let updated = 0;

    for (const m of meetings) {
        const organizerEmail = m.organizerEmail!;
        const joinUrl = m.joinUrl;

        // 1) S'assurer qu'on a un onlineMeetingId
        const onlineMeetingId = await ensureOnlineMeetingIdApp(
            appToken,
            organizerEmail,
            joinUrl,
            m.onlineMeetingId
        );

        if (!onlineMeetingId) {
            continue;
        }

        // 2) Vérifier transcript / recording
        const { hasTranscript, hasRecording } = await checkResourcesApp(
            appToken,
            organizerEmail,
            onlineMeetingId
        );

        // 3) Optionnel : on peut déjà stocker l’ID + flags
        await prisma.meeting.update({
            where: { id: m.id },
            data: {
                onlineMeetingId,
                hasGraphTranscript: hasTranscript,
                hasGraphRecording: hasRecording,
                // transcriptSource sera mis à jour lors de la première synthèse
            },
        });

        updated++;
    }

    return { total: meetings.length, updated };
}
