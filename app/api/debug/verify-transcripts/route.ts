// app/api/debug/verify-transcripts/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth"; // ou ton helper maison

import { verifyMeetingsTranscripts } from "@/lib/graph/verifyMeetings";
import {authOptions} from "@/lib/authOptions";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const results = await verifyMeetingsTranscripts(session);

    // Pour vérifier facilement :
    // - OK = DB et Graph d'accord
    // - mismatch = à investiguer
    return NextResponse.json({
        count: results.length,
        ok: results.filter(r => r.dbHasTranscript === r.graphHasTranscript),
        mismatches: results.filter(r => r.dbHasTranscript !== r.graphHasTranscript),
    });
}
