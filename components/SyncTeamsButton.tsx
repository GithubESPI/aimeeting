"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SyncTeamsButton() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleClick = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/graph/teams-sync", {
                method: "POST",
            });
            const data = await res.json();

            if (!res.ok) {
                setMessage(`Erreur : ${data.error ?? "appel Graph"}`);
            } else {
                setMessage(`Synchronisation ok – réunions importées : ${data.imported}`);
            }
        } catch (e) {
            setMessage("Erreur réseau");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <Button onClick={handleClick} disabled={loading}>
                {loading ? "Synchronisation..." : "Synchroniser avec Teams"}
            </Button>
            {message && (
                <p className="text-xs text-slate-500">
                    {message}
                </p>
            )}
        </div>
    );
}
