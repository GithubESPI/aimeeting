// app/meetings/teams/TeamsMeetingsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type MeetingItem = {
    id: string;
    title: string | null;
    status: string;
    startDateTime: string | null; // ISO string
    organizerEmail: string | null;
    hasGraphTranscript: boolean;
    hasGraphRecording: boolean;
};

type Props = {
    meetings: MeetingItem[];
    needInitialSync: boolean;
};

export function TeamsMeetingsClient({ meetings, needInitialSync }: Props) {
    const [meetingsState, setMeetingsState] = useState<MeetingItem[]>(meetings);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<
        "all" | "summarized" | "created"
    >("all");
    const [syncing, setSyncing] = useState<boolean>(needInitialSync);

    // 🔁 synchro en arrière-plan à la première visite
    useEffect(() => {
        if (!needInitialSync) return;

        const run = async () => {
            try {
                setSyncing(true);
                const res = await fetch("/api/meetings/sync", { method: "POST" });
                if (!res.ok) throw new Error("Sync failed");
                const data = await res.json();
                if (Array.isArray(data.meetings)) {
                    setMeetingsState(data.meetings);
                }
            } catch (e) {
                console.error("Erreur synchro meetings:", e);
            } finally {
                setSyncing(false);
            }
        };

        run();
    }, [needInitialSync]);

    const filtered = useMemo(() => {
        let list = [...meetingsState];

        if (statusFilter !== "all") {
            list = list.filter((m) => m.status === statusFilter);
        }

        const q = query.trim().toLowerCase();
        if (q) {
            list = list.filter((m) => {
                const title = (m.title ?? "").toLowerCase();
                const org = (m.organizerEmail ?? "").toLowerCase();
                return title.includes(q) || org.includes(q);
            });
        }

        return list;
    }, [meetingsState, query, statusFilter]);

    return (
        <div className="space-y-4">
            {/* Petit bandeau de synchro */}
            {syncing && (
                <div className="flex items-center gap-2 text-xs text-light-200">
                    <span className="h-3 w-3 rounded-full border-2 border-light-200 border-t-blue animate-spin" />
                    <span>Synchronisation des réunions Teams…</span>
                </div>
            )}

            {/* Barre de recherche + filtres */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <input
                        type="text"
                        placeholder="Rechercher par titre ou organisateur..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full rounded-full border border-border-dark bg-dark-100/80 px-4 py-2 text-xs text-light-100 placeholder:text-light-300 focus:outline-none focus:ring-2 focus:ring-blue/60"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-light-300 hover:text-light-100"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="inline-flex items-center gap-1 rounded-full border border-border-dark bg-dark-100/80 p-1 text-[11px]">
                    {[
                        { key: "all", label: "Toutes" },
                        { key: "summarized", label: "Synthétisées" },
                        { key: "created", label: "En attente" },
                    ].map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() =>
                                setStatusFilter(opt.key as "all" | "summarized" | "created")
                            }
                            className={`rounded-full px-3 py-1 transition-colors ${
                                statusFilter === opt.key
                                    ? "bg-blue text-black font-medium"
                                    : "text-light-200 hover:bg-dark-200"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Liste filtrée */}
            {filtered.length === 0 ? (
                <div className="rounded-2xl bg-dark-100 border border-border-dark p-6 text-sm text-light-200">
                    {syncing
                        ? "Synchronisation en cours…"
                        : "Aucune réunion ne correspond à votre recherche."}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map((m) => {
                        const dateLabel = m.startDateTime
                            ? format(new Date(m.startDateTime), "EEEE d MMMM yyyy · HH:mm", {
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

                                    <div className="flex flex-col items-start gap-1 md:items-end">
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ${
                            isSummarized
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                                : "bg-amber-500/10 text-amber-200 border border-amber-500/40"
                        }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {isSummarized
                            ? "Statut : summarized"
                            : `Statut : ${m.status}`}
                    </span>

                                        <span className="inline-flex items-center gap-1 text-[11px] text-light-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Transcription + enregistrement
                    </span>

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
        </div>
    );
}
