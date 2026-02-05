// app/api/admin/debug-meetings/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const dynamic = "force-dynamic";

// Cache du token en mémoire
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
    if (process.env.GRAPH_ACCESS_TOKEN) return process.env.GRAPH_ACCESS_TOKEN;

    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.token;
    }

    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) return null;

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        client_id: clientId,
        scope: "https://graph.microsoft.com/.default",
        client_secret: clientSecret,
        grant_type: "client_credentials",
    });

    try {
        const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        if (!tokenRes.ok) return null;

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;

        cachedToken = {
            token: accessToken,
            expiresAt: Date.now() + (expiresIn - 300) * 1000,
        };

        return accessToken;
    } catch (e) {
        return null;
    }
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
        }

        // Vérification Admin
        if (session.user.email.toLowerCase() !== "a.vespuce@groupe-espi.fr") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const email = searchParams.get("email");

        // --- CHANGEMENT 1: DATES DYNAMIQUES (30 derniers jours par défaut) ---
        const now = new Date();
        const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];

        const startDate = searchParams.get("startDate") || defaultStart;
        const endDate = searchParams.get("endDate") || defaultEnd;
        const onlyWithTranscripts = searchParams.get("onlyWithTranscripts") === "true";

        if (!email) return NextResponse.json({ error: "Email requis" }, { status: 400 });

        const accessToken = await getAccessToken();
        if (!accessToken) return NextResponse.json({ error: "Erreur Token" }, { status: 500 });

        // --- CHANGEMENT 2: FETCH SANS CACHE POUR GRAPH API ---
        const startDateTime = `${startDate}T00:00:00Z`;
        const endDateTime = `${endDate}T23:59:59Z`;
        const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=999&$orderby=start/dateTime desc`;

        const graphRes = await fetch(graphUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Prefer": 'outlook.timezone="Europe/Paris"'
            },
            cache: "no-store", // On force Microsoft à nous donner les données réelles
        });

        if (!graphRes.ok) throw new Error("Erreur lors de la récupération du calendrier");

        const graphData = await graphRes.json();
        const meetings = graphData.value || [];

        // Groupement par organisateur
        const meetingsByOrganizer = new Map<string, any[]>();
        for (const m of meetings) {
            const orgEmail = m.organizer?.emailAddress?.address;
            if (!orgEmail) continue;
            const list = meetingsByOrganizer.get(orgEmail) || [];
            list.push(m);
            meetingsByOrganizer.set(orgEmail, list);
        }

        const transcriptsByJoinUrl = new Map<string, any>();

        // Boucle sur les organisateurs
        for (const [orgEmail, orgMeetings] of meetingsByOrganizer.entries()) {
            try {
                const orgUserRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(orgEmail)}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    cache: "no-store"
                });
                if (!orgUserRes.ok) continue;
                const orgUserData = await orgUserRes.json();
                const organizerId = orgUserData.id;

                for (const meeting of orgMeetings) {
                    const joinUrl = meeting.onlineMeeting?.joinUrl || meeting.onlineMeetingUrl;
                    if (!joinUrl) continue;

                    // --- CHANGEMENT 3: RECHERCHE ROBUSTE DE L'ID DE REUNION ---
                    const joinUrlEsc = joinUrl.replace(/'/g, "''");
                    let onlineMeetingId = null;

                    // Test exact
                    const exactRes = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings?$filter=joinWebUrl eq '${joinUrlEsc}'`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        cache: "no-store"
                    });

                    if (exactRes.ok) {
                        const data = await exactRes.json();
                        if (data.value?.length > 0) onlineMeetingId = data.value[0].id;
                    }

                    // Fallback Startswith
                    if (!onlineMeetingId) {
                        const baseUrl = joinUrl.split("?")[0].replace(/'/g, "''");
                        const swRes = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings?$filter=startswith(joinWebUrl,'${baseUrl}')`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                            cache: "no-store"
                        });
                        if (swRes.ok) {
                            const data = await swRes.json();
                            if (data.value?.length > 0) onlineMeetingId = data.value[0].id;
                        }
                    }

                    if (onlineMeetingId) {
                        // Récupération des transcriptions
                        const transRes = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${onlineMeetingId}/transcripts`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                            cache: "no-store"
                        });
                        if (transRes.ok) {
                            const transData = await transRes.json();
                            if (transData.value?.length > 0) {
                                const key = joinUrl.split("?")[0].toLowerCase();
                                transcriptsByJoinUrl.set(key, transData.value);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Erreur organisateur ${orgEmail}`, e);
            }
        }

        // Construction de la réponse finale
        const processedMeetings = meetings.map((m: any) => {
            const joinUrl = m.onlineMeeting?.joinUrl || m.onlineMeetingUrl;
            const key = joinUrl ? joinUrl.split("?")[0].toLowerCase() : null;
            const hasTranscript = key ? transcriptsByJoinUrl.has(key) : false;

            return {
                ...m,
                hasTranscript,
                // On simplifie l'objet pour le front
                id: m.id,
                subject: m.subject,
                start: m.start,
                end: m.end,
                organizer: m.organizer,
                isOnlineMeeting: !!joinUrl
            };
        });

        const filtered = onlyWithTranscripts
            ? processedMeetings.filter((m: { hasTranscript: any; }) => m.hasTranscript)
            : processedMeetings;

        return NextResponse.json({
            count: filtered.length,
            meetings: filtered,
            debug: {
                range: { startDate, endDate },
                totalFound: meetings.length,
                withTranscripts: transcriptsByJoinUrl.size
            }
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}