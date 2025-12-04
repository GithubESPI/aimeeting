// app/api/meetings/[id]/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ⚠️ même signature que tes autres routes : params: Promise<{ id: string }>
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    // on "résout" la promesse
    const { id } = await context.params;

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Corps de requête invalide" },
            { status: 400 }
        );
    }

    const summary = body?.summary;
    if (!summary || typeof summary !== "object") {
        return NextResponse.json(
            { error: "Champ `summary` manquant ou invalide" },
            { status: 400 }
        );
    }

    try {
        const meeting = await prisma.meeting.update({
            where: { id },
            data: {
                summaryJson: summary,
                status: "summarized",
            },
        });

        return NextResponse.json({ ok: true, meeting });
    } catch (err: any) {
        console.error("[PATCH /api/meetings/[id]/summary] erreur :", err);

        // on renvoie le message d’erreur exact pour le voir dans le Network / console
        return NextResponse.json(
            {
                error:
                    "Erreur Prisma lors de la mise à jour : " +
                    (err?.message ?? String(err)),
            },
            { status: 500 }
        );
    }
}
