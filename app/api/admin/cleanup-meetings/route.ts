// app/api/admin/cleanup-meetings/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// importe ton auth si tu veux vérifier isAdmin
import {authOptions} from "@/lib/authOptions"; // adapte le chemin
import { getServerSession } from "next-auth";
import {isAdmin} from "@/lib/roles";

export async function POST() {
    const session = await getServerSession(authOptions);

    if (!session || !isAdmin(session)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }


    const result = await prisma.meeting.deleteMany({
        where: {
            OR: [
                { hasGraphTranscript: false },
                { hasGraphRecording: false },
                { transcriptSource: null },
            ],
        },
    });

    return NextResponse.json({ ok: true });
}
