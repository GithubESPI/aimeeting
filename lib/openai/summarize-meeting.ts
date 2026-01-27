// app/api/ai/meeting-summary/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set in environment");
    return new OpenAI({ apiKey });
}

type ReqBody = {
    title: string;
    startISO?: string | null;          // ex: meeting.start
    endISO?: string | null;            // ex: meeting.end
    participants?: string[];           // ex: ["Leïla VAUGHN", "Andy VESPUCE", ...]
    transcriptText: string;            // texte brut (ex: "Speaker: bla bla\nSpeaker2: ...")
};

function formatDateFR(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR");
}

function formatTimeFR(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function clamp(str: string, maxChars: number) {
    return str.length > maxChars ? str.slice(0, maxChars) : str;
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as ReqBody;

        if (!body?.title) {
            return NextResponse.json({ error: "Missing title" }, { status: 400 });
        }
        if (!body?.transcriptText?.trim()) {
            return NextResponse.json({ error: "Missing transcriptText" }, { status: 400 });
        }

        const title = body.title;
        const date = formatDateFR(body.startISO);
        const heure = body.startISO && body.endISO
            ? `${formatTimeFR(body.startISO)} - ${formatTimeFR(body.endISO)}`
            : formatTimeFR(body.startISO);

        const participants = (body.participants ?? []).filter(Boolean);

        // On limite la taille (sécurité tokens)
        const transcript = clamp(body.transcriptText.trim(), 80_000);

        const openai = getOpenAIClient();

        // ✅ Structured Outputs (json_schema) recommandé
        const schema = {
            name: "meeting_summary",
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    titre: { type: "string" },
                    date: { type: "string" },
                    heure: { type: "string" },
                    participants: { type: "array", items: { type: "string" } },

                    synthese_4_5_lignes: { type: "string" },
                    compte_rendu_10_points: {
                        type: "array",
                        minItems: 10,
                        maxItems: 10,
                        items: { type: "string" }
                    }
                },
                required: [
                    "titre",
                    "date",
                    "heure",
                    "participants",
                    "synthese_4_5_lignes",
                    "compte_rendu_10_points"
                ]
            },
            strict: true
        } as const;

        const system = `
Tu es un assistant de compte-rendu de réunion (FR), style professionnel.
Règles :
- Tu n'inventes rien. Si une info n'est pas dans la transcription, tu restes vague.
- Les 10 bullet points doivent couvrir : décisions (prises ou non), actions/tâches (ou absence d'action), points clés, risques/blocages si mentionnés.
- Synthèse : 4 à 5 lignes maximum, ton pro.
- Pas de données sensibles (mots de passe, tokens).`;

        const user = `
INFOS RÉUNION (fiables) :
- Titre: ${title}
- Date: ${date}
- Heure: ${heure}
- Participants: ${participants.length ? participants.join(", ") : "non fournis"}

TRANSCRIPTION (source) :
"""${transcript}"""
`;

        const r = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_schema", json_schema: schema },
            messages: [
                { role: "system", content: system.trim() },
                { role: "user", content: user.trim() }
            ]
        });

        const content = r.choices[0]?.message?.content ?? "{}";
        const json = JSON.parse(content);

        // ✅ On force les méta fiables (sans laisser le modèle “corriger”)
        json.titre = title;
        json.date = date;
        json.heure = heure;
        json.participants = participants;

        return NextResponse.json({ success: true, data: json });
    } catch (e: any) {
        console.error("[AI Summary] Error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Internal server error" },
            { status: 500 }
        );
    }
}
