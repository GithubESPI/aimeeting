// app/api/test-permissions/route.ts
// Route de diagnostic pour vérifier les permissions Microsoft Graph

import { NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";

export const dynamic = "force-dynamic";

function graphClient(token: string) {
    return Client.init({ authProvider: (done) => done(null, token) });
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

    if (!res.ok) throw new Error("Failed to get app token");

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Missing access token");
    return json.access_token;
}

// Décoder le JWT pour voir les permissions (scopes)
function decodeJWT(token: string) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

export async function GET(req: Request) {
    const results: any = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
            total: 0,
            passed: 0,
            failed: 0
        },
        recommendations: []
    };

    try {
        // 1. Test de récupération du token
        console.log("[Test] Récupération du token...");
        const appToken = await getAppAccessToken();

        results.tests.push({
            name: "Token acquisition",
            status: "✅ PASS",
            details: "Token d'application récupéré avec succès"
        });
        results.summary.passed++;

        // Décoder le token pour voir les scopes
        const tokenPayload = decodeJWT(appToken);
        const scopes = tokenPayload?.roles || [];

        results.tokenInfo = {
            scopes: scopes,
            appId: tokenPayload?.appid,
            tenantId: tokenPayload?.tid
        };

        console.log("[Test] Scopes disponibles:", scopes);

        const appClient = graphClient(appToken);

        // 2. Test CallRecords.Read.All
        console.log("[Test] Test CallRecords.Read.All...");
        try {
            const callRecords = await appClient
                .api('/communications/callRecords')
                .top(1)
                .get();

            results.tests.push({
                name: "CallRecords.Read.All",
                status: "✅ PASS",
                details: `Permission OK - ${callRecords?.value?.length || 0} call records trouvés`
            });
            results.summary.passed++;
        } catch (e: any) {
            results.tests.push({
                name: "CallRecords.Read.All",
                status: "❌ FAIL",
                details: `Erreur: ${e.message}`,
                error: e.statusCode
            });
            results.summary.failed++;

            if (e.statusCode === 403) {
                results.recommendations.push({
                    permission: "CallRecords.Read.All",
                    action: "Ajouter cette permission dans Azure AD > App registrations > API permissions",
                    priority: "CRITIQUE"
                });
            }
        }

        // 3. Test OnlineMeetings.Read.All
        console.log("[Test] Test OnlineMeetings.Read.All...");
        try {
            // Essayer de lister les online meetings (nécessite un userId)
            // On va juste tester si l'API répond
            const users = await appClient.api('/users').top(1).get();
            const userId = users?.value?.[0]?.id;

            if (userId) {
                const meetings = await appClient
                    .api(`/users/${userId}/onlineMeetings`)
                    .top(1)
                    .get();

                results.tests.push({
                    name: "OnlineMeetings.Read.All",
                    status: "✅ PASS",
                    details: "Permission OK"
                });
                results.summary.passed++;
            } else {
                results.tests.push({
                    name: "OnlineMeetings.Read.All",
                    status: "⚠️ SKIP",
                    details: "Impossible de tester (aucun utilisateur trouvé)"
                });
            }
        } catch (e: any) {
            results.tests.push({
                name: "OnlineMeetings.Read.All",
                status: "❌ FAIL",
                details: `Erreur: ${e.message}`,
                error: e.statusCode
            });
            results.summary.failed++;

            if (e.statusCode === 403) {
                results.recommendations.push({
                    permission: "OnlineMeetings.Read.All",
                    action: "Ajouter cette permission dans Azure AD",
                    priority: "HAUTE"
                });
            }
        }

        // 4. Test Files.Read.All
        console.log("[Test] Test Files.Read.All...");
        try {
            const users = await appClient.api('/users').top(1).get();
            const userId = users?.value?.[0]?.id;

            if (userId) {
                const drive = await appClient
                    .api(`/users/${userId}/drive`)
                    .get();

                results.tests.push({
                    name: "Files.Read.All",
                    status: "✅ PASS",
                    details: "Permission OK"
                });
                results.summary.passed++;
            }
        } catch (e: any) {
            results.tests.push({
                name: "Files.Read.All",
                status: "❌ FAIL",
                details: `Erreur: ${e.message}`,
                error: e.statusCode
            });
            results.summary.failed++;

            if (e.statusCode === 403) {
                results.recommendations.push({
                    permission: "Files.Read.All",
                    action: "Ajouter cette permission dans Azure AD",
                    priority: "HAUTE"
                });
            }
        }

        // 5. Test User.Read.All
        console.log("[Test] Test User.Read.All...");
        try {
            const users = await appClient
                .api('/users')
                .top(1)
                .get();

            results.tests.push({
                name: "User.Read.All",
                status: "✅ PASS",
                details: `Permission OK - ${users?.value?.length || 0} utilisateurs trouvés`
            });
            results.summary.passed++;
        } catch (e: any) {
            results.tests.push({
                name: "User.Read.All",
                status: "❌ FAIL",
                details: `Erreur: ${e.message}`,
                error: e.statusCode
            });
            results.summary.failed++;

            if (e.statusCode === 403) {
                results.recommendations.push({
                    permission: "User.Read.All",
                    action: "Ajouter cette permission dans Azure AD",
                    priority: "MOYENNE"
                });
            }
        }

        // Calcul du total
        results.summary.total = results.tests.length;

        // Conclusion
        if (results.summary.failed === 0) {
            results.conclusion = "✅ Toutes les permissions sont correctement configurées !";
        } else {
            results.conclusion = `❌ ${results.summary.failed} permission(s) manquante(s). Consultez les recommandations ci-dessous.`;
        }

        // Vérifier les scopes manquants
        const requiredScopes = [
            "CallRecords.Read.All",
            "OnlineMeetings.Read.All",
            "Files.Read.All",
            "User.Read.All",
            "Calendars.Read"
        ];

        const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));

        if (missingScopes.length > 0) {
            results.recommendations.push({
                type: "missing_scopes",
                scopes: missingScopes,
                action: "Ces scopes sont absents du token. Vérifiez que les permissions ont été ajoutées ET que le consentement admin a été accordé.",
                priority: "CRITIQUE"
            });
        }

        return NextResponse.json(results, { status: 200 });

    } catch (e: any) {
        console.error("[Test] Erreur:", e);
        return NextResponse.json({
            error: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        }, { status: 500 });
    }
}