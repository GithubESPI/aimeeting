// app/api/admin/meeting-detail/route.ts
// API pour récupérer les détails complets d'une réunion depuis Graph API

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Réutiliser la fonction getAccessToken
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
    if (process.env.GRAPH_ACCESS_TOKEN) {
        return process.env.GRAPH_ACCESS_TOKEN;
    }

    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.token;
    }

    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        return null;
    }

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
    } catch {
        return null;
    }
}

export async function GET(req: Request) {
    try {
        // Vérifier que l'utilisateur est admin
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || session.user.email.toLowerCase() !== "a.vespuce@groupe-espi.fr") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const meetingId = searchParams.get("meetingId");
        const userEmail = searchParams.get("userEmail"); // Email de l'utilisateur (Leïla)

        if (!meetingId) {
            return NextResponse.json({ error: "meetingId requis" }, { status: 400 });
        }

        if (!userEmail) {
            return NextResponse.json({ error: "userEmail requis" }, { status: 400 });
        }

        console.log(`🔍 [Admin] Récupération des détails pour: ${meetingId}`);
        console.log(`👤 Utilisateur: ${userEmail}`);

        // Obtenir le token
        const accessToken = await getAccessToken();

        if (!accessToken) {
            return NextResponse.json(
                { error: "Impossible d'obtenir un token Microsoft Graph" },
                { status: 500 }
            );
        }

        // Utiliser l'email fourni pour récupérer les détails de la réunion
        const eventUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/events/${meetingId}`;

        console.log(`📞 Appel Graph API: ${eventUrl}`);

        const eventRes = await fetch(eventUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!eventRes.ok) {
            const errorData = await eventRes.json().catch(() => ({}));
            console.error("❌ Erreur Graph API:", errorData);
            return NextResponse.json(
                { error: errorData?.error?.message ?? `Erreur Graph API: ${eventRes.status}` },
                { status: eventRes.status }
            );
        }

        const meeting = await eventRes.json();

        // Vérifier si la réunion a des transcriptions
        let transcripts: any[] = [];
        let hasTranscript = false;

        if (meeting.isOnlineMeeting && meeting.onlineMeetingId) {
            try {
                const transcriptUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/onlineMeetings/${meeting.onlineMeetingId}/transcripts`;

                const transcriptRes = await fetch(transcriptUrl, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (transcriptRes.ok) {
                    const transcriptData = await transcriptRes.json();
                    transcripts = transcriptData.value || [];
                    hasTranscript = transcripts.length > 0;
                }
            } catch (transcriptError) {
                console.log("⚠️  Impossible de récupérer les transcriptions");
            }
        }

        // Vérifier si la réunion existe en DB
        let meetingInDB = null;
        try {
            meetingInDB = await prisma.meeting.findFirst({
                where: { graphId: meetingId },
                select: { id: true }
            });
        } catch (dbError) {
            console.log("⚠️  DB non accessible");
        }

        console.log(`✅ Détails récupérés pour: ${meeting.subject}`);

        return NextResponse.json({
            meeting: {
                ...meeting,
                hasTranscript,
                transcripts,
                inDatabase: !!meetingInDB,
                databaseId: meetingInDB?.id || null,
            },
        });

    } catch (e: any) {
        console.error("❌ Erreur dans /api/admin/meeting-detail:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur" }, { status: 500 });
    }
}