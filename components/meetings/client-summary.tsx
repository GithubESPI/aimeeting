// components/meetings/client-summary.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = any;

type SummaryReadOnlyProps = {
    summary: Summary;
    // 🔥 Participants issus de la BDD (optionnel)
    participants?: string[];
};

function SummaryReadOnly({ summary, participants }: SummaryReadOnlyProps) {
    if (!summary) return null;

    // ✅ On privilégie les participants venant de la BDD,
    // sinon on retombe sur ceux stockés dans la synthèse
    const participantsToShow: string[] =
        participants && participants.length > 0
            ? participants
            : summary.participants ?? [];

    return (
        <div className="space-y-6">
            {/* Titre */}
            {summary.titre && (
                <h3 className="text-lg font-semibold text-white">{summary.titre}</h3>
            )}

            {/* Résumé court */}
            {summary.resume && (
                <div className="space-y-1">
                    <h4 className="font-semibold text-white text-sm">Résumé rapide</h4>
                    <p className="text-sm text-light-100 leading-relaxed">
                        {summary.resume}
                    </p>
                </div>
            )}

            {/* Contenu détaillé */}
            {summary.contenu_detaille && (
                <div className="space-y-1">
                    <h4 className="font-semibold text-white text-sm">Contenu détaillé</h4>
                    <p className="text-sm text-light-100 leading-relaxed whitespace-pre-wrap">
                        {summary.contenu_detaille}
                    </p>
                </div>
            )}

            {/* Décisions */}
            {summary.decisions?.length > 0 && (
                <div>
                    <h4 className="font-semibold text-white text-sm mb-2">Décisions</h4>
                    <ul className="list-disc list-inside text-light-100 text-sm space-y-1">
                        {summary.decisions.map((d: string, i: number) => (
                            <li key={i}>{d}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tâches */}
            {summary.actions?.length > 0 && (
                <div>
                    <h4 className="font-semibold text-white text-sm mb-2">
                        Tâches à réaliser
                    </h4>
                    <ul className="space-y-2 text-sm text-light-100">
                        {summary.actions.map((a: any, i: number) => (
                            <li
                                key={i}
                                className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 rounded-md bg-dark-200 px-3 py-2"
                            >
                                <span>{a.tache}</span>
                                <div className="flex flex-wrap gap-2 text-xs text-light-200">
                                    {a.owner && (
                                        <span className="rounded-full bg-dark-300 px-2 py-0.5">
                      Responsable : {a.owner}
                    </span>
                                    )}
                                    {a.deadline && (
                                        <span className="rounded-full bg-dark-300 px-2 py-0.5">
                      Échéance : {a.deadline}
                    </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Participants */}
            {participantsToShow.length > 0 && (
                <div>
                    <h4 className="font-semibold text-white text-sm mb-2">
                        Participants
                    </h4>
                    <ul className="list-disc list-inside text-light-100 text-sm space-y-1">
                        {participantsToShow.map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export function ClientSummary({
                                  meetingId,
                                  initialSummary,
                                  participants,
                                  isOrganizer,
                              }: {
    meetingId: string;
    initialSummary: Summary;
    participants?: string[];
    isOrganizer: boolean; // ✅ NEW
}) {

    const router = useRouter();
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!isOrganizer && editMode) {
        setEditMode(false);
    }
    // clone profond de la synthèse pour ne pas muter la prop
    const [summaryDraft, setSummaryDraft] = useState<Summary>(() =>
        JSON.parse(JSON.stringify(initialSummary ?? {}))
    );

    // Helpers d’update
    const updateField = (field: string, value: any) => {
        setSummaryDraft((prev: Summary) => ({
            ...prev,
            [field]: value,
        }));
    };

    const updateDecision = (index: number, value: string) => {
        setSummaryDraft((prev: Summary) => {
            const decisions = Array.isArray(prev.decisions)
                ? [...prev.decisions]
                : [];
            decisions[index] = value;
            return { ...prev, decisions };
        });
    };

    const addDecision = () => {
        setSummaryDraft((prev: Summary) => ({
            ...prev,
            decisions: [...(prev.decisions ?? []), ""],
        }));
    };

    const removeDecision = (index: number) => {
        setSummaryDraft((prev: Summary) => {
            const decisions = Array.isArray(prev.decisions)
                ? [...prev.decisions]
                : [];
            decisions.splice(index, 1);
            return { ...prev, decisions };
        });
    };

    const updateAction = (
        index: number,
        field: "tache" | "owner" | "deadline",
        value: string
    ) => {
        setSummaryDraft((prev: Summary) => {
            const actions = Array.isArray(prev.actions) ? [...prev.actions] : [];
            const current = actions[index] ?? {};
            actions[index] = { ...current, [field]: value };
            return { ...prev, actions };
        });
    };

    const addAction = () => {
        setSummaryDraft((prev: Summary) => ({
            ...prev,
            actions: [...(prev.actions ?? []), { tache: "", owner: "", deadline: "" }],
        }));
    };

    const removeAction = (index: number) => {
        setSummaryDraft((prev: Summary) => {
            const actions = Array.isArray(prev.actions) ? [...prev.actions] : [];
            actions.splice(index, 1);
            return { ...prev, actions };
        });
    };

    const handleCancel = () => {
        setSummaryDraft(JSON.parse(JSON.stringify(initialSummary ?? {})));
        setEditMode(false);
        setError(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const res = await fetch(`/api/meetings/${meetingId}/summary`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary: summaryDraft }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error("Erreur API summary:", res.status, text);
                let data: any = {};
                try {
                    data = JSON.parse(text);
                } catch {}
                throw new Error(data.error || "Erreur lors de la sauvegarde");
            }

            setEditMode(false);
            router.refresh();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Erreur inconnue");
        } finally {
            setSaving(false);
        }
    };

    // ---- Rendu ----
    if (!editMode) {
        return (
            <div className="space-y-4">
                {isOrganizer && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setEditMode(true)}
                            className="inline-flex items-center rounded-md border border-border-dark bg-dark-200 px-3 py-1 text-xs text-light-100 hover:bg-dark-300 transition-colors"
                        >
                            Modifier la synthèse
                        </button>
                    </div>
                )}
                {/* 🔥 on passe les participants pour l’affichage */}
                <SummaryReadOnly summary={summaryDraft} participants={participants} />
            </div>
        );
    }

    // Mode édition
    return (
        <form onSubmit={handleSave} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-light-200">
                    Tu modifies la synthèse générée. Les changements seront sauvegardés
                    dans le compte-rendu et dans le PDF.
                </p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="inline-flex items-center rounded-md border border-border-dark bg-dark-200 px-3 py-1 text-xs text-light-100 hover:bg-dark-300 transition-colors"
                        disabled={saving}
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        className="inline-flex items-center rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-60"
                        disabled={saving}
                    >
                        {saving ? "Enregistrement..." : "Enregistrer la synthèse"}
                    </button>
                </div>
            </div>

            {error && <p className="text-xs text-red-300">{error}</p>}

            {/* Titre */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-light-200">
                    Titre de la synthèse
                </label>
                <input
                    type="text"
                    className="w-full rounded-md border border-border-dark bg-dark-200 px-3 py-2 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={summaryDraft.titre ?? ""}
                    onChange={(e) => updateField("titre", e.target.value)}
                />
            </div>

            {/* Résumé */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-light-200">
                    Résumé rapide
                </label>
                <textarea
                    className="w-full min-h-[90px] rounded-md border border-border-dark bg-dark-200 px-3 py-2 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={summaryDraft.resume ?? ""}
                    onChange={(e) => updateField("resume", e.target.value)}
                />
            </div>

            {/* Contenu détaillé */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-light-200">
                    Contenu détaillé
                </label>
                <textarea
                    className="w-full min-h-[160px] rounded-md border border-border-dark bg-dark-200 px-3 py-2 text-sm text-light-100 whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={summaryDraft.contenu_detaille ?? ""}
                    onChange={(e) => updateField("contenu_detaille", e.target.value)}
                />
            </div>

            {/* Décisions */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-light-200">
                        Décisions
                    </label>
                    <button
                        type="button"
                        onClick={addDecision}
                        className="text-[11px] text-indigo-300 hover:text-indigo-200"
                    >
                        + Ajouter une décision
                    </button>
                </div>

                {(summaryDraft.decisions ?? []).map((d: string, idx: number) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 rounded-md border border-border-dark bg-dark-200 px-3 py-2 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            value={d}
                            onChange={(e) => updateDecision(idx, e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => removeDecision(idx)}
                            className="text-[11px] text-red-300 hover:text-red-200"
                        >
                            Supprimer
                        </button>
                    </div>
                ))}
            </div>

            {/* Tâches */}
            <div className="space-y-2">
                <div className="flex items-center justify_between">
                    <label className="text-xs font-medium text-light-200">
                        Tâches à réaliser
                    </label>
                    <button
                        type="button"
                        onClick={addAction}
                        className="text-[11px] text-indigo-300 hover:text-indigo-200"
                    >
                        + Ajouter une tâche
                    </button>
                </div>

                {(summaryDraft.actions ?? []).map((a: any, idx: number) => (
                    <div
                        key={idx}
                        className="space-y-1 rounded-md bg-dark-200 px-3 py-2 border border-border-dark"
                    >
                        <input
                            type="text"
                            placeholder="Tâche"
                            className="w-full rounded-md bg-dark-300 px-2 py-1 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            value={a?.tache ?? ""}
                            onChange={(e) => updateAction(idx, "tache", e.target.value)}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                type="text"
                                placeholder="Responsable"
                                className="flex-1 rounded-md bg-dark-300 px-2 py-1 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                value={a?.owner ?? ""}
                                onChange={(e) => updateAction(idx, "owner", e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="Échéance"
                                className="flex-1 rounded-md bg-dark-300 px-2 py-1 text-sm text-light-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                value={a?.deadline ?? ""}
                                onChange={(e) => updateAction(idx, "deadline", e.target.value)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeAction(idx)}
                            className="mt-1 text-[11px] text-red-300 hover:text-red-200"
                        >
                            Supprimer cette tâche
                        </button>
                    </div>
                ))}
            </div>
        </form>
    );
}
