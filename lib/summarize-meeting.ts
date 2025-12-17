// lib/summarize-meeting.ts
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

// 🔹 On n'instancie OpenAI qu'au moment où on en a besoin, pas au chargement du module
function getOpenAIClient() {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // Cette erreur sera catchée dans ta route API
            throw new Error("OPENAI_API_KEY is not set in environment");
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

type ActionItem = { tache: string; owner: string; deadline: string | null };

export type SummaryShape = {
    titre: string;
    date: string;
    heure: string;
    participants: string[];
    resume: string;
    compte_rendu_etendu?: string;
    contenu_detaille?: string;
    compteRendu?: string;
    points_cles?: string[];
    risques_ou_blocages?: string[];
    decisions: string[];
    actions: ActionItem[];
    meta?: { exclusions?: string[] };

    // ✅ NEW
    speakers?: string[];
    verbatims?: { speaker: string; quote: string }[];
};


// -------------------- Config anti-429 --------------------
const MODEL_PRIMARY = "gpt-4o-mini"; // model pas cher / léger
const CHUNK_TARGET_TOKENS = 4500;
const MAX_CHUNKS = 10;
const FINAL_MIN_DEFAULT = 1200;
// ---------------------------------------------------------

// ≈ estimation simple : 1 token ~ 4 chars (FR)
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const clampChars = (s: string, maxChars: number) =>
    s.length > maxChars ? s.slice(0, maxChars) : s;

function sanitizeTranscript(raw: string) {
    return raw
        .replace(/\[(?:silence|silence prolonged|music|crosstalk)[^\]]*\]/gi, " ")
        .replace(/\b(hmm+|euh+|hum+|heu+)\b/gi, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

function redactSensitive(text: string) {
    const patterns: RegExp[] = [
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}\b/g,
        /\b(?:[A-Z]{2}\d{2}[A-Z0-9]{1,30})\b/g,
        /\b(?:\d[ -]*?){13,19}\b/g,
        /\bhttps?:\/\/[^\s"]+/gi,
        /\b(AZURE|AWS|GCP|API|SECRET|TOKEN|KEY|PASSWORD|MDP)\b\s*[:=]\s*[^\s",]+/gi,
    ];
    let out = text;
    for (const p of patterns) out = out.replace(p, "[confidentiel]");
    return out;
}

function extractSpeakersAndQuotes(transcript: string) {
    const lines = transcript
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    // "Didier LATOUR : bla bla"
    const speakerRegex = /^([^:]{2,60})\s*:\s*(.+)$/;

    const speakersSet = new Set<string>();
    const samples: { speaker: string; quote: string }[] = [];

    for (const line of lines) {
        const m = line.match(speakerRegex);
        if (!m) continue;

        const speaker = m[1].trim();
        const quote = m[2].trim();

        speakersSet.add(speaker);

        // on garde quelques citations “propres”
        if (quote.length >= 40 && quote.length <= 180 && samples.length < 10) {
            samples.push({ speaker, quote });
        }
    }

    return {
        speakers: Array.from(speakersSet),
        verbatims: samples.slice(0, 8),
    };
}


// Split “doux” par paragraphes en respectant un budget token approximatif
function splitTranscriptToChunks(
    tx: string,
    targetTokens = CHUNK_TARGET_TOKENS
): string[] {
    const paras = tx
        .split(/\n{2,}/g)
        .map((p) => p.trim())
        .filter(Boolean);

    const chunks: string[] = [];
    let cur = "";
    let curTok = 0;

    for (const p of paras) {
        const t = estimateTokens(p) + 20;
        if (cur && curTok + t > targetTokens) {
            chunks.push(cur.trim());
            cur = p;
            curTok = t;
        } else {
            cur += (cur ? "\n\n" : "") + p;
            curTok += t;
        }
        if (chunks.length >= MAX_CHUNKS) break;
    }

    if (cur && chunks.length < MAX_CHUNKS) chunks.push(cur.trim());
    return chunks;
}

function parseSummaryJSON(content: string, fallbackTitle: string): SummaryShape {
    try {
        const raw = JSON.parse(content);
        const asStr = (v: unknown) => (typeof v === "string" ? v : "");
        const asArr = (v: unknown) =>
            Array.isArray(v)
                ? (v.filter((x) => typeof x === "string") as string[])
                : [];
        const asActions = (v: unknown): ActionItem[] =>
            Array.isArray(v)
                ? v.map((a) => {
                    const o = (a ?? {}) as Record<string, unknown>;
                    const dl = o["deadline"];
                    return {
                        tache: asStr(o["tache"]),
                        owner: asStr(o["owner"]),
                        deadline: dl === null ? null : asStr(dl),
                    };
                })
                : [];

        const obj =
            raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

        const s: SummaryShape = {
            titre: asStr(obj["titre"]) || fallbackTitle || "Compte rendu",
            date: asStr(obj["date"]),
            heure: asStr(obj["heure"]),
            participants: asArr(obj["participants"]),
            resume: asStr(obj["resume"]),
            compte_rendu_etendu: asStr(obj["compte_rendu_etendu"]),
            contenu_detaille: asStr(obj["contenu_detaille"]),
            compteRendu: asStr(obj["compteRendu"]),
            points_cles: asArr(obj["points_cles"]),
            risques_ou_blocages: asArr(obj["risques_ou_blocages"]),
            decisions: asArr(obj["decisions"]),
            actions: asActions(obj["actions"]),
            meta:
                obj["meta"] && typeof obj["meta"] === "object"
                    ? { exclusions: asArr((obj["meta"] as any)["exclusions"]) }
                    : { exclusions: [] },
        };

        if (s.compte_rendu_etendu && !s.compteRendu)
            s.compteRendu = s.compte_rendu_etendu;
        if (s.compteRendu && !s.compte_rendu_etendu)
            s.compte_rendu_etendu = s.compteRendu;

        return s;
    } catch {
        return {
            titre: fallbackTitle || "Compte rendu",
            date: "",
            heure: "",
            participants: [],
            resume: "",
            decisions: [],
            actions: [],
            compteRendu: "",
            compte_rendu_etendu: "",
            contenu_detaille: "",
            points_cles: [],
            risques_ou_blocages: [],
            meta: { exclusions: [] },
        };
    }
}

const countWords = (s: string) =>
    (s.match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length;

async function summarizeChunk(chunk: string) {
    const system = `Tu résumes ce morceau de réunion en FR (professionnel).
Retourne STRICTEMENT ce JSON: {
  "resume": string,
  "narratif": string,
  "points_cles": string[],
  "decisions": string[],
  "actions": [ { "tache": string, "owner": string, "deadline": string | null } ]
}`;
    const user = `MORCEAU:\n"""${chunk}"""`;

    const openai = getOpenAIClient();

    const r = await openai.chat.completions.create({
        model: MODEL_PRIMARY,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });

    const json = r.choices[0]?.message?.content ?? "{}";
    return JSON.parse(redactSensitive(json)) as {
        resume: string;
        narratif: string;
        points_cles: string[];
        decisions: string[];
        actions: ActionItem[];
    };
}

async function composeFinal(
    title: string,
    chunksData: Awaited<ReturnType<typeof summarizeChunk>>[],
    minWords: number,
    maxWords: number
) {
    const system = `Compose un compte-rendu FINAL en FR (pro, exhaustif).
Contraintes :
- "compte_rendu_etendu" = récit fluide multi-paragraphes **${minWords}-${maxWords} mots**, pas de listes.
- "contenu_detaille" = version encore plus riche, descriptive, chronologique, précise, en 4–8 paragraphes.
- Combine et déduplique les infos des morceaux.
- Pas d'invention; si info absente, ne pas la créer.
- JSON STRICT: {
  "titre": string,
  "resume": string,
  "compte_rendu_etendu": string,
  "contenu_detaille": string,
  "points_cles": string[],
  "risques_ou_blocages": string[],
  "decisions": string[],
  "actions": [ { "tache": string, "owner": string, "deadline": string | null } ],
  "meta": { "exclusions": string[] }
}`;


    const packed = chunksData
        .map(
            (c, i) => `#CHUNK ${i + 1}
Résumé:\n${c.resume}
Narratif:\n${c.narratif}
Points clés: ${c.points_cles.join(" | ")}
Décisions: ${c.decisions.join(" | ")}
Actions: ${c.actions
                .map((a) => `${a.tache} @${a.owner} ${a.deadline ?? ""}`)
                .join(" | ")}`
        )
        .join("\n\n");

    const user = `Titre suggéré: ${title || "Compte rendu"}\n\nSOURCES:\n${packed}`;

    const openai = getOpenAIClient();

    const r = await openai.chat.completions.create({
        model: MODEL_PRIMARY,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });

    return parseSummaryJSON(
        redactSensitive(r.choices[0]?.message?.content ?? "{}"),
        title
    );
}

/**
 * Fonction principale appelée par ta route API.
 */
export async function summarizeTranscript(
    rawTranscript: string,
    opts?: {
        title?: string;
        minWords?: number;
        maxWords?: number;

        // ✅ NEW: valeurs fiables venant de ta BDD (route API)
        meetingDateISO?: string;      // ex: meeting.startDateTime.toISOString()
        participants?: string[];      // ex: attendees
    }
): Promise<SummaryShape> {
    const title = opts?.title ?? "";
    const minWords = Math.max(opts?.minWords ?? FINAL_MIN_DEFAULT, 800);
    const maxWords = Math.max(Math.round(minWords * 1.35), minWords + 200);

    // 1) nettoyage + clamp global
    const clean = sanitizeTranscript(rawTranscript);
    const hardMaxChars = CHUNK_TARGET_TOKENS * 4 * MAX_CHUNKS;
    const transcript = clampChars(clean, hardMaxChars);

// ✅ NEW: extraction "qui parle" depuis la transcription
    const { speakers, verbatims } = extractSpeakersAndQuotes(transcript);

// 2) split en chunks
    const chunks = splitTranscriptToChunks(transcript, CHUNK_TARGET_TOKENS);
    if (chunks.length === 0) {
        throw new Error("Empty transcript after cleaning.");
    }

// 3) résumer chaque chunk
    const parts: Awaited<ReturnType<typeof summarizeChunk>>[] = [];
    for (const c of chunks) {
        parts.push(await summarizeChunk(c));
    }

// 4) composer le résumé final long
    const finalSummary = await composeFinal(title, parts, minWords, maxWords);

// ✅ NEW: on force les métadonnées fiables (PAS celles du modèle)
    const meetingDateISO = opts?.meetingDateISO;
    const participants = opts?.participants ?? [];

    if (meetingDateISO) {
        const d = new Date(meetingDateISO);
        finalSummary.date = d.toLocaleDateString("fr-FR");
        finalSummary.heure = d.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    } else {
        finalSummary.date = finalSummary.date || "";
        finalSummary.heure = finalSummary.heure || "";
    }

    finalSummary.participants = participants;

// ✅ NEW: ajout "qui parle"
    finalSummary.speakers = speakers;
    finalSummary.verbatims = verbatims;



    // 5) si trop court, on étend le compte-rendu étendu
    const base =
        finalSummary.compte_rendu_etendu || finalSummary.compteRendu || "";
    if (countWords(base) < minWords) {
        const expandSystem = `Tu allonges ce compte-rendu **sans inventer** de nouvelles informations factuelles.
Reste entre ${minWords}-${maxWords} mots.
RÈGLES :
- Tu ne dois PAS ajouter ni modifier de dates, d'horaires ou de noms de participants.
- Si le texte d'entrée ne contient pas d'heure précise, tu n'en ajoutes pas.
- Utilise un style narratif professionnel avec des paragraphes complets, sans listes.\``;
        const expandUser = `TEXTE:\n"""${base}"""`;

        const openai = getOpenAIClient();

        const r = await openai.chat.completions.create({
            model: MODEL_PRIMARY,
            temperature: 0.2,
            messages: [
                { role: "system", content: expandSystem.trim() },
                { role: "user", content: expandUser },
            ],
        });

        const ext = redactSensitive(
            (r.choices[0]?.message?.content || "").trim()
        );
        if (ext) {
            finalSummary.compte_rendu_etendu = ext;
            finalSummary.compteRendu = ext;
        }
    }

    // 6) générer / compléter le contenu détaillé si besoin
    if (!finalSummary.contenu_detaille || finalSummary.contenu_detaille.length < 500) {
        const expandSystemDetail = `
Tu réécris ce compte-rendu détaillé en 4–8 paragraphes, style professionnel,
sans inventer d'informations ni modifier les faits.
RÈGLES :
- Ne crée ni ne modifie aucune date, aucun horaire, aucun lieu, aucun nom de participant.
- Si le texte d'entrée ne donne pas d'heure précise, tu n'en ajoutes pas.
- Tu améliores uniquement la clarté, la structure et le niveau de détail, pas le contenu factuel.`;
        const expandUserDetail = `TEXTE:\n"""${finalSummary.compte_rendu_etendu || base}"""`;

        const openai = getOpenAIClient();

        const r2 = await openai.chat.completions.create({
            model: MODEL_PRIMARY,
            temperature: 0.2,
            messages: [
                { role: "system", content: expandSystemDetail.trim() },
                { role: "user", content: expandUserDetail },
            ],
        });

        const ext2 = redactSensitive(
            (r2.choices[0]?.message?.content || "").trim()
        );
        if (ext2) {
            finalSummary.contenu_detaille = ext2;
        }
    }

    return finalSummary;
}
