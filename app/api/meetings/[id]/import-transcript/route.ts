//app/api/meetings/[id]/import-transcript/route.ts
import { prisma } from "@/lib/prisma";
import { fetchFullTranscript } from "@/lib/graph/fetchTranscript";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const meeting = await prisma.meeting.findUnique({
        where: { id },
    });

    if (!meeting?.transcriptRaw) {
        return new Response("Aucun transcriptRaw", { status: 400 });
    }

    const raw = meeting.transcriptRaw as any;

    const transcriptUrl = raw.transcriptContentUrl;
    if (!transcriptUrl) {
        return new Response("transcriptContentUrl manquant", { status: 400 });
    }

    const full = await fetchFullTranscript(transcriptUrl);

    if (!full) {
        return new Response("Impossible de télécharger le transcript", { status: 400 });
    }

    await prisma.meeting.update({
        where: { id },
        data: { fullTranscript: full },
    });

    return Response.json({ success: true });
}
