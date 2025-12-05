// lib/authOptions.ts
import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import AzureAdProvider from "next-auth/providers/azure-ad";
import type { Account, NextAuthOptions, Profile } from "next-auth";
import { JWT } from "next-auth/jwt";
import { jwtDecode } from "jwt-decode";

type TokenResponse = {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
};

type AADProfile = Profile & {
    preferred_username?: string;
    given_name?: string;
    unique_name?: string;
};

type AADAccount = Account & {
    session_state?: string | null;
};

function getEmailFromProfile(p: AADProfile): string | null {
    return p.email ?? p.preferred_username ?? null;
}

function getNameFromProfile(p: AADProfile, fallbackEmail: string | null): string {
    return p.name ?? p.given_name ?? p.unique_name ?? fallbackEmail ?? "Utilisateur";
}

async function refreshAccessToken(token: any) {
    try {
        if (!token.refreshToken) {
            throw new Error("No refresh token available");
        }

        const params = new URLSearchParams({
            client_id: process.env.AZURE_AD_CLIENT_ID!,
            client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
            // scopes
            scope: "https://graph.microsoft.com/.default offline_access openid profile email",
        });

        const res = await fetch(
            `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
            }
        );

        const data = await res.json();

        if (!res.ok) {
            console.error("Refresh token response error:", data);
            throw new Error(data.error_description || "Failed to refresh token");
        }

        // data.expires_in = durée en secondes
        const accessTokenExpires = Date.now() + data.expires_in * 1000;

        return {
            ...token,
            accessToken: data.access_token,
            accessTokenExpires,
            refreshToken: data.refresh_token ?? token.refreshToken, // on garde l’ancien si pas renvoyé
            error: undefined,
        };
    } catch (error) {
        console.error("Error refreshing access token", error);
        return {
            ...token,
            error: "RefreshAccessTokenError",
        };
    }
}

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },

    providers: [
        AzureAdProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
            authorization: {
                params: {
                    scope: [
                        "openid",
                        "profile",
                        "offline_access",
                        "email",
                        "User.Read",
                        "Calendars.Read",
                        "OnlineMeetings.Read",
                        "OnlineMeetingTranscript.Read.All",
                        "Mail.Send",
                    ].join(" "),
                },
            },
        }),
    ],

    pages: {
        signIn: "/",
        error: "/auth/error",
    },

    debug: process.env.NODE_ENV === "development",

    logger: {
        error(code, metadata) {
            console.error("NextAuth error:", code, metadata);
        },
    },

    callbacks: {
        async signIn({ account, profile }) {
            return true;
        },

        async jwt({ token, account }) {
            // Premier login
            if (account) {
                let roles: string[] = [];

                const idToken = (account as any).id_token as string | undefined;
                if (idToken) {
                    try {
                        const decoded: any = jwtDecode(idToken);
                        const rawRoles =
                            decoded.roles ||
                            decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
                            [];

                        roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
                    } catch (e) {
                        console.warn("[auth] Impossible de décoder id_token pour les rôles :", e);
                    }
                }

                const expiresAtSeconds =
                    (account as any).expires_at ??
                    (account as any).ext_expires_in ??
                    (account as any).expires_in ??
                    3600;

                const accessTokenExpires =
                    typeof expiresAtSeconds === "number"
                        ? expiresAtSeconds * 1000
                        : Date.now() + 60 * 60 * 1000;

                return {
                    ...token,
                    accessToken: (account as any).access_token,
                    accessTokenExpires,
                    roles,
                    // ❌ on ne stocke plus refreshToken dans le JWT
                };
            }

            // Si le token n'est pas expiré on le renvoie tel quel
            if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
                return token;
            }

            // 🔴 Ici, au lieu de tenter un refresh avec refreshToken (qu'on a retiré),
            // on signale simplement qu'il est expiré. Tu pourras gérer ça côté client
            // en forçant une reconnexion si besoin.
            return {
                ...token,
                error: "AccessTokenExpired",
            };
        },

        async session({ session, token }) {
            (session as any).accessToken = token.accessToken as string | undefined;
            (session as any).error = token.error;

            const roles = ((token as any).roles as string[]) ?? [];
            (session.user as any).roles = roles;
            const primaryRole = (roles[0] ?? "Participant").toString();
            (session.user as any).role = primaryRole.toLowerCase();

            return session;
        },
    },

};
