// app/api/meetings/[id]/debug-transcript/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

type Params = {
    params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, context: Params) {
    const { id } = await context.params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({
        where: { id },
    });

    if (!meeting) {
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    let parsed: any = null;
    let contentUrl: string | null = null;
    let parseError: string | null = null;

    if (typeof meeting.transcriptRaw === "string") {
        try {
            parsed = JSON.parse(meeting.transcriptRaw);
            contentUrl =
                parsed.transcriptContentUrl ??
                parsed.contentUrl ??
                null;
        } catch (e: any) {
            parseError = String(e);
        }
    }

    return NextResponse.json({
        prismaId: meeting.id,
        graphId: meeting.graphId,
        onlineMeetingId: meeting.onlineMeetingId,
        hasGraphTranscript: meeting.hasGraphTranscript,
        transcriptSource: meeting.transcriptSource,

        // Infos brutes
        transcriptRawType: typeof meeting.transcriptRaw,
        transcriptRawPreview:
            typeof meeting.transcriptRaw === "string"
                ? meeting.transcriptRaw.slice(0, 400)
                : null,

        // Infos sur le JSON parsé
        parsedKeys: parsed ? Object.keys(parsed) : null,
        contentUrl,
        parseError,

        // État de fullTranscript
        fullTranscriptLength: meeting.fullTranscript
            ? meeting.fullTranscript.length
            : 0,
        fullTranscriptPreview: meeting.fullTranscript
            ? meeting.fullTranscript.slice(0, 400)
            : null,
    });
}
