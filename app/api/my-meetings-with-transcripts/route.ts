// app/api/my-meetings-with-transcripts/route.ts
// VERSION CORRIGÉE FINALE - Sans filtres, récupération directe

import { NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";
import { getDelegatedAccessToken } from "@/lib/auth/getDelegatedToken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CleanPerson = { name: string | null; address: string | null };

function normEmail(s: string | null | undefined) {
    const v = (s ?? "").trim().toLowerCase();
    return v || null;
}

async function upsertMeetingAndParticipants(args: {
    eventId: string;
    subject: string | null;
    joinUrl: string | null;
    startIso: string | null;
    endIso: string | null;
    organizer: CleanPerson;
    attendees: CleanPerson[];
    participantsEmails: string[];
    transcripts: any[];
    hasGraphTranscript: boolean;
    hasGraphRecording: boolean;
    transcriptSource: string | null;
    onlineMeetingId: string | null;
}) {
    const {
        eventId,
        subject,
        joinUrl,
        startIso,
        endIso,
        organizer,
        attendees,
        participantsEmails,
        transcripts,
        hasGraphTranscript,
        hasGraphRecording,
        transcriptSource,
        onlineMeetingId,
    } = args;

    // 1) Upsert Meeting
    const meeting = await prisma.meeting.upsert({
        where: { graphId: eventId },
        create: {
            title: subject ?? "Réunion",
            status: "CREATED",
            joinUrl,
            startDateTime: startIso ? new Date(startIso) : null,
            endDateTime: endIso ? new Date(endIso) : null,
            organizerEmail: normEmail(organizer.address),
            graphId: eventId,
            onlineMeetingId,
            transcriptSource: transcriptSource ?? "graph",
            hasGraphTranscript,
            hasGraphRecording,
            // si ton schema a bien ce champ :
            participantsEmails,
            // optionnel : stocker la liste brute des transcripts
            transcriptRaw: transcripts as any,
        },
        update: {
            title: subject ?? "Réunion",
            joinUrl,
            startDateTime: startIso ? new Date(startIso) : null,
            endDateTime: endIso ? new Date(endIso) : null,
            organizerEmail: normEmail(organizer.address),
            onlineMeetingId,
            transcriptSource: transcriptSource ?? "graph",
            hasGraphTranscript,
            hasGraphRecording,
            participantsEmails,
            transcriptRaw: transcripts as any,
        },
        select: { id: true },
    });

    // 2) Liste de personnes à persister (organizer + attendees)
    const people: Array<{ email: string; displayName: string; role: string; responseStatus?: string | null }> = [];

    const orgEmail = normEmail(organizer.address);
    if (orgEmail) {
        people.push({
            email: orgEmail,
            displayName: organizer.name ?? orgEmail,
            role: "organizer",
            responseStatus: "accepted",
        });
    }

    for (const a of attendees) {
        const email = normEmail(a.address);
        if (!email) continue;
        people.push({
            email,
            displayName: a.name ?? email,
            role: "attendee",
            responseStatus: null,
        });
    }

    // dédoublonnage email
    const uniq = new Map<string, (typeof people)[number]>();
    for (const p of people) if (!uniq.has(p.email)) uniq.set(p.email, p);

    // 3) Upsert Participants + MeetingParticipant
    for (const p of uniq.values()) {
        const participant = await prisma.participant.upsert({
            where: { email: p.email },
            create: { email: p.email, displayName: p.displayName },
            update: { displayName: p.displayName },
            select: { id: true },
        });

        await prisma.meetingParticipant.upsert({
            where: {
                meetingId_participantId: {
                    meetingId: meeting.id,
                    participantId: participant.id,
                },
            },
            create: {
                meetingId: meeting.id,
                participantId: participant.id,
                role: p.role,
                responseStatus: p.responseStatus ?? undefined,
                present: true,
            },
            update: {
                role: p.role,
                responseStatus: p.responseStatus ?? undefined,
                present: true,
            },
            select: { id: true },
        });
    }

    return meeting.id;
}


function graphClient(token: string) {
    return Client.init({ authProvider: (done) => done(null, token) });
}

function isTeamsMeeting(e: any): boolean {
    if (e?.isOnlineMeeting) return true;
    if (e?.onlineMeetingUrl) return true;
    if (e?.onlineMeeting?.joinUrl) return true;
    if ((e?.onlineMeetingProvider ?? "").toLowerCase().includes("teams")) return true;
    if ((e?.webLink ?? "").includes("teams.microsoft.com")) return true;
    return false;
}

async function getAppAccessToken() {
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error("Missing env vars");
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "client_credentials");
    body.set("scope", "https://graph.microsoft.com/.default");

    const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
    });

    if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`APP_TOKEN_FAILED HTTP ${res.status} — ${err}`);
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("APP_TOKEN_MISSING_ACCESS_TOKEN");
    return json.access_token;
}

function toGraphRelative(nextLink: string) {
    try {
        if (nextLink.startsWith("http")) {
            const u = new URL(nextLink);
            return u.pathname + u.search;
        }
    } catch { }
    return nextLink;
}

async function getCalendarViewAllForUser(
    client: any,
    userId: string,
    start: string,
    end: string,
    select: string[]
) {
    let request = client
        .api(`/users/${userId}/calendarView`)
        .query({
            startDateTime: start,
            endDateTime: end,
            $select: select.join(","),
            $orderby: "start/dateTime desc",
            $top: 250,
        })
        .header('Prefer', 'outlook.timezone="Europe/Paris"');

    const all: any[] = [];
    let page = await request.get();
    all.push(...(page?.value ?? []));

    while (page?.["@odata.nextLink"]) {
        const next = toGraphRelative(page["@odata.nextLink"]);
        page = await client.api(next).get();
        all.push(...(page?.value ?? []));
        if (all.length >= 2000) break;
    }

    console.log(`[Calendar] Récupéré ${all.length} événements`);
    return all;
}

function escapeODataString(s: string) {
    return s.replace(/'/g, "''");
}

async function getOnlineMeetingIdByJoinUrl(appClient: any, organizerId: string, joinUrl: string) {
    // 1) essai exact (le plus fiable si joinUrl complet correspond)
    const joinUrlEsc = escapeODataString(joinUrl);

    const exact = await appClient
        .api(`/users/${organizerId}/onlineMeetings`)
        .filter(`joinWebUrl eq '${joinUrlEsc}'`)
        .get();

    if (exact?.value?.length) return exact.value[0].id as string;

    // 2) fallback : startswith sur l’URL sans querystring
    const base = joinUrl.split("?")[0];
    const baseEsc = escapeODataString(base);

    const sw = await appClient
        .api(`/users/${organizerId}/onlineMeetings`)
        .filter(`startswith(joinWebUrl,'${baseEsc}')`)
        .get();

    if (sw?.value?.length) return sw.value[0].id as string;

    return null;
}

async function getTranscriptsForMeetings(
    appClient: any,
    organizerEmail: string,
    eventsForOrganizer: any[]
) {
    try {
        console.log(`[Transcripts] 🎯 Récupération pour ${organizerEmail}`);

        const organizer = await appClient
            .api(`/users/${organizerEmail}`)
            .select("id")
            .get();

        console.log(`[Transcripts] Organizer ID: ${organizer.id}`);

        const transcriptsByJoinUrl = new Map<string, any[]>();

        for (const event of eventsForOrganizer) {
            const joinUrl = event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl;
            if (!joinUrl) continue;

            try {
                const onlineMeetingId = await getOnlineMeetingIdByJoinUrl(appClient, organizer.id, joinUrl);

                if (!onlineMeetingId) {
                    // pas trouvé -> pas de transcript récupérable via Graph
                    continue;
                }

                const transcriptsResult = await appClient
                    .api(`/users/${organizer.id}/onlineMeetings/${onlineMeetingId}/transcripts`)
                    .get();

                const transcripts = transcriptsResult?.value || [];
                if (transcripts.length === 0) continue;

                const formatted = transcripts.map((t: any) => ({
                    id: t.id,
                    name: "Transcription de la réunion",
                    createdDateTime: t.createdDateTime,
                    meetingId: onlineMeetingId,
                    transcriptContentUrl: t.transcriptContentUrl,
                    organizerEmail,
                    source: "onlineMeetings",
                }));

                const key = joinUrl.split("?")[0].toLowerCase();
                transcriptsByJoinUrl.set(key, formatted);

                console.log(`[Transcripts] ✓ ${event.subject}: ${formatted.length} transcript(s)`);
            } catch (e: any) {
                // 404/400 souvent normal si pas de transcript
                if (e?.statusCode !== 404 && e?.statusCode !== 400) {
                    console.log(`[Transcripts] Error for event "${event.subject}": ${e?.message ?? e}`);
                }
            }
        }

        console.log(`[Transcripts] ✅ ${transcriptsByJoinUrl.size} meetings with transcripts`);
        return transcriptsByJoinUrl;
    } catch (e: any) {
        console.error(`[Transcripts] Error: ${e?.message ?? e}`);
        return new Map();
    }
}


export async function GET(req: Request) {
    const startTime = Date.now();

    try {
        const delegatedToken = await getDelegatedAccessToken();
        if (!delegatedToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const delegatedClient = graphClient(delegatedToken);
        const me = await delegatedClient.api("/me").select("id,userPrincipalName,mail,displayName").get();
        const myUpn = me.userPrincipalName ?? me.mail;

        console.log(`[Init] Utilisateur: ${me.displayName} (${myUpn})`);

        const appToken = await getAppAccessToken();
        const appClient = graphClient(appToken);

        const { searchParams } = new URL(req.url);
        const persist = searchParams.get("persist") === "true";
        const startParam = searchParams.get("start");
        const endParam = searchParams.get("end");
        const roleFilter = searchParams.get("role") ?? "all";
        const onlyWithTranscripts = searchParams.get("onlyWithTranscripts") === "true";
        const limit = parseInt(searchParams.get("limit") ?? "999", 10);

        let startDate: Date;
        let endDate: Date;

        if (startParam && endParam) {
            startDate = new Date(startParam);
            endDate = new Date(endParam);
        } else {
            const now = new Date();
            endDate = now;
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 150);
        }

        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        console.log(`[Params] Recherche de ${limit} réunions de ${startIso} à ${endIso}`);

        const events = await getCalendarViewAllForUser(
            delegatedClient,
            me.id,
            startIso,
            endIso,
            ["id", "subject", "start", "end", "onlineMeeting", "organizer", "attendees", "onlineMeetingProvider", "webLink", "location", "responseStatus", "onlineMeetingUrl"]
        );

        const teamsEvents = events.filter(isTeamsMeeting);
        console.log(`[Filter] ${teamsEvents.length} réunions Teams trouvées sur ${events.length} événements`);

        console.log(`\n[Strategy] 🎯 Récupération des transcriptions`);

        // Grouper par organisateur
        const meetingsByOrganizer = new Map<string, any[]>();
        for (const event of teamsEvents) {
            const organizerEmail = event.organizer?.emailAddress?.address;
            if (!organizerEmail) continue;

            const meetings = meetingsByOrganizer.get(organizerEmail) || [];
            meetings.push(event);
            meetingsByOrganizer.set(organizerEmail, meetings);
        }

        console.log(`[Strategy] ${meetingsByOrganizer.size} organisateurs uniques`);

        // Récupérer les transcriptions pour chaque organisateur
        const allTranscripts = new Map<string, any[]>();

        for (const [organizerEmail, meetings] of meetingsByOrganizer.entries()) {
            console.log(`\n[Organizer] ${organizerEmail} (${meetings.length} réunions)`);

            const transcripts = await getTranscriptsForMeetings(appClient, organizerEmail, meetings);


            for (const [joinUrl, trans] of transcripts.entries()) {
                allTranscripts.set(joinUrl, trans);
            }
        }

        console.log(`\n[Result] Total: ${allTranscripts.size} réunions avec transcriptions`);

        // Matcher les événements avec les transcriptions
        const meetingsWithTranscripts: any[] = [];

        for (const e of teamsEvents) {
            if (meetingsWithTranscripts.length >= limit) break;

            const joinUrl = e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl;
            if (!joinUrl) continue;

            const organizerUpn = e.organizer?.emailAddress?.address;
            const isOrganizer = organizerUpn?.toLowerCase() === myUpn?.toLowerCase();
            const role = isOrganizer ? "organisateur" : "participant";

            if (roleFilter === "organizer" && role !== "organisateur") continue;
            if (roleFilter === "participant" && role !== "participant") continue;

            const myAttendee = e.attendees?.find((a: any) =>
                a?.emailAddress?.address?.toLowerCase() === myUpn?.toLowerCase()
            );
            const responseStatus = myAttendee?.status?.response ?? "unknown";
            const accepted = responseStatus === "accepted";
            const declined = responseStatus === "declined";

            const joinUrlBase = joinUrl.split('?')[0].toLowerCase();
            let transcripts = allTranscripts.get(joinUrlBase) || [];

            if (onlyWithTranscripts && transcripts.length === 0) continue;

            const attendees = (e.attendees ?? [])
                .map((a: any) => ({
                    name: a?.emailAddress?.name ?? null,
                    address: a?.emailAddress?.address ?? null,
                }))
                .filter((x: any) => x.address);

            const organizer = {
                name: e.organizer?.emailAddress?.name ?? null,
                address: organizerUpn ?? null,
            };

            const participantsEmails = Array.from(
                new Set([organizer.address, ...attendees.map((a: any) => a.address)].filter(Boolean))
            );

            meetingsWithTranscripts.push({
                eventId: e.id,
                subject: e.subject,
                start: e.start?.dateTime ?? null,
                end: e.end?.dateTime ?? null,
                joinUrl,
                webLink: e.webLink ?? null,

                organizer,
                attendees,
                participantsEmails,

                responseStatus,
                accepted,
                declined,
                role,
                location: e.location?.displayName ?? null,
                attendeesCount: e.attendees?.length ?? 0,
                conferenceId: e.onlineMeeting?.conferenceId ?? null,
                isOnlineMeeting: e.isOnlineMeeting ?? false,
                onlineMeetingProvider: e.onlineMeetingProvider ?? null,
                meetingId: null,
                transcripts,
                transcriptFetchError: null,
            });

            if (persist) {
                try {
                    await upsertMeetingAndParticipants({
                        eventId: e.id,
                        subject: e.subject ?? null,
                        joinUrl: joinUrl ?? null,
                        startIso: e.start?.dateTime ?? null,
                        endIso: e.end?.dateTime ?? null,
                        organizer,
                        attendees,
                        participantsEmails,
                        transcripts,
                        hasGraphTranscript: transcripts.length > 0,
                        hasGraphRecording: false,
                        transcriptSource: "graph",
                        onlineMeetingId:
                            (transcripts?.[0] as any)?.meetingId ??
                            e.onlineMeeting?.conferenceId ??
                            null,
                    });
                } catch (err: any) {
                    console.error("[Prisma] Persist meeting failed:", err?.message ?? err);
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`\n[Done] ${meetingsWithTranscripts.length} réunions trouvées en ${duration}ms`);

        return NextResponse.json({
            status: "OK",
            user: {
                id: me.id,
                displayName: me.displayName,
                mail: myUpn
            },
            window: {
                start: startIso,
                end: endIso
            },
            roleFilter,
            onlyWithTranscripts,
            count: meetingsWithTranscripts.length,
            debug: {
                totalEvents: events.length,
                teamsEvents: teamsEvents.length,
                uniqueOrganizers: meetingsByOrganizer.size,
                transcriptsFound: allTranscripts.size
            },
            meetings: meetingsWithTranscripts
        });

    } catch (e: any) {
        console.error("[Error]", e);
        return NextResponse.json({
            error: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        }, { status: 500 });
    }
}