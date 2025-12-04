import "server-only";
import { prisma } from "@/lib/prisma";
import { parseTeamsVttToSegments } from "@/lib/graph/vtt-parser";

/**
 * Récupère la transcription Teams (VTT) en mode admin (client_credentials)
 * puis parse en segments et les stocke dans Prisma.
 */
export async function importMeetingTranscriptAdmin(
    appToken: string,
    organizerEmail: string,
    onlineMeetingId: string,
    meetingId: string
) {
    if (!organizerEmail || !onlineMeetingId) return null;

    const baseUserPath = `/users/${encodeURIComponent(organizerEmail)}`;

    try {
        // 1) Récupérer la liste des transcripts
        const listUrl =
            `https://graph.microsoft.com/beta${baseUserPath}` +
            `/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts?$top=1`;

        const listRes = await fetch(listUrl, {
            headers: {
                Authorization: `Bearer ${appToken}`,
                Accept: "application/json",
            },
        });

        if (!listRes.ok) {
            console.warn(
                "[ADMIN] Erreur list transcripts",
                listRes.status,
                await listRes.text()
            );
            return null;
        }

        const listJson = await listRes.json();
        const transcriptId = listJson.value?.[0]?.id;

        if (!transcriptId) {
            console.warn("[ADMIN] Aucun transcript pour", onlineMeetingId);
            return null;
        }

        // 2) Télécharger la transcription en format VTT
        const contentUrl =
            `https://graph.microsoft.com/beta${baseUserPath}` +
            `/onlineMeetings/${encodeURIComponent(onlineMeetingId)}` +
            `/transcripts/${encodeURIComponent(transcriptId)}/content?format=text/vtt`;

        const contentRes = await fetch(contentUrl, {
            headers: {
                Authorization: `Bearer ${appToken}`,
                Accept: "text/vtt",
            },
        });

        if (!contentRes.ok) {
            console.warn(
                "[ADMIN] Erreur /content",
                contentRes.status,
                await contentRes.text()
            );
            return null;
        }

        const vtt = (await contentRes.text())?.trim();
        if (!vtt) return null;

        // 3) Parsing → segments (speaker + timestamps + texte)
        const segments = parseTeamsVttToSegments(vtt);

        if (!segments.length) {
            console.warn("[ADMIN] Aucun segment parsé");
            return null;
        }

        // 4) Écriture en base (table TranscriptSegment)
        for (const s of segments) {
            await prisma.transcriptSegment.create({
                data: {
                    meetingId,
                    diarizedSpeaker: s.speaker ?? "Inconnu",
                    startMs: s.startMs,
                    endMs: s.endMs,
                    text: s.text,
                },
            });
        }

        console.log(
            `[ADMIN] Import transcription OK : ${segments.length} segments enregistrés`
        );

        return segments;
    } catch (e) {
        console.error("[ADMIN] Exception:", e);
        return null;
    }
}
