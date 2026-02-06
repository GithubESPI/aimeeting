// app/api/my-meetings-with-transcripts/route.ts
// VERSION OPTIMISÉE - Avec parallélisation des appels API

import { NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";
import { getDelegatedAccessToken } from "@/lib/auth/getDelegatedToken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 🔧 AJOUT : Timeout de 60 secondes (requis pour Azure/Vercel Pro)

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
            participantsEmails,
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
    const checks = {
        isOnlineMeeting: !!e?.isOnlineMeeting,
        hasOnlineMeetingUrl: !!e?.onlineMeetingUrl,
        hasJoinUrl: !!e?.onlineMeeting?.joinUrl,
        providerIsTeams: (e?.onlineMeetingProvider ?? "").toLowerCase().includes("teams"),
        webLinkIsTeams: (e?.webLink ?? "").includes("teams.microsoft.com")
    };

    const isTeams = Object.values(checks).some(v => v);

    if (!isTeams && process.env.NODE_ENV === 'development') {
        console.log(`[Filter] ❌ "${e?.subject}" n'est pas une réunion Teams:`, checks);
    }

    return isTeams;
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
    if (!nextLink) return nextLink;

    try {
        // Si c'est une URL complète
        if (nextLink.startsWith("http://") || nextLink.startsWith("https://")) {
            const url = new URL(nextLink);
            let path = url.pathname + url.search;
            
            // Retirer TOUS les préfixes version
            path = path.replace(/^\/(v1\.0|beta)\//, '/');
            
            // Le SDK Graph ajoute automatiquement le slash de début
            return path.startsWith('/') ? path.substring(1) : path;
        }

        // Si c'est un chemin qui commence par /v1.0/ ou /beta/
        if (nextLink.startsWith('/v1.0/')) {
            return nextLink.substring(6);
        }
        if (nextLink.startsWith('/beta/')) {
            return nextLink.substring(6);
        }
        
        // Si c'est déjà un chemin relatif propre
        if (nextLink.startsWith('/')) {
            return nextLink.substring(1);
        }

        return nextLink;
        
    } catch (err) {
        console.error('[toGraphRelative] Erreur:', err, 'pour URL:', nextLink);
        return nextLink.replace(/^\/(v1\.0|beta)\//, '').replace(/^\//, '');
    }
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

    let pageCount = 1;
    while (page?.["@odata.nextLink"]) {
        const nextLink = page["@odata.nextLink"];
        console.log(`[Calendar] Page ${pageCount + 1}, nextLink BRUT: ${nextLink}`);

        const next = toGraphRelative(nextLink);
        console.log(`[Calendar] nextLink CONVERTI: ${next}`);

        try {
            page = await client.api(next).get();
            all.push(...(page?.value ?? []));
            pageCount++;
        } catch (err: any) {
            console.error(`[Calendar] ❌ ERREUR pagination:`, err.message);
            console.error(`[Calendar] URL qui a causé l'erreur: ${next}`);
            console.error(`[Calendar] URL originale: ${nextLink}`);
            throw err;
        }

        if (all.length >= 2000) {
            console.log(`[Calendar] Limite de 2000 événements atteinte`);
            break;
        }
    }

    console.log(`[Calendar] Récupéré ${all.length} événements sur ${pageCount} page(s)`);
    return all;
}

function escapeODataString(s: string) {
    return s.replace(/'/g, "''");
}

async function getOnlineMeetingIdByJoinUrl(appClient: any, organizerId: string, joinUrl: string) {
    console.log(`[OnlineMeetingId] 🔍 Recherche pour joinUrl: ${joinUrl}`);

    const joinUrlEsc = escapeODataString(joinUrl);

    try {
        const exact = await appClient
            .api(`/users/${organizerId}/onlineMeetings`)
            .filter(`joinWebUrl eq '${joinUrlEsc}'`)
            .get();

        if (exact?.value?.length) {
            console.log(`[OnlineMeetingId] ✅ Trouvé avec match exact: ${exact.value[0].id}`);
            return exact.value[0].id as string;
        }
    } catch (e: any) {
        console.log(`[OnlineMeetingId] ⚠️ Erreur match exact: ${e.message}`);
    }

    const base = joinUrl.split("?")[0];
    const baseEsc = escapeODataString(base);

    try {
        const sw = await appClient
            .api(`/users/${organizerId}/onlineMeetings`)
            .filter(`startswith(joinWebUrl,'${baseEsc}')`)
            .get();

        if (sw?.value?.length) {
            console.log(`[OnlineMeetingId] ✅ Trouvé avec startswith: ${sw.value[0].id}`);
            return sw.value[0].id as string;
        }
    } catch (e: any) {
        console.log(`[OnlineMeetingId] ⚠️ Erreur startswith: ${e.message}`);
    }

    console.log(`[OnlineMeetingId] ❌ Aucun match trouvé pour: ${joinUrl}`);
    return null;
}

// 🔧 FONCTION MODIFIÉE : Parallélisation des appels API
async function getTranscriptsForMeetings(
    appClient: any,
    organizerEmail: string,
    eventsForOrganizer: any[]
) {
    try {
        console.log(`[Transcripts] 🎯 Récupération pour ${organizerEmail} (${eventsForOrganizer.length} réunions)`);

        const organizer = await appClient
            .api(`/users/${organizerEmail}`)
            .select("id")
            .get();

        console.log(`[Transcripts] Organizer ID: ${organizer.id}`);

        const transcriptsByJoinUrl = new Map<string, any[]>();

        // 🔧 PARALLÉLISATION : Traiter toutes les réunions en même temps
        const promises = eventsForOrganizer.map(async (event) => {
            const joinUrl = event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl;
            if (!joinUrl) {
                console.log(`[Transcripts] ⚠️ Pas de joinUrl pour: ${event.subject}`);
                return null;
            }

            console.log(`[Transcripts] 🔎 Traitement de "${event.subject}"`);

            try {
                const onlineMeetingId = await getOnlineMeetingIdByJoinUrl(appClient, organizer.id, joinUrl);

                if (!onlineMeetingId) {
                    console.log(`[Transcripts] ⚠️ Pas d'onlineMeetingId trouvé pour: ${event.subject}`);
                    return null;
                }

                console.log(`[Transcripts] ✓ onlineMeetingId trouvé: ${onlineMeetingId}`);

                const transcriptsResult = await appClient
                    .api(`/users/${organizer.id}/onlineMeetings/${onlineMeetingId}/transcripts`)
                    .get();

                const transcripts = transcriptsResult?.value || [];
                console.log(`[Transcripts] 📝 ${transcripts.length} transcription(s) trouvée(s)`);

                if (transcripts.length === 0) return null;

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

                console.log(`[Transcripts] ✅ ${event.subject}: ${formatted.length} transcript(s) sauvegardé(s) avec clé: ${key}`);

                return { key, formatted };
            } catch (e: any) {
                console.log(`[Transcripts] ❌ Erreur pour "${event.subject}": ${e?.message ?? e}`);
                return null;
            }
        });

        // 🔧 Attendre que TOUS les appels se terminent en parallèle
        console.log(`[Transcripts] ⏳ Lancement de ${promises.length} requêtes en parallèle...`);
        const results = await Promise.all(promises);

        // 🔧 Remplir la Map avec les résultats
        results.forEach(result => {
            if (result && result.formatted.length > 0) {
                transcriptsByJoinUrl.set(result.key, result.formatted);
            }
        });

        console.log(`[Transcripts] ✅ ${transcriptsByJoinUrl.size} réunions avec transcriptions`);
        return transcriptsByJoinUrl;
    } catch (e: any) {
        console.error(`[Transcripts] ❌ Erreur globale: ${e?.message ?? e}`);
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
            startDate.setDate(startDate.getDate() - 365);
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

            // Matching amélioré avec plusieurs tentatives
            let transcripts: any[] = [];

            const joinUrlBase = joinUrl.split('?')[0].toLowerCase();
            transcripts = allTranscripts.get(joinUrlBase) || [];

            if (transcripts.length === 0) {
                const withoutSlash = joinUrlBase.replace(/\/$/, '');
                transcripts = allTranscripts.get(withoutSlash) || [];
            }

            if (transcripts.length === 0) {
                const withSlash = joinUrlBase.endsWith('/') ? joinUrlBase : joinUrlBase + '/';
                transcripts = allTranscripts.get(withSlash) || [];
            }

            console.log(`[Match] ${e.subject}: ${transcripts.length} transcription(s) trouvée(s) pour ${joinUrlBase}`);

            if (onlyWithTranscripts && transcripts.length === 0) {
                console.log(`[Match] ❌ "${e.subject}" filtré car onlyWithTranscripts=true et pas de transcription`);
                continue;
            }

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
                transcriptsFound: allTranscripts.size,
                durationMs: duration
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