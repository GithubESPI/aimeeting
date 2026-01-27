// app/api/meetings/by-graph-id/[graphId]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { graphId: string } }
) {
    try {
        const { graphId } = params;

        const meeting = await prisma.meeting.findUnique({
            where: { graphId },
            select: { id: true },
        });

        if (!meeting) {
            return NextResponse.json(
                { error: "Réunion non trouvée" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            meetingId: meeting.id,
        });
    } catch (e: any) {
        console.error("[API] /api/meetings/by-graph-id/[graphId] error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}