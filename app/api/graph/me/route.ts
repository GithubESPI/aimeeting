import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
        return NextResponse.json(
            { error: "Pas de accessToken dans la session" },
            { status: 401 }
        );
    }

    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
            Authorization: `Bearer ${session.accessToken as string}`,
        },
    });

    const data = await res.json();

    return NextResponse.json({
        ok: res.ok,
        status: res.status,
        data,
    });
}
