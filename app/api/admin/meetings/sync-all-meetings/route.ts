// app/api/admin/sync-all-meetings/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isAdmin } from "@/lib/roles";
import { syncAllMeetingsAppOnly } from "@/lib/graph/syncAllMeetings";
import { syncAdminMeetings } from "@/lib/graph/syncAdminMeetings";
import { prisma } from "@/lib/prisma";

export async function POST() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (!isAdmin(session)) {
        return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    try {
        // 1️⃣ Remplir Prisma avec toutes les réunions en ligne du tenant
        await syncAllMeetingsAppOnly();

        // 2️⃣ Enrichir avec onlineMeetingId + hasGraphTranscript / hasGraphRecording
        const res = await syncAdminMeetings();
        console.log("[admin sync] meetings enrichis:", res);

        // 3️⃣ (optionnel) ne garder en BDD que les meetings qui ont transcript ET recording
        await prisma.meeting.deleteMany({
            where: {
                OR: [
                    { hasGraphTranscript: false },
                    { hasGraphRecording: false },
                ],
            },
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("Erreur syncAllMeetings admin", e);
        return NextResponse.json(
            { error: "Erreur lors de la synchronisation globale" },
            { status: 500 }
        );
    }
}
