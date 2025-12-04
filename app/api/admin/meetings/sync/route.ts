// app/api/admin/meetings/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { syncAdminMeetings } from "@/lib/graph/syncAdminMeetings";

export async function POST(_req: NextRequest) {
    // 1) Auth NextAuth
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Vérifier que l'utilisateur est admin dans Prisma
    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, isAdmin: true },
    });

    if (!user || !user.isAdmin) {
        return NextResponse.json(
            { error: "Forbidden – admin requis" },
            { status: 403 }
        );
    }

    // 3) Lancer la sync admin avec token application
    try {
        const result = await syncAdminMeetings();
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        console.error("[/api/admin/meetings/sync] Erreur:", e);
        return NextResponse.json(
            { error: "Erreur lors de la synchronisation admin" },
            { status: 500 }
        );
    }
}
