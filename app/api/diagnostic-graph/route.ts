// app/api/diagnostic-graph/route.ts
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

    if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`APP_TOKEN_FAILED HTTP ${res.status} — ${err}`);
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("APP_TOKEN_MISSING_ACCESS_TOKEN");
    return json.access_token;
}

export async function GET(req: Request) {
    try {
        const appToken = await getAppAccessToken();
        const appClient = graphClient(appToken);

        const { searchParams } = new URL(req.url);
        const test = searchParams.get("test") || "1";

        const results: any = {
            timestamp: new Date().toISOString(),
            tests: []
        };

        // TEST 1: Accès aux OnlineMeetings de Leïla (organisateur)
        if (test === "1" || test === "all") {
            try {
                console.log("[TEST 1] OnlineMeetings de l'organisateur Leïla");
                const result = await appClient
                    .api('/users/9eae174d-e1d9-4d1d-8932-10615c2ba396/onlineMeetings')
                    .get();

                results.tests.push({
                    name: "OnlineMeetings Leïla (organisateur)",
                    status: "SUCCESS",
                    count: result?.value?.length || 0,
                    data: result?.value || []
                });
            } catch (e: any) {
                results.tests.push({
                    name: "OnlineMeetings Leïla (organisateur)",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        // TEST 2: Accès aux OnlineMeetings de Andy (vous)
        if (test === "2" || test === "all") {
            try {
                console.log("[TEST 2] OnlineMeetings de Andy");
                const result = await appClient
                    .api('/users/a.vespuce@groupe-espi.fr/onlineMeetings')
                    .get();

                results.tests.push({
                    name: "OnlineMeetings Andy (vous)",
                    status: "SUCCESS",
                    count: result?.value?.length || 0,
                    data: result?.value || []
                });
            } catch (e: any) {
                results.tests.push({
                    name: "OnlineMeetings Andy (vous)",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        // TEST 3: CallRecords
        if (test === "3" || test === "all") {
            try {
                console.log("[TEST 3] CallRecords");
                const result = await appClient
                    .api('/communications/callRecords')
                    .get();

                const callRecords = result?.value || [];

                // Chercher la réunion "Point avancement appli CR"
                const targetMeeting = callRecords.find((record: any) => {
                    const joinUrl = record.joinWebUrl || '';
                    return joinUrl.includes('19%3ameeting_ZDk4M2JjMTktNzBlZS00OGNiLThlZmMtOWVjNTVhN2ExMjk3');
                });

                results.tests.push({
                    name: "CallRecords",
                    status: "SUCCESS",
                    totalRecords: callRecords.length,
                    targetMeetingFound: !!targetMeeting,
                    targetMeeting: targetMeeting || null,
                    sample: callRecords.slice(0, 3)
                });
            } catch (e: any) {
                results.tests.push({
                    name: "CallRecords",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        // TEST 4: Recordings d'un CallRecord spécifique
        if (test === "4" || test === "all") {
            try {
                console.log("[TEST 4] Chercher les recordings dans CallRecords");

                // D'abord récupérer les CallRecords
                const callRecordsResult = await appClient
                    .api('/communications/callRecords')
                    .get();

                const callRecords = callRecordsResult?.value || [];

                // Prendre le premier callRecord récent
                const recentRecord = callRecords[0];

                if (recentRecord?.id) {
                    try {
                        const recordings = await appClient
                            .api(`/communications/callRecords/${recentRecord.id}/recordings`)
                            .get();

                        results.tests.push({
                            name: "Recordings pour callRecord",
                            status: "SUCCESS",
                            callRecordId: recentRecord.id,
                            recordingsCount: recordings?.value?.length || 0,
                            recordings: recordings?.value || []
                        });
                    } catch (e: any) {
                        results.tests.push({
                            name: "Recordings pour callRecord",
                            status: "ERROR",
                            callRecordId: recentRecord.id,
                            statusCode: e?.statusCode,
                            message: e?.message
                        });
                    }
                } else {
                    results.tests.push({
                        name: "Recordings pour callRecord",
                        status: "SKIPPED",
                        reason: "Aucun callRecord disponible"
                    });
                }
            } catch (e: any) {
                results.tests.push({
                    name: "Recordings pour callRecord",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        // TEST 5: OneDrive de Leïla (organisateur)
        if (test === "5" || test === "all") {
            try {
                console.log("[TEST 5] OneDrive de Leïla - dossier Recordings");
                const result = await appClient
                    .api('/users/l.vaughn@groupe-espi.fr/drive/root:/Recordings:/children')
                    .get();

                results.tests.push({
                    name: "OneDrive Leïla - Recordings",
                    status: "SUCCESS",
                    itemsCount: result?.value?.length || 0,
                    items: result?.value || []
                });
            } catch (e: any) {
                results.tests.push({
                    name: "OneDrive Leïla - Recordings",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        // TEST 6: Rechercher des fichiers de transcription dans OneDrive de Leïla
        if (test === "6" || test === "all") {
            try {
                console.log("[TEST 6] Recherche de fichiers transcript dans OneDrive de Leïla");
                const result = await appClient
                    .api('/users/l.vaughn@groupe-espi.fr/drive/root/search(q=\'transcript\')')
                    .get();

                results.tests.push({
                    name: "Recherche 'transcript' OneDrive Leïla",
                    status: "SUCCESS",
                    filesCount: result?.value?.length || 0,
                    files: result?.value || []
                });
            } catch (e: any) {
                results.tests.push({
                    name: "Recherche 'transcript' OneDrive Leïla",
                    status: "ERROR",
                    statusCode: e?.statusCode,
                    message: e?.message
                });
            }
        }

        return NextResponse.json(results);

    } catch (e: any) {
        return NextResponse.json({
            error: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        }, { status: 500 });
    }
}