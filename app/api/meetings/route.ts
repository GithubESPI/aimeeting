// app/api/meetings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { isAdmin, isOrganizer } from "@/lib/roles";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();

    const admin = isAdmin(session);
    const organizerRole = isOrganizer(session);

    // 🔒 Seuls ADMIN et ORGANIZER peuvent créer une réunion
    if (!admin && !organizerRole) {
        return NextResponse.json(
            { error: "Seuls les administrateurs et organisateurs peuvent créer une réunion." },
            { status: 403 }
        );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
        return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
    }

    const {
        title,
        organizerEmail,
        localRecordingUrl,
        notes,
        type,
    }: {
        title?: string;
        organizerEmail?: string | null;
        localRecordingUrl?: string | null;
        notes?: string | null;
        type?: string | null;
    } = body;

    if (!title || title.trim() === "") {
        return NextResponse.json(
            { error: "Le titre est obligatoire." },
            { status: 400 }
        );
    }

    try {
        const meeting = await prisma.meeting.create({
            data: {
                title: title.trim(),
                // si organizerEmail n'est pas fourni, on prend l'utilisateur connecté
                organizerEmail: (organizerEmail ?? email) || null,
                audioUrl: localRecordingUrl ?? null,
                status: "created",
                // meeting_type: type ?? "presentiel",
            },
        });

        return NextResponse.json(meeting);
    } catch (e: any) {
        console.error("POST /api/meetings error", e);
        return NextResponse.json(
            { error: "Erreur serveur lors de la création de la réunion." },
            { status: 500 }
        );
    }
}

// 🔹 GET pour lister les réunions (filtré selon le rôle)
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();
    const admin = isAdmin(session);

    const meetings = await prisma.meeting.findMany({
        where: admin
            ? {} // 👑 Admin → toutes les réunions
            : {
                OR: [
                    // 👉 Réunions où l’utilisateur est organisateur
                    { organizerEmail: email },

                    // 👉 Réunions où l’utilisateur est participant
                    {
                        attendees: {
                            some: {
                                participant: {
                                    email,
                                },
                            },
                        },
                    },
                ],
            },
        orderBy: { createdAt: "desc" },
        take: 100,
    });

    return NextResponse.json(meetings);
}
