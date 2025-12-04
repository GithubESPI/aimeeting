// lib/graph/transcripts.ts
import { Client } from "@microsoft/microsoft-graph-client";
import type { Session } from "next-auth";
import { getGraphAppClient } from "@/lib/graph/appClient";
import { prisma } from "@/lib/prisma";

type GraphTranscriptItem = {
    id: string;
    transcriptContentUrl?: string;
};

type GraphTranscriptList = {
    value?: GraphTranscriptItem[];
};

// Type minimal de Meeting utilisé ici (on ne dépend plus de @prisma/client)
type MeetingEntity = {
    id: string;
    fullTranscript: string | null;
    transcriptRaw: string | null;
    onlineMeetingId?: string | null;
    organizerEmail?: string | null;
};

/**
 * Garantit qu'on a un fullTranscript en BDD (sinon le récupère et le sauvegarde).
 */
export async function ensureFullTranscript(
    meeting: MeetingEntity,
    session: Session
): Promise<string | null> {
    // 1) Déjà présent en BDD ?
    if (
        typeof meeting.fullTranscript === "string" &&
        meeting.fullTranscript.trim()
    ) {
        return meeting.fullTranscript;
    }

    let text: string | null = null;
    const userEmail = session.user?.email?.toLowerCase() ?? "";
    const isOrganizer = meeting.organizerEmail?.toLowerCase() === userEmail;

    // 2) Essayer via onlineMeetingId (Graph)
    if (meeting.onlineMeetingId) {
        try {
            if (isOrganizer) {
                const token = (session as any).accessToken as string | undefined;
                if (token) {
                    text = await fetchTeamsTranscriptText(token, meeting.onlineMeetingId);
                }
            } else if (meeting.organizerEmail) {
                const appClient = await getGraphAppClient();
                text = await fetchTeamsTranscriptTextAsApp(
                    appClient,
                    meeting.organizerEmail,
                    meeting.onlineMeetingId
                );
            }
        } catch (e) {
            console.error("[ensureFullTranscript] erreur via onlineMeetingId:", e);
        }
    }

    // 3) Fallback : utiliser transcriptRaw (JSON avec transcriptContentUrl)
    if (!text && typeof meeting.transcriptRaw === "string") {
        try {
            const raw = JSON.parse(meeting.transcriptRaw);
            const contentUrl =
                raw.transcriptContentUrl ||
                raw.transcriptRaw?.contentUrl ||
                raw.transcriptContent?.contentUrl;

            if (contentUrl) {
                const token = (session as any).accessToken as string | undefined;
                if (token) {
                    const res = await fetch(contentUrl, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                        throw new Error(
                            `Graph contentUrl failed: ${res.status} ${res.statusText}`
                        );
                    }
                    text = await res.text();
                }
            }
        } catch (e) {
            console.error("[ensureFullTranscript] erreur via transcriptRaw:", e);
        }
    }

    // 4) Sauvegarde en BDD si on a trouvé un texte
    if (text) {
        await prisma.meeting.update({
            where: { id: meeting.id },
            data: { fullTranscript: text },
        });
        return text;
    }

    return null;
}

/**
 * Nettoie un fichier WebVTT Teams pour ne garder que le texte.
 */
function cleanWebVtt(raw: string): string {
    return raw
        .split(/\r?\n/)
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            if (trimmed === "WEBVTT") return false;
            if (trimmed.startsWith("NOTE")) return false;
            if (trimmed.startsWith("X-TIMESTAMP-MAP")) return false;
            // Numéro de bloc
            if (/^\d+$/.test(trimmed)) return false;
            // Ligne de timecodes 00:00:01.000 --> 00:00:05.000
            if (
                /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed)
            ) {
                return false;
            }
            return true;
        })
        .join("\n");
}

/**
 * Version "user" : on utilise le token du user connecté (/me).
 */
export async function fetchTeamsTranscriptText(
    userAccessToken: string,
    onlineMeetingId: string
): Promise<string | null> {
    const client = Client.init({
        authProvider: (done) => done(null, userAccessToken),
    });

    // 1) lister les transcripts pour ce meeting
    const list = (await client
        .api(
            `/me/onlineMeetings/${encodeURIComponent(
                onlineMeetingId
            )}/transcripts`
        )
        .version("beta")
        .select(["id", "transcriptContentUrl"])
        .get()) as GraphTranscriptList;

    const item = list.value?.[0];
    if (!item?.transcriptContentUrl) {
        console.warn("[fetchTeamsTranscriptText] aucun transcriptContentUrl");
        return null;
    }

    // 2) télécharger le contenu WebVTT
    const res = await fetch(item.transcriptContentUrl, {
        headers: {
            Authorization: `Bearer ${userAccessToken}`,
        },
    });

    if (!res.ok) {
        const body = await res.text();
        console.error(
            "[fetchTeamsTranscriptText] erreur contenu transcript",
            res.status,
            body
        );
        return null;
    }

    const rawVtt = await res.text();

    // 3) nettoyage pour ne garder que le texte
    return cleanWebVtt(rawVtt);
}

/**
 * Version "app" (client credentials).
 */
export async function fetchTeamsTranscriptTextAsApp(
    appClient: Client,
    organizerEmail: string,
    onlineMeetingId: string
): Promise<string | null> {
    const list = (await appClient
        .api(
            `/users/${encodeURIComponent(
                organizerEmail
            )}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts`
        )
        .version("beta")
        .select(["id", "transcriptContentUrl"])
        .get()) as GraphTranscriptList;

    const item = list.value?.[0];
    if (!item?.transcriptContentUrl) {
        console.warn("[fetchTeamsTranscriptTextAsApp] aucun transcriptContentUrl");
        return null;
    }

    // Récupérer le token app utilisé par appClient (selon getGraphAppClient)
    const authProvider: any = (appClient as any).config?.authProvider;
    let appToken: string | null = null;
    if (authProvider) {
        await new Promise<void>((resolve, reject) => {
            authProvider((err: any, token?: string) => {
                if (err) return reject(err);
                appToken = token ?? null;
                resolve();
            });
        });
    }

    if (!appToken) {
        console.error("[fetchTeamsTranscriptTextAsApp] pas de token app");
        return null;
    }

    const res = await fetch(item.transcriptContentUrl, {
        headers: {
            Authorization: `Bearer ${appToken}`,
        },
    });

    if (!res.ok) {
        const body = await res.text();
        console.error(
            "[fetchTeamsTranscriptTextAsApp] erreur contenu transcript",
            res.status,
            body
        );
        return null;
    }

    const rawVtt = await res.text();
    return cleanWebVtt(rawVtt);
}
