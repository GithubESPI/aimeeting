// app/api/meetings/sync/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { syncTeamsMeetingsForSession } from "@/lib/graph/syncTeamsMeetings";
import { isAdmin } from "@/lib/roles";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();
    const admin = isAdmin(session);

    // 🔁 synchro réelle ici (mais plus bloquante pour le SSR)
    await syncTeamsMeetingsForSession(session);

    const baseFilter = {
        transcriptSource: "graph",
        hasGraphTranscript: true,
        hasGraphRecording: true,
    } as const;

    const meetings = await prisma.meeting.findMany({
        where: admin
            ? { ...baseFilter }
            : {
                ...baseFilter,
                OR: [
                    { organizerEmail: email },
                    {
                        attendees: {
                            some: { participant: { email } },
                        },
                    },
                ],
            },
        orderBy: { startDateTime: "desc" },
        select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            organizerEmail: true,
            hasGraphTranscript: true,
            hasGraphRecording: true,
        },
        take: 100,
    });

    const mapped = meetings.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        startDateTime: m.startDateTime ? m.startDateTime.toISOString() : null,
        organizerEmail: m.organizerEmail,
        hasGraphTranscript: m.hasGraphTranscript,
        hasGraphRecording: m.hasGraphRecording,
    }));

    return NextResponse.json({ meetings: mapped });
}
