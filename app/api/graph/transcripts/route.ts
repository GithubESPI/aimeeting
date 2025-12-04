import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const session = await auth();
    const token = session?.accessToken as string | undefined;

    if (!token) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const graphMeetingId = url.searchParams.get("meetingId"); // id Graph (onlineMeetingId)
    const joinUrlParam = url.searchParams.get("joinUrl");     // joinWebUrl
    const dbId = url.searchParams.get("dbId");                // id Prisma (cmi7iu...)

    let finalMeetingId: string | null = graphMeetingId;
    let joinUrl: string | null = joinUrlParam;

    try {
        // 1) Si on reçoit un dbId (ID Prisma), on récupère la réunion en base
        if (dbId) {
            const meeting = await prisma.meeting.findUnique({
                where: { id: dbId },
            });

            if (!meeting) {
                return NextResponse.json(
                    { error: "not_found", detail: "Réunion introuvable en base." },
                    { status: 404 },
                );
            }

            if (meeting.onlineMeetingId) {
                finalMeetingId = meeting.onlineMeetingId;
            }

            if (!finalMeetingId && meeting.joinUrl) {
                joinUrl = meeting.joinUrl;
            }
        }

        // 2) Si on n’a toujours pas de meetingId mais un joinUrl → on résout via Graph
        if (!finalMeetingId && joinUrl) {
            const encoded = joinUrl.replace(/'/g, "''");
            const resolveUrl =
                `https://graph.microsoft.com/beta/me/onlineMeetings` +
                `?$filter=joinWebUrl eq '${encoded}'&$select=id`;

            const r = await fetch(resolveUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const json = await r.json();
            finalMeetingId = json?.value?.[0]?.id ?? null;
        }

        if (!finalMeetingId) {
            return NextResponse.json(
                {
                    error: "missing_meeting_id",
                    detail:
                        "Aucun meetingId Graph trouvé via meetingId, dbId ou joinUrl. Vérifie que la réunion est bien une réunion Teams en ligne.",
                },
                { status: 400 },
            );
        }

        // 3) Récupération des transcriptions pour ce meetingId Graph
        const tUrl =
            `https://graph.microsoft.com/beta/me/onlineMeetings/${encodeURIComponent(
                finalMeetingId,
            )}/transcripts`;

        const t = await fetch(tUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const json = await t.json();

        return NextResponse.json(json, { status: t.status });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);

        return NextResponse.json(
            {
                error: "graph_error",
                hint:
                    "Assure-toi d'utiliser l'endpoint /beta et d'avoir OnlineMeetingTranscript.Read.All + transcription activée pendant la réunion.",
                detail: message,
            },
            { status: 500 },
        );
    }
}
