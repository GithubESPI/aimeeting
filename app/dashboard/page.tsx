// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import DashboardClient from "@/app/dashboard/dashboard-client";
import { isAdmin } from "@/lib/roles";
import type { Prisma } from "@prisma/client";

const PROCESSED_STATUSES = ["summarized"];

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/");
    }

    const email = session.user.email;
    const admin = isAdmin(session);

    // 🔹 Portée de visibilité :
    // - admin : tout le tenant
    // - user  : réunions où il est organisateur OU participant
    const scopeFilter: Prisma.MeetingWhereInput = admin
        ? {} // aucune restriction par email
        : {
            OR: [
                {
                    organizerEmail: {
                        equals: email,
                        mode: "insensitive" as const,
                    },
                },
                {
                    attendees: {
                        some: {
                            participant: {
                                email: {
                                    equals: email,
                                    mode: "insensitive" as const,
                                },
                            },
                        },
                    },
                },
            ],
        };

    // 🔹 Filtre "réunion prête" : transcription + enregistrement Teams
    const readyFilter: Prisma.MeetingWhereInput = {
        transcriptSource: "graph",
        hasGraphTranscript: true,
        hasGraphRecording: true,
    };

    // ─────────────────────────────
    // 📊 STATISTIQUES DASHBOARD
    // ─────────────────────────────
    const [total, processed, readyToSummarize] = await Promise.all([
        prisma.meeting.count({
            where: scopeFilter,
        }),
        prisma.meeting.count({
            where: {
                ...scopeFilter,
                status: { in: PROCESSED_STATUSES },
            },
        }),
        prisma.meeting.count({
            where: {
                ...scopeFilter,
                status: "created",
                ...readyFilter,
            },
        }),
    ]);

    const pending = total - processed;

    // ─────────────────────────────
    // 🧠 RÉUNIONS AVEC SYNTHÈSE IA PRÊTE
    // ─────────────────────────────
    const meetings = await prisma.meeting.findMany({
        where: {
            ...scopeFilter,
            ...readyFilter,
            status: { in: PROCESSED_STATUSES },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            graphId: true,
            summaryJson: true,
        },
    });

    console.log("📌 Meetings trouvées par Prisma pour le dashboard :", meetings);

    return (
        <DashboardClient
            user={{
                name: session.user.name ?? "",
                email: session.user.email ?? "",
                image: session.user.image ?? null,
            }}
            meetings={meetings}
            stats={{ total, processed, pending, readyToSummarize }}
        />
    );
}
