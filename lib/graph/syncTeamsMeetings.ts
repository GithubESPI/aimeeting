// lib/graph/syncTeamsMeetings.ts
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";
import { Client } from "@microsoft/microsoft-graph-client";
import {
    parseTeamsVttToSegments,
    type TranscriptSegment as ParsedSegment,
} from "./vtt-parser";
import { zonedTimeToUtc } from "date-fns-tz";




const DAYS_BACK = 365;

function getGraphClient(accessToken: string) {
    return Client.init({
        authProvider: (done) => done(null, accessToken),
    });
}

type TranscriptOrRecording = {
    value?: unknown[];
};

// -------------------------------------
// Helpers transcript / recording (/me)
// -------------------------------------

async function checkMeetingResource(
    meetingId: string,
    token: string,
    resourceType: "transcripts" | "recordings"
): Promise<boolean> {
    const apiVersion = resourceType === "transcripts" ? "beta" : "v1.0";
    const url = `https://graph.microsoft.com/${apiVersion}/me/onlineMeetings/${encodeURIComponent(
        meetingId
    )}/${resourceType}?$top=1`;

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        // 404 / 403 : on considère juste "pas de ressource", pas besoin de log
        if (res.status === 404 || res.status === 403) return false;
        if (!res.ok) return false;

        const data = (await res.json()) as TranscriptOrRecording;
        return Array.isArray(data.value) && data.value.length > 0;
    } catch {
        return false;
    }
}

async function hasTranscript(meetingId: string, token: string) {
    return checkMeetingResource(meetingId, token, "transcripts");
}
async function hasRecording(meetingId: string, token: string) {
    return checkMeetingResource(meetingId, token, "recordings");
}

async function fetchTranscriptJson(
    meetingId: string,
    token: string
): Promise<any | null> {
    const url = `https://graph.microsoft.com/beta/me/onlineMeetings/${encodeURIComponent(
        meetingId
    )}/transcripts?$top=1`;

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            // On ne log plus les 4xx "normaux" pour éviter le bruit
            if (process.env.NODE_ENV === "development" && res.status >= 500) {
                console.warn("[fetchTranscriptJson] status", res.status);
            }
            return null;
        }

        const data = (await res.json()) as TranscriptOrRecording;
        if (!Array.isArray(data.value) || data.value.length === 0) return null;

        return data.value[0];
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            console.warn("[fetchTranscriptJson] error", err);
        }
        return null;
    }
}

// -------------------------------------
// Pagination des events du calendrier
// -------------------------------------

async function listAllCalendarEventsForMe(
    client: Client,
    start: Date,
    now: Date
) {
    const all: any[] = [];

    let url =
        `/me/calendar/events` +
        `?$select=id,subject,start,end,organizer,attendees,onlineMeeting,onlineMeetingUrl,isOnlineMeeting` +
        `&$orderby=start/dateTime desc` +
        `&$filter=start/dateTime ge '${start.toISOString()}' and end/dateTime le '${now.toISOString()}'`;

    while (url) {
        const page = await client.api(url).get();
        if (Array.isArray(page.value)) {
            all.push(...page.value);
        }
        url = page["@odata.nextLink"] ?? null;
    }

    return all;
}

// -------------------------------------
// Fonction principale
// -------------------------------------

export async function syncTeamsMeetingsForSession(session: Session) {
    const accessToken = (session as any).accessToken as string | undefined;
    const email = session.user?.email;
    if (!accessToken || !email) return;

    const client = getGraphClient(accessToken);

    const now = new Date();
    const start = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

    // 🔁 On récupère TOUTES les réunions du calendrier (pas seulement 50)
    const events = await listAllCalendarEventsForMe(client, start, now);

    for (const event of events ?? []) {
        const isOnline =
            event.isOnlineMeeting ||
            !!event.onlineMeeting ||
            !!event.onlineMeetingUrl;

        if (!isOnline) continue;

        const graphId = event.id as string;
        const subject = event.subject || "Sans titre";

        const startDateTime = event.start?.dateTime
            ? zonedTimeToUtc(
                event.start.dateTime,
                event.start.timeZone || "Europe/Paris"
            )
            : null;

        const endDateTime = event.end?.dateTime
            ? zonedTimeToUtc(
                event.end.dateTime,
                event.end.timeZone || "Europe/Paris"
            )
            : null;


        const joinUrl =
            event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || null;

        const organizerEmail = event.organizer?.emailAddress?.address ?? null;

        let onlineMeetingId: string | null = null;

        // 1) Récupération de onlineMeetingId (possible seulement si tu es organisateur)
        if (joinUrl) {
            const escapedJoin = joinUrl.replace(/'/g, "''");

            try {
                const resMe = await client
                    .api("/me/onlineMeetings")
                    .version("beta")
                    .filter(`JoinWebUrl eq '${escapedJoin}'`)
                    .get();

                onlineMeetingId = resMe.value?.[0]?.id ?? null;
            } catch (err: any) {
                // 404 / 403 : cas fréquent (pas organisateur ou meeting expiré), on ne log plus
                if (
                    err?.statusCode !== 404 &&
                    err?.code !== "NotFound" &&
                    err?.statusCode !== 403 &&
                    err?.code !== "Forbidden"
                ) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[syncTeamsMeetings] erreur /me/onlineMeetings", err);
                    }
                }
            }
        }

        // ★ Si on n'a pas d'onlineMeetingId, on ne pourra pas tester transcript/recording
        if (!onlineMeetingId) {
            continue;
        }

        // 2) Transcript / recording + téléchargement VTT
        let hasT = false;
        let hasR = false;
        let transcriptJson: any | null = null;
        let transcriptVtt: string | null = null;
        let parsedSegments: ParsedSegment[] = [];

        if (onlineMeetingId) {
            [hasT, hasR] = await Promise.all([
                hasTranscript(onlineMeetingId, accessToken),
                hasRecording(onlineMeetingId, accessToken),
            ]);

            // ★ Obligatoire : transcription ET enregistrement
            if (!hasT || !hasR) {
                continue;
            }

            transcriptJson = await fetchTranscriptJson(onlineMeetingId, accessToken);

            // ★ Si on n'arrive pas à récupérer le JSON, on ne stocke pas non plus
            if (!transcriptJson) {
                continue;
            }

            const contentUrl =
                transcriptJson?.transcriptContentUrl ?? transcriptJson?.contentUrl;

            if (contentUrl) {
                try {
                    const vttRes = await fetch(contentUrl, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });

                    if (vttRes.ok) {
                        transcriptVtt = await vttRes.text();
                        parsedSegments = parseTeamsVttToSegments(transcriptVtt);
                    } else {
                        // On ne log plus les 400 ici pour éviter le spam
                        if (
                            process.env.NODE_ENV === "development" &&
                            vttRes.status >= 500
                        ) {
                            console.warn(
                                "[syncTeamsMeetings] erreur VTT status",
                                vttRes.status
                            );
                        }
                    }
                } catch (err) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[syncTeamsMeetings] erreur fetch VTT", err);
                    }
                }
            }
        }

        // 3) Sauvegarde Meeting
        // 3) Sauvegarde Meeting
        const dbMeeting = await prisma.meeting.upsert({
            where: { onlineMeetingId: onlineMeetingId! }, // <- clé réelle unique
            create: {
                graphId,
                title: subject,
                startDateTime,
                endDateTime,
                organizerEmail: organizerEmail ?? undefined,
                joinUrl: joinUrl ?? undefined,
                onlineMeetingId: onlineMeetingId!,          // on force non-null
                status: "created",

                transcriptRaw: transcriptJson
                    ? JSON.stringify(transcriptJson)
                    : undefined,
                transcript: transcriptVtt ?? undefined,
                transcriptSource: transcriptJson ? "graph" : null,
                hasGraphTranscript: !!transcriptJson,
                hasGraphRecording: hasR,
            },
            update: {
                graphId, // on garde le dernier graphId connu
                title: subject,
                startDateTime,
                endDateTime,
                organizerEmail: organizerEmail ?? undefined,
                joinUrl: joinUrl ?? undefined,
                onlineMeetingId: onlineMeetingId!, // reste aligné

                transcriptRaw: transcriptJson
                    ? JSON.stringify(transcriptJson)
                    : undefined,
                transcript: transcriptVtt ?? undefined,
                transcriptSource: transcriptJson ? "graph" : null,
                hasGraphTranscript: !!transcriptJson,
                hasGraphRecording: hasR,
            },
        });


        // 4) Segments
        if (parsedSegments.length && dbMeeting.id) {
            await prisma.transcriptSegment.deleteMany({
                where: { meetingId: dbMeeting.id },
            });

            await prisma.transcriptSegment.createMany({
                data: parsedSegments.map((seg) => ({
                    meetingId: dbMeeting.id,
                    diarizedSpeaker: seg.speaker ?? "",
                    startMs: seg.startMs,
                    endMs: seg.endMs,
                    text: seg.text,
                })),
            });
        }

        // 5) Participants (attendees + organisateur)
        const allAttendees = [
            ...(event.attendees ?? []),
            event.organizer ? [event.organizer] : [],
        ].flat();

        if (allAttendees.length) {
            for (const att of allAttendees) {
                const addr = att.emailAddress?.address;
                if (!addr) continue;

                const displayName = att.emailAddress?.name || addr;

                const participant = await prisma.participant.upsert({
                    where: { email: addr },
                    create: { email: addr, displayName },
                    update: { displayName },
                });

                await prisma.meetingParticipant.upsert({
                    where: {
                        meetingId_participantId: {
                            meetingId: dbMeeting.id,
                            participantId: participant.id,
                        },
                    },
                    create: {
                        meetingId: dbMeeting.id,
                        participantId: participant.id,
                        role: att.type ?? null,
                        responseStatus: att.status?.response ?? null,
                    },
                    update: {
                        role: att.type ?? null,
                        responseStatus: att.status?.response ?? null,
                    },
                });
            }
        }
    }
}
