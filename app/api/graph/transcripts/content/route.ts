// app/api/graph/transcripts/content/route.ts
import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const session = await auth();
    const token = session?.accessToken as string | undefined;
    if (!token) return new Response("Unauthorized", { status: 401 });

    const meetingId = req.nextUrl.searchParams.get("meetingId");
    const transcriptId = req.nextUrl.searchParams.get("transcriptId");
    const format = req.nextUrl.searchParams.get("format") ?? "text/vtt";

    if (!meetingId || !transcriptId)
        return new Response("meetingId/transcriptId manquant(s)", {
            status: 400,
        });

    const url =
        `https://graph.microsoft.com/beta/me/onlineMeetings/${encodeURIComponent(
            meetingId
        )}` +
        `/transcripts/${encodeURIComponent(
            transcriptId
        )}/content?format=${encodeURIComponent(format)}`;

    const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: format },
        cache: "no-store",
    });

    if (!r.ok) return new Response(await r.text(), { status: r.status });

    const body = await r.text();

    return new Response(body, { status: 200, headers: { "Content-Type": format } });
}
