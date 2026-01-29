// app/api/transcript-content/route.ts
// ✅ DB-FIRST + fallback Graph + persist fiable via meetingDbId

import { NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function graphClient(token: string) {
    return Client.init({ authProvider: (done) => done(null, token) });
}

async function getAppAccessToken() {
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) throw new Error("Missing env vars");

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
        throw new Error(`Failed to get app token (HTTP ${res.status}) — ${err}`);
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Missing access token");
    return json.access_token;
}

class HttpError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
        super(`TRANSCRIPT_CONTENT_FAILED HTTP ${status} — ${body}`);
        this.status = status;
        this.body = body;
    }
}

async function downloadTranscriptVttText(token: string, url: string) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/vtt" },
        cache: "no-store",
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) throw new HttpError(res.status, body);
    return body;
}

function escapeODataString(s: string) {
    return s.replace(/'/g, "''");
}

async function findMeetingIdByJoinUrl(appClient: any, organizerId: string, joinUrl: string): Promise<string | null> {
    const joinUrlEsc = escapeODataString(joinUrl);

    const exact = await appClient
        .api(`/users/${organizerId}/onlineMeetings`)
        .filter(`joinWebUrl eq '${joinUrlEsc}'`)
        .get();
    if (exact?.value?.length) return exact.value[0].id as string;

    const base = joinUrl.split("?")[0];
    const baseEsc = escapeODataString(base);

    const sw = await appClient
        .api(`/users/${organizerId}/onlineMeetings`)
        .filter(`startswith(joinWebUrl,'${baseEsc}')`)
        .get();
    if (sw?.value?.length) return sw.value[0].id as string;

    return null;
}

async function getTranscriptContent(appClient: any, appToken: string, organizerEmail: string, meetingId: string, transcriptId: string) {
    const organizer = await appClient.api(`/users/${organizerEmail}`).select("id").get();
    const transcriptUrl = `https://graph.microsoft.com/v1.0/users/${organizer.id}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`;
    return await downloadTranscriptVttText(appToken, transcriptUrl);
}

/** ✅ convert "HH:MM:SS" or "MM:SS" to ms */
function tsToMs(ts: string) {
    const clean = ts.trim();
    const parts = clean.split(":").map((x) => parseInt(x, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;

    let h = 0, m = 0, s = 0;
    if (parts.length === 3) [h, m, s] = parts;
    if (parts.length === 2) [m, s] = parts;
    if (parts.length === 1) [s] = parts;

    return ((h * 3600 + m * 60 + s) * 1000) | 0;
}

type ParsedSegment = { start: string; end: string; text: string; speaker?: string };

function parseVTTWithEnd(vtt: string): ParsedSegment[] {
    const lines = vtt.split("\n");
    const result: ParsedSegment[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();

        if (line === "" || line.startsWith("WEBVTT") || line.startsWith("NOTE")) {
            i++;
            continue;
        }

        if (line.includes("-->")) {
            const [startRaw, endRaw] = line.split("-->").map((x) => x.trim());
            const start = (startRaw ?? "").split(".")[0];
            const end = (endRaw ?? "").split(".")[0];

            i++;

            let text = "";
            let speaker: string | undefined;

            while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
                const textLine = lines[i].trim();

                const speakerMatch = textLine.match(/<v ([^>]+)>([^<]+)<\/v>/);
                if (speakerMatch) {
                    speaker = speakerMatch[1];
                    text += speakerMatch[2] + " ";
                } else {
                    text += textLine.replace(/<[^>]+>/g, "") + " ";
                }
                i++;
            }

            const finalText = text.trim();
            if (finalText) {
                result.push({ start, end, text: finalText, speaker });
            }
        } else {
            i++;
        }
    }

    return result;
}

function parsedToPlainText(parsed: ParsedSegment[]) {
    return parsed
        .map((p) => `${p.speaker ? `${p.speaker}: ` : ""}${p.text}`.trim())
        .filter(Boolean)
        .join("\n");
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);

        const ownerEmail = searchParams.get("ownerEmail");
        const meetingSubject = searchParams.get("meetingSubject") || "";
        const joinUrl = searchParams.get("joinUrl");
        const fileId = searchParams.get("fileId"); // transcriptId
        const meetingIdFromFrontend = searchParams.get("meetingId"); // onlineMeetingId
        const meetingDbId = searchParams.get("meetingDbId"); // ✅ NEW
        const persist = searchParams.get("persist") === "true";

        if (!ownerEmail) return NextResponse.json({ error: "Missing ownerEmail parameter" }, { status: 400 });
        if (!fileId) return NextResponse.json({ error: "Missing fileId (transcriptId) parameter" }, { status: 400 });

        // ✅ 1) DB FIRST : si déjà stocké, on renvoie direct (évite Graph pour les participants)
        if (meetingDbId) {
            const m = await prisma.meeting.findUnique({
                where: { id: meetingDbId },
                select: { transcriptRaw: true, fullTranscript: true },
            });

            if (m?.transcriptRaw) {
                return NextResponse.json(m.transcriptRaw);
            }

            // fallback minimal si seulement fullTranscript
            if (m?.fullTranscript) {
                return NextResponse.json({
                    type: "vtt",
                    parsed: m.fullTranscript.split("\n").map((line) => ({
                        timestamp: "",
                        text: line,
                    })),
                    success: true,
                    stats: { lines: m.fullTranscript.split("\n").length, speakers: 0, totalCharacters: m.fullTranscript.length },
                });
            }
        }

        // ✅ 2) Sinon fallback Graph
        const appToken = await getAppAccessToken();
        const appClient = graphClient(appToken);

        let meetingId = meetingIdFromFrontend;
        let transcriptContent: string | null = null;

        if (!meetingId && joinUrl) {
            try {
                const organizer = await appClient.api(`/users/${ownerEmail}`).select("id").get();
                const found = await findMeetingIdByJoinUrl(appClient, organizer.id, joinUrl);
                if (found) meetingId = found;
            } catch (e: any) {
                console.error(`[Transcript] findMeetingId error: ${e?.message ?? e}`);
            }
        }

        if (!meetingId) {
            return NextResponse.json({
                type: "not_available",
                message: "Impossible de trouver l'ID de la réunion.",
                explanation: "La réunion n'a pas pu être localisée dans le système.",
                teamsUrl: joinUrl,
            });
        }

        try {
            transcriptContent = await getTranscriptContent(appClient, appToken, ownerEmail, meetingId, fileId);
        } catch (e: any) {
            const status = e?.status ?? e?.statusCode;

            if (status === 404) {
                return NextResponse.json({
                    type: "not_available",
                    message: "La transcription n'existe plus ou n'est pas accessible.",
                    explanation: "Le fichier de transcription n'a pas pu être trouvé.",
                    teamsUrl: joinUrl,
                });
            }

            if (status === 403) {
                return NextResponse.json({
                    type: "not_accessible",
                    message: "Accès refusé à la transcription via l'API Graph (403).",
                    explanation:
                        "Dans beaucoup de tenants, les participants n'ont pas accès au content via Graph. Solution: DB-first + persist par l’organisateur.",
                    teamsUrl: joinUrl,
                });
            }

            throw e;
        }

        const parsed = transcriptContent ? parseVTTWithEnd(transcriptContent) : [];
        const plainText = parsedToPlainText(parsed);

        const payload = {
            type: "vtt" as const,
            parsed: parsed.map((p) => ({
                timestamp: p.start,
                text: p.text,
                speaker: p.speaker,
            })),
            success: true,
            stats: {
                lines: parsed.length,
                speakers: [...new Set(parsed.map((p) => p.speaker).filter(Boolean))].length,
                totalCharacters: transcriptContent?.length ?? 0,
            },
        };

        // ✅ 3) Persist DB si demandé : update par meetingDbId d'abord (fiable)
        if (persist) {
            try {
                let meetingRowId: string | null = null;

                if (meetingDbId) {
                    const updated = await prisma.meeting.update({
                        where: { id: meetingDbId },
                        data: {
                            transcriptSource: "onlineMeetings",
                            organizerEmail: ownerEmail,
                            transcriptRaw: payload as any,
                            fullTranscript: plainText || transcriptContent || undefined,
                            title: meetingSubject || undefined,
                            onlineMeetingId: meetingId, // ✅ on s'assure aussi de le stocker
                        },
                        select: { id: true },
                    });
                    meetingRowId = updated.id;
                } else {
                    // fallback ancien comportement
                    const updated = await prisma.meeting.update({
                        where: { onlineMeetingId: meetingId },
                        data: {
                            transcriptSource: "onlineMeetings",
                            organizerEmail: ownerEmail,
                            transcriptRaw: payload as any,
                            fullTranscript: plainText || transcriptContent || undefined,
                            title: meetingSubject || undefined,
                        },
                        select: { id: true },
                    });
                    meetingRowId = updated.id;
                }

                if (meetingRowId) {
                    await prisma.transcriptSegment.deleteMany({ where: { meetingId: meetingRowId } });

                    if (parsed.length) {
                        await prisma.transcriptSegment.createMany({
                            data: parsed.map((p) => ({
                                meetingId: meetingRowId!,
                                diarizedSpeaker: p.speaker ?? "Unknown",
                                participantId: null,
                                startMs: tsToMs(p.start),
                                endMs: tsToMs(p.end),
                                text: p.text,
                            })),
                        });
                    }
                }
            } catch (dbErr) {
                console.error("[Transcript] DB persist failed:", dbErr);
            }
        }

        return NextResponse.json(payload);
    } catch (e: any) {
        console.error("\n[Transcript] ❌ ERREUR:", e);
        return NextResponse.json(
            { error: e?.message || "Internal server error", stack: process.env.NODE_ENV === "development" ? e?.stack : undefined },
            { status: 500 }
        );
    }
}
