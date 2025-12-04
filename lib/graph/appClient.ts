// lib/graph/appClient.ts
import { Client } from "@microsoft/microsoft-graph-client";

let cached: Client | null = null;

/**
 * Récupère un token d'application (client_credentials)
 * depuis Azure AD pour appeler Microsoft Graph en mode APP ONLY.
 */
async function fetchAppToken(): Promise<string> {
    const tenant =
        process.env.AZURE_AD_TENANT_ID ?? process.env.GRAPH_TENANT_ID;
    const clientId =
        process.env.AZURE_AD_CLIENT_ID ?? process.env.GRAPH_CLIENT_ID;
    const clientSecret =
        process.env.AZURE_AD_CLIENT_SECRET ?? process.env.GRAPH_CLIENT_SECRET;

    if (!tenant || !clientId || !clientSecret) {
        console.error("❌ Variables d'environnement manquantes pour Graph APP");
        console.error("AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET");
        throw new Error("Config Azure AD incomplète");
    }

    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("Erreur token app-only:", res.status, text);
        throw new Error("Impossible de récupérer le token app-only");
    }

    const json = (await res.json()) as { access_token: string };
    return json.access_token;
}

/**
 * Client Graph APP-ONLY (client credentials)
 */
export async function getGraphAppClient(): Promise<Client> {
    if (cached) return cached;

    const token = await fetchAppToken();

    cached = Client.init({
        authProvider: (done) => {
            done(null, token);
        },
    });

    return cached;
}
