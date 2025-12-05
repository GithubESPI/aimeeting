"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncMeetingsButton() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleClick = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/meetings/sync", {
                method: "POST",
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                console.error("Erreur synchro meetings:", body);
                alert(body?.error ?? "Erreur lors de la synchronisation des réunions.");
            } else {
                // ⚡ rechargement des données côté serveur
                router.refresh();
            }
        } catch (e) {
            console.error(e);
            alert("Erreur réseau lors de la synchronisation.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className="inline-flex items-center rounded-full bg-dark-200/80 px-4 py-2 text-xs font-medium text-light-100 border border-border-dark hover:bg-dark-200 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
            {loading ? "Synchronisation..." : "Synchroniser les réunions"}
        </button>
    );
}
