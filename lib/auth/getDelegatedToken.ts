
// lib/auth/getDelegatedToken.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function getDelegatedAccessToken(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    return (session as any)?.accessToken ?? null;
}
