// app/meetings/teams/teams-selector.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { GenerateSummaryButton } from "@/components/meetings/generate-summary-button";

export type MeetingOption = {
    id: string;
    title: string | null;
    status: string | null;
    startDateTime: string | null; // ISO
    hasGraphTranscript: boolean;
    hasGraphRecording: boolean;
    isOrganizer?: boolean;
};

type Props = {
    meetings: MeetingOption[];
};

// 🔹 Utilitaire pour transformer une date ISO en clé "YYYY-MM"
function monthKey(dateIso: string) {
    const d = new Date(dateIso);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${year}-${month}`; // ex: 2025-11
}

// 🔹 Options fixes pour 2025
const MONTH_OPTIONS_2025 = [
    { value: "all",      label: "Tous les mois" },
    { value: "2025-01",  label: "Janvier 2025" },
    { value: "2025-02",  label: "Février 2025" },
    { value: "2025-03",  label: "Mars 2025" },
    { value: "2025-04",  label: "Avril 2025" },
    { value: "2025-05",  label: "Mai 2025" },
    { value: "2025-06",  label: "Juin 2025" },
    { value: "2025-07",  label: "Juillet 2025" },
    { value: "2025-08",  label: "Août 2025" },
    { value: "2025-09",  label: "Septembre 2025" },
    { value: "2025-10",  label: "Octobre 2025" },
    { value: "2025-11",  label: "Novembre 2025" },
    { value: "2025-12",  label: "Décembre 2025" },
];

export default function TeamsMeetingSelector({ meetings }: Props) {
    const [selectedMonth, setSelectedMonth] = useState<string>("all");
    const [roleFilter, setRoleFilter] = useState<"all" | "organizer" | "participant">("all");
    const [summaryFilter, setSummaryFilter] = useState<"all" | "done" | "todo">("all");

    // 🔹 Application des 3 filtres
    const filteredMeetings = useMemo(() => {
        return meetings.filter((m) => {
            // 1) Filtre mois (sur les valeurs 2025-01, 2025-02, etc.)
            if (selectedMonth !== "all") {
                if (!m.startDateTime) return false;
                if (monthKey(m.startDateTime) !== selectedMonth) {
                    return false;
                }
            }

            // 2) Filtre rôle
            if (roleFilter === "organizer" && !m.isOrganizer) return false;
            if (roleFilter === "participant" && m.isOrganizer) return false;

            // 3) Filtre synthèse
            const isDone = m.status === "summarized" || m.status === "done";
            if (summaryFilter === "done" && !isDone) return false;
            return !(summaryFilter === "todo" && isDone);


        });
    }, [meetings, selectedMonth, roleFilter, summaryFilter]);

    return (
        <section className="space-y-6">
            {/* Header + filtres */}
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-3xl font-schibsted-grotesk font-bold text-white">
                        Réunions Teams
                    </h1>
                    <p className="text-sm text-light-200">
                        Retrouve les réunions dans lesquelles tu es organisateur ou
                        participant et génère une synthèse IA en un clic.
                    </p>
                </div>

                {/* Filtres */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    {/* Mois */}
                    <div className="flex items-center gap-2">
                        <span className="text-light-200 text-[11px] uppercase tracking-wide">
                            Filtrer par mois
                        </span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="rounded-md bg-dark-200 border border-border-dark px-3 py-1.5 text-sm text-light-100 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                            {MONTH_OPTIONS_2025.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Rôle */}
                    <div className="flex items-center gap-2">
                        <span className="text-light-200 text-[11px] uppercase tracking-wide">
                            Rôle
                        </span>
                        <select
                            value={roleFilter}
                            onChange={(e) =>
                                setRoleFilter(e.target.value as "all" | "organizer" | "participant")
                            }
                            className="rounded-md bg-dark-200 border border-border-dark px-3 py-1.5 text-sm text-light-100 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                            <option value="all">Tous</option>
                            <option value="organizer">Organisateur</option>
                            <option value="participant">Participant</option>
                        </select>
                    </div>

                    {/* Synthèse */}
                    <div className="flex items-center gap-2">
                        <span className="text-light-200 text-[11px] uppercase tracking-wide">
                            Synthèse
                        </span>
                        <select
                            value={summaryFilter}
                            onChange={(e) =>
                                setSummaryFilter(e.target.value as "all" | "done" | "todo")
                            }
                            className="rounded-md bg-dark-200 border border-border-dark px-3 py-1.5 text-sm text-light-100 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                            <option value="all">Toutes</option>
                            <option value="done">Synthèse prête</option>
                            <option value="todo">À générer</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Liste des réunions */}
            <div className="space-y-3">
                {filteredMeetings.length === 0 ? (
                    <p className="text-sm text-light-200">
                        Aucune réunion trouvée avec ces filtres.
                    </p>
                ) : (
                    filteredMeetings.map((m) => {
                        const hasTranscript = m.hasGraphTranscript || m.hasGraphRecording;
                        const isDone = m.status === "summarized" || m.status === "done";

                        return (
                            <div
                                key={m.id}
                                className="flex flex-col gap-3 rounded-lg bg-dark-100 border border-border-dark px-4 py-3 md:flex-row md:items-center md:justify-between"
                            >
                                {/* Infos réunion */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link
                                            href={`/meetings/${m.id}`}
                                            className="text-sm font-medium text-white hover:text-primary transition-colors"
                                        >
                                            {m.title || "Réunion sans titre"}
                                        </Link>

                                        {m.isOrganizer && (
                                            <Badge className="bg-primary/10 text-primary border-primary/40 text-[11px]">
                                                ORGANISATEUR
                                            </Badge>
                                        )}

                                        {isDone ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/40 text-[11px]">
                                                Synthèse prête
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/40 text-[11px]">
                                                Synthèse à générer
                                            </Badge>
                                        )}
                                    </div>

                                    <p className="text-xs text-light-200">
                                        {m.startDateTime ? (
                                            format(
                                                new Date(m.startDateTime),
                                                "dd/MM/yyyy · HH:mm",
                                                { locale: fr }
                                            )
                                        ) : (
                                            "Date inconnue"
                                        )}
                                    </p>


                                    <p className="text-xs text-light-200">
                                        {hasTranscript
                                            ? "Transcription OK"
                                            : "Aucune transcription détectée"}
                                    </p>
                                </div>

                                {/* Bouton synthèse */}
                                <div className="flex items-center justify-end gap-2">
                                    <GenerateSummaryButton
                                        meetingId={m.id}
                                        disabled={!hasTranscript}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
