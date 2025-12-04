// app/api/meetings/teams/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const meetings = await prisma.meeting.findMany({
        where: { graphId: { not: null } },
        orderBy: { startDateTime: "desc" },
        take: 50,
        select: {
            id: true,
            title: true,
            startDateTime: true,
            status: true,
        },
    });

    return NextResponse.json(meetings);
}
