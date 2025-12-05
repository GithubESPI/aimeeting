// app/meetings/teams/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TeamsMeetingsClient } from "./TeamsMeetingsClient";

const SYNC_FRESHNESS_MINUTES = 10;

async function shouldSyncMeetings(email: string) {
    const now = Date.now();
    const freshnessMs = SYNC_FRESHNESS_MINUTES * 60 * 1000;

    const lastMeeting = await prisma.meeting.findFirst({
        where: {
            OR: [
                { organizerEmail: email },
                {
                    attendees: {
                        some: { participant: { email } },
                    },
                },
            ],
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
    });

    if (!lastMeeting) return true;
    return now - lastMeeting.updatedAt.getTime() > freshnessMs;
}

export default async function TeamsMeetingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/");
    }

    const email = session.user.email.toLowerCase();
    const admin = isAdmin(session);

    const needInitialSync = await shouldSyncMeetings(email);

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

    const total = mapped.length;
    const summarized = mapped.filter((m) => m.status === "summarized").length;

    const roleLabel = admin
        ? "Admin · toutes les réunions avec transcription + enregistrement"
        : "Utilisateur · uniquement mes réunions avec transcription + enregistrement";

    return (
        <section className="space-y-6">
            <header className="rounded-2xl border border-border-dark bg-gradient-to-br from-dark-100/90 via-dark-100/70 to-dark-200/90 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold text-white">Réunions Teams</h1>
                        <p className="text-sm text-light-200">
                            Synchronisation et vue d&apos;ensemble des réunions Teams avec
                            transcription et enregistrement.
                        </p>
                        <div className="inline-flex items-center gap-2 rounded-full bg-dark-200/80 px-3 py-1 text-[11px] text-light-100 border border-border-dark">
              <span className="inline-flex h-5 items-center rounded-full bg-rose-500/20 px-2 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                {admin ? "Admin" : "Utilisateur"}
              </span>
                            <span>{roleLabel}</span>
                        </div>
                    </div>

                    <div className="mt-3 md:mt-0">
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center rounded-full bg-dark-200/80 px-4 py-2 text-xs font-medium text-light-100 border border-border-dark hover:bg-dark-200 hover:text-white transition-colors"
                        >
                            ← Retour au tableau de bord
                        </Link>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-light-200">
          <span className="rounded-full bg-dark-200/80 px-3 py-1">
            {total} réunion(s) prête(s) (transcription + enregistrement)
          </span>
                    <span className="rounded-full bg-dark-200/80 px-3 py-1">
            {summarized} déjà synthétisée(s) par l&apos;IA
          </span>
                </div>
            </header>

            <TeamsMeetingsClient meetings={mapped} needInitialSync={needInitialSync} />
        </section>
    );
}
