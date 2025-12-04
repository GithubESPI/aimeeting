// lib/auth.ts
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";

/** Récupère la session côté serveur (App Router). */
export const auth = () => getServerSession(authOptions);

/** Helper pratique : récupère l'access token ou retourne undefined. */
export const getAccessToken = async (): Promise<string | undefined> => {
    const session = await auth();
    return session?.accessToken as string | undefined;
};

/** Helper optionnel : lève une erreur si non authentifié. */
export const requireSession = async (): Promise<Session> => {
    const session = await auth();
    if (!session) throw new Error("Unauthenticated");
    return session;
};
