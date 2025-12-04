// lib/graph/appToken.ts
import "server-only";

export async function getAppGraphToken(): Promise<string> {
    // 🟡 Utilise les mêmes noms que dans ton projet (AZURE_AD_…)
    const tenantId = process.env.AZURE_AD_TENANT_ID!;
    const clientId = process.env.AZURE_AD_CLIENT_ID!;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET!;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("[getAppGraphToken] Missing env vars", {
            tenantId,
            clientIdDefined: !!clientId,
            clientSecretDefined: !!clientSecret,
        });
        throw new Error("Missing Azure AD env vars for app token");
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");

    const res = await fetch(tokenEndpoint, {
        method: "POST",
        body: params,
    });

    if (!res.ok) {
        const body = await res.text();
        console.error("[getAppGraphToken] Error", res.status, body);
        throw new Error("Unable to fetch app token");
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
        throw new Error("No access_token in app token response");
    }

    return json.access_token;
}
