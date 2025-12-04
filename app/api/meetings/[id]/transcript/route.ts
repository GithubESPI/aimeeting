// app/api/meetings/[id]/transcript/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { id: string };

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<RouteParams> } // 👈 important
) {
    const { id } = await context.params; // 👈 on await les params

    try {
        const body = (await req.json()) as {
            transcript?: string;
            audioUrl?: string;
        };

        const meeting = await prisma.meeting.update({
            where: { id },
            data: {
                transcript: body.transcript ?? undefined,
                audioUrl: body.audioUrl ?? undefined,
                transcriptSource: body.transcript ? "whisper" : undefined,
            },
            select: { id: true },
        });

        return NextResponse.json({ ok: true, meetingId: meeting.id });
    } catch (error) {
        console.error("Transcript PATCH error", error);
        return NextResponse.json(
            { error: "Failed to update transcript" },
            { status: 500 }
        );
    }
}
