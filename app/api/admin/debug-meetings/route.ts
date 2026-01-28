// app/api/admin/debug-meetings/route.ts
// ✅ Version qui obtient le token automatiquement si GRAPH_ACCESS_TOKEN n'est pas défini

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

        if (!email) {
            return NextResponse.json({ error: "Email requis" }, { status: 400 });
        }

        console.log(`🔍 [Admin] Recherche des réunions pour: ${email}`);
        console.log(`📅 Période: ${startDate} → ${endDate}`);

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

        const teamsMeetings = meetings.filter((m: any) => m.isOnlineMeeting);

        return NextResponse.json({
            email,
            count: meetings.length,
            teamsMeetingsCount: teamsMeetings.length,
            meetings: meetings,
            debug: {
                graphUrl,
                timestamp: new Date().toISOString(),
                tokenSource: process.env.GRAPH_ACCESS_TOKEN ? "env" : "oauth",
                dateRange: {
                    start: startDate,
                    end: endDate
                }
            },
        });
    } catch (e: any) {
        console.error("❌ Erreur dans /api/admin/debug-meetings:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur" }, { status: 500 });
    }
}