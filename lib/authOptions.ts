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

async function refreshAccessToken(token: JWT) {
    try {
        // 1) Récupérer le refresh_token depuis la BDD (table Account)
        const userId = token.sub;
        if (!userId) {
            throw new Error("No user id on token");
        }

        const azureAccount = await prisma.account.findFirst({
            where: {
                userId,
                provider: "azure-ad",
            },
        });

        const refreshToken =
            azureAccount?.refresh_token || (token as any).refreshToken;

        if (!refreshToken) {
            throw new Error("No refresh token available");
        }

        const params = new URLSearchParams({
            client_id: process.env.AZURE_AD_CLIENT_ID!,
            client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
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

        const accessTokenExpires = Date.now() + data.expires_in * 1000;

        return {
            ...token,
            accessToken: data.access_token,
            accessTokenExpires,
            // on NE stocke plus refreshToken dans le cookie
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

    debug: false,

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
            if (account) {
                const expiresIn =
                    (account as any).expires_in ??
                    (account as any).ext_expires_in ??
                    3600;

                return {
                    ...token,
                    accessToken: (account as any).access_token,
                    accessTokenExpires: Date.now() + expiresIn * 1000,
                    error: undefined,
                };
            }

            if (
                typeof token.accessTokenExpires === "number" &&
                Date.now() < token.accessTokenExpires
            ) {
                return token;
            }

            const refreshed = await refreshAccessToken(token);
            return refreshed;
        },
        async session({ session, token }) {
            (session as any).accessToken = token.accessToken;
            (session as any).error = token.error;
            return session;
        }

    }



};
