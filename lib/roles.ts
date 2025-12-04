// lib/roles.ts
import { Session } from "next-auth";

export function getUserRoles(session: Session | null) {
    return ((session?.user as any)?.roles as string[]) ?? [];
}

export function isAdmin(session: Session | null) {
    return getUserRoles(session).map(r => r.toLowerCase()).includes("admin");
}

export function isOrganizer(session: Session | null) {
    return getUserRoles(session).map(r => r.toLowerCase()).includes("organizer");
}

export function isParticipant(session: Session | null) {
    return getUserRoles(session).map(r => r.toLowerCase()).includes("participant");
}

// lib/roles.ts
export function isAdminEmail(email?: string | null): boolean {
    if (!email) return false;

    const list = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

    return list.includes(email.toLowerCase());
}

