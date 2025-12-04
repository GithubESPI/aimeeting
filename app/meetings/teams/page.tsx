import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { syncTeamsMeetingsForSession } from "@/lib/graph/syncTeamsMeetings";
import { isAdmin } from "@/lib/roles";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { AdminSyncButton } from "@/components/admin/AdminSyncButton";

export default async function TeamsMeetingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/");
    }

    const email = session.user.email.toLowerCase();
    const admin = isAdmin(session);

    // 🔁 Synchro de tes réunions Teams (utilisateur connecté)
    await syncTeamsMeetingsForSession(session);

    const roleLabel = admin
        ? "Admin · toutes les réunions avec transcription + enregistrement"
        : "Utilisateur · uniquement mes réunions avec transcription + enregistrement";

    const baseFilter = {
        transcriptSource: "graph",
        hasGraphTranscript: true,
        hasGraphRecording: true,
    } as const;

    const meetings = await prisma.meeting.findMany({
        where: admin
            ? {
                ...baseFilter,
            }
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
        include: {
            attendees: { include: { participant: true } },
        },
        take: 100,
    });

    const total = meetings.length;
    const summarized = meetings.filter((m) => m.status === "summarized").length;

    return (
        <section className="space-y-6">
            {/* Bandeau titre */}
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

                    {/* Bouton admin */}

                </div>

                {/* Petit résumé chiffré */}
                <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-light-200">
          <span className="rounded-full bg-dark-200/80 px-3 py-1">
            {total} réunion(s) prête(s) (transcription + enregistrement)
          </span>
                    <span className="rounded-full bg-dark-200/80 px-3 py-1">
            {summarized} déjà synthétisée(s) par l&apos;IA
          </span>
                </div>
            </header>

            {/* Liste des réunions */}
            {meetings.length === 0 ? (
                <div className="rounded-2xl bg-dark-100 border border-border-dark p-6 text-sm text-light-200 shadow-inner">
                    Aucune réunion trouvée avec{" "}
                    <strong>transcription ET enregistrement</strong>.
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {meetings.map((m) => {
                        const dateLabel = m.startDateTime
                            ? format(m.startDateTime, "EEEE d MMMM yyyy · HH:mm", {
                                locale: fr,
                            })
                            : "Date non renseignée";

                        const isSummarized = m.status === "summarized";

                        return (
                            <a
                                key={m.id}
                                href={`/meetings/${m.id}`}
                                className="group block rounded-2xl bg-gradient-to-br from-dark-100 via-dark-100 to-dark-200 border border-border-dark/80 px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:border-blue/70 hover:bg-dark-200/90"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    {/* Colonne gauche : titre + meta */}
                                    <div className="space-y-1">
                                        <h2 className="text-sm font-semibold text-white md:text-[15px]">
                                            {m.title || "Réunion sans titre"}
                                        </h2>
                                        <p className="text-xs text-light-200">{dateLabel}</p>

                                        {m.organizerEmail && (
                                            <p className="text-[11px] text-light-200">
                        <span className="font-medium text-light-100">
                          Organisateur :
                        </span>{" "}
                                                {m.organizerEmail}
                                            </p>
                                        )}
                                    </div>

                                    {/* Colonne droite : statut + indicateurs */}
                                    <div className="flex flex-col items-start gap-1 md:items-end">
                                        {/* Statut */}
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ${
                                                isSummarized
                                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                                                    : "bg-amber-500/10 text-amber-200 border border-amber-500/40"
                                            }`}
                                        >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                            {isSummarized ? "Statut : summarized" : `Statut : ${m.status}`}
                    </span>

                                        {/* Indicateur transcript/recording */}
                                        <span className="inline-flex items-center gap-1 text-[11px] text-light-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Transcription + enregistrement
                    </span>

                                        {/* Hint sur le hover */}
                                        <span className="mt-1 text-[10px] text-light-200/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      Cliquer pour ouvrir le détail et la synthèse IA
                    </span>
                                    </div>
                                </div>
                            </a>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
