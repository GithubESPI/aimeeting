// components/admin/AdminSyncButton.tsx
"use client";

export function AdminSyncButton() {
    const onClick = async () => {
        await fetch("/api/admin/sync-all-meetings", { method: "POST" });
        // éventuellement: revalidation / refresh
    };

    return (
        <button onClick={onClick} className="...">
            Synchroniser toutes les réunions (admin)
        </button>
    );
}
