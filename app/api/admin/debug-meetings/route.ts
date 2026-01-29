// app/api/admin/debug-meetings/route.ts
// ✅ Version finale sans erreurs TypeScript

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const dynamic = "force-dynamic";

// Cache du token en mémoire
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
    // 1. Essayer d'utiliser GRAPH_ACCESS_TOKEN depuis .env
    if (process.env.GRAPH_ACCESS_TOKEN) {
        return process.env.GRAPH_ACCESS_TOKEN;
    }

    // 2. Vérifier le cache
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        console.log("✅ Utilisation du token en cache");
        return cachedToken.token;
    }

    // 3. Obtenir un nouveau token via OAuth
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("❌ Configuration Azure AD incomplète");
        return null;
    }

    console.log("🔄 Obtention d'un nouveau token Graph API...");

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

        if (!tokenRes.ok) {
            console.error("❌ Erreur obtention token:", await tokenRes.text());
            return null;
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;

        // Mettre en cache
        cachedToken = {
            token: accessToken,
            expiresAt: Date.now() + (expiresIn - 300) * 1000,
        };

        console.log(`✅ Token obtenu (expire dans ${expiresIn}s)`);
        return accessToken;
    } catch (e: any) {
        console.error("❌ Erreur lors de l'obtention du token:", e);
        return null;
    }
}

export async function GET(req: Request) {
    try {
        // Vérifier que l'utilisateur est admin
        const session = await getServerSession(authOptions);

        if (!session?.user?.email) {
            return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
        }

        if (session.user.email.toLowerCase() !== "a.vespuce@groupe-espi.fr") {
            return NextResponse.json({ error: "Accès refusé. Réservé aux administrateurs." }, { status: 403 });
        }

        // Récupérer les paramètres
        const { searchParams } = new URL(req.url);
        const email = searchParams.get("email");
        const startDate = searchParams.get("startDate") || "2026-01-01";
        const endDate = searchParams.get("endDate") || "2026-12-31";
        const onlyWithTranscripts = searchParams.get("onlyWithTranscripts") === "true";

        if (!email) {
            return NextResponse.json({ error: "Email requis" }, { status: 400 });
        }

        console.log(`🔍 [Admin] Recherche des réunions pour: ${email}`);
        console.log(`📅 Période: ${startDate} → ${endDate}`);
        console.log(`📝 Filtre transcriptions: ${onlyWithTranscripts ? "OUI" : "NON"}`);

        // Obtenir le token (automatiquement ou depuis .env)
        const accessToken = await getAccessToken();

        if (!accessToken) {
            return NextResponse.json(
                {
                    error: "Impossible d'obtenir un token Microsoft Graph",
                    solution: "Vérifiez les variables d'environnement dans .env",
                    required: ["AZURE_AD_TENANT_ID", "AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET"],
                },
                { status: 500 }
            );
        }

        // Appeler Microsoft Graph API avec calendarView pour une plage de dates
        const startDateTime = `${startDate}T00:00:00Z`;
        const endDateTime = `${endDate}T23:59:59Z`;

        const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$top=999&$orderby=start/dateTime desc`;

        console.log(`📞 Appel Graph API: ${graphUrl}`);

        const graphRes = await fetch(graphUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!graphRes.ok) {
            const errorData = await graphRes.json().catch(() => ({}));
            console.error("❌ Erreur Graph API:", errorData);

            return NextResponse.json(
                {
                    error: errorData?.error?.message ?? `Erreur Graph API: ${graphRes.status}`,
                    details: errorData,
                },
                { status: graphRes.status }
            );
        }

        const graphData = await graphRes.json();
        const meetings = graphData.value || [];

        console.log(`✅ ${meetings.length} réunions trouvées pour ${email}`);

        // Récupérer l'ID de l'utilisateur
        const userUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`;
        const userRes = await fetch(userUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!userRes.ok) {
            throw new Error("Impossible de récupérer l'ID utilisateur");
        }

        const userData = await userRes.json();
        const userId = userData.id;

        console.log(`👤 User ID: ${userId}`);

        // Grouper par organisateur pour optimiser les appels API
        const meetingsByOrganizer = new Map<string, any[]>();
        for (const m of meetings) {
            const orgEmail = m.organizer?.emailAddress?.address;
            if (!orgEmail) continue;

            const list = meetingsByOrganizer.get(orgEmail) || [];
            list.push(m);
            meetingsByOrganizer.set(orgEmail, list);
        }

        console.log(`📊 ${meetingsByOrganizer.size} organisateurs uniques`);

        // Récupérer les transcriptions par organisateur
        const transcriptsByJoinUrl = new Map<string, any[]>();

        for (const [orgEmail, orgMeetings] of meetingsByOrganizer.entries()) {
            console.log(`\n🔍 Organisateur: ${orgEmail} (${orgMeetings.length} réunions)`);

            try {
                // Récupérer l'ID de l'organisateur
                const orgUserUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(orgEmail)}`;
                const orgUserRes = await fetch(orgUserUrl, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!orgUserRes.ok) continue;

                const orgUserData = await orgUserRes.json();
                const organizerId = orgUserData.id;

                // Pour chaque réunion de cet organisateur
                for (const meeting of orgMeetings) {
                    const joinUrl = meeting.onlineMeeting?.joinUrl || meeting.onlineMeetingUrl;
                    if (!joinUrl) continue;

                    try {
                        // Trouver l'onlineMeetingId via le joinUrl
                        const joinUrlEsc = joinUrl.replace(/'/g, "''");

                        // Essai 1: Exact match
                        const exactUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings?$filter=joinWebUrl eq '${joinUrlEsc}'`;
                        const exactRes = await fetch(exactUrl, {
                            method: "GET",
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                                "Content-Type": "application/json",
                            },
                        });

                        let onlineMeetingId = null;

                        if (exactRes.ok) {
                            const exactData = await exactRes.json();
                            if (exactData.value && exactData.value.length > 0) {
                                onlineMeetingId = exactData.value[0].id;
                            }
                        }

                        // Essai 2: Startswith (fallback)
                        if (!onlineMeetingId) {
                            const baseUrl = joinUrl.split("?")[0];
                            const baseUrlEsc = baseUrl.replace(/'/g, "''");
                            const swUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings?$filter=startswith(joinWebUrl,'${baseUrlEsc}')`;

                            const swRes = await fetch(swUrl, {
                                method: "GET",
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    "Content-Type": "application/json",
                                },
                            });

                            if (swRes.ok) {
                                const swData = await swRes.json();
                                if (swData.value && swData.value.length > 0) {
                                    onlineMeetingId = swData.value[0].id;
                                }
                            }
                        }

                        if (!onlineMeetingId) continue;

                        // Récupérer les transcriptions
                        const transcriptUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${onlineMeetingId}/transcripts`;
                        const transcriptRes = await fetch(transcriptUrl, {
                            method: "GET",
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                                "Content-Type": "application/json",
                            },
                        });

                        if (transcriptRes.ok) {
                            const transcriptData = await transcriptRes.json();
                            if (transcriptData.value && transcriptData.value.length > 0) {
                                const joinUrlKey = joinUrl.split("?")[0].toLowerCase();
                                transcriptsByJoinUrl.set(joinUrlKey, transcriptData.value);
                                console.log(`  ✅ ${meeting.subject}: ${transcriptData.value.length} transcription(s)`);
                            }
                        }
                    } catch (transcriptError) {
                        // Ignorer les erreurs individuelles
                    }
                }
            } catch (orgError) {
                console.log(`  ⚠️  Erreur pour ${orgEmail}`);
            }
        }

        console.log(`\n📝 Total: ${transcriptsByJoinUrl.size} réunions avec transcriptions`);

        // Enrichir les réunions avec les infos de transcription
        const meetingsWithTranscripts = meetings.map((m: any) => {
            const joinUrl = m.onlineMeeting?.joinUrl || m.onlineMeetingUrl;
            let hasTranscript = false;

            if (joinUrl) {
                const joinUrlKey = joinUrl.split("?")[0].toLowerCase();
                hasTranscript = transcriptsByJoinUrl.has(joinUrlKey);
            }

            return {
                id: m.id,
                subject: m.subject,
                start: m.start,
                end: m.end,
                organizer: m.organizer,
                isOnlineMeeting: m.isOnlineMeeting,
                onlineMeeting: m.onlineMeeting,
                onlineMeetingId: m.onlineMeetingId,
                attendees: m.attendees,
                hasTranscript,
            };
        });

        // Filtrer si onlyWithTranscripts est activé
        const filteredMeetings = onlyWithTranscripts
            ? meetingsWithTranscripts.filter((m: any) => m.hasTranscript)
            : meetingsWithTranscripts;

        const teamsMeetings = filteredMeetings.filter((m: any) => m.isOnlineMeeting);
        const withTranscripts = filteredMeetings.filter((m: any) => m.hasTranscript);

        console.log(`📊 Stats: ${withTranscripts.length} réunions avec transcription sur ${teamsMeetings.length} Teams meetings`);
        if (onlyWithTranscripts) {
            console.log(`✂️  Filtre actif: ${filteredMeetings.length} réunions retournées (seulement avec transcriptions)`);
        }

        return NextResponse.json({
            email,
            count: filteredMeetings.length,
            teamsMeetingsCount: teamsMeetings.length,
            withTranscriptCount: withTranscripts.length,
            meetings: filteredMeetings,
            debug: {
                graphUrl,
                timestamp: new Date().toISOString(),
                tokenSource: process.env.GRAPH_ACCESS_TOKEN ? "env" : "oauth",
                dateRange: {
                    start: startDate,
                    end: endDate
                },
                uniqueOrganizers: meetingsByOrganizer.size,
                transcriptsFound: transcriptsByJoinUrl.size,
                onlyWithTranscripts,
                totalBeforeFilter: meetingsWithTranscripts.length,
                totalAfterFilter: filteredMeetings.length
            },
        });
    } catch (e: any) {
        console.error("❌ Erreur dans /api/admin/debug-meetings:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur" }, { status: 500 });
    }
}