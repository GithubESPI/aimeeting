// lib/summarize-meeting.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type ActionItem = { tache: string; owner: string; deadline: string | null };

export type SummaryShape = {
    titre: string;
    date: string;
    heure: string;
    participants: string[];
    resume: string;
    compte_rendu_etendu?: string;
    contenu_detaille?: string;
    compteRendu?: string;              // 👈 AJOUT
    points_cles?: string[];
    risques_ou_blocages?: string[];
    decisions: string[];
    actions: ActionItem[];
    meta?: { exclusions?: string[] };
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
            Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
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

        const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

        const s: SummaryShape = {
            titre: asStr(obj["titre"]) || fallbackTitle || "Compte rendu",
            date: asStr(obj["date"]),
            heure: asStr(obj["heure"]),
            participants: asArr(obj["participants"]),
            resume: asStr(obj["resume"]),
            compte_rendu_etendu: asStr(obj["compte_rendu_etendu"]),
            contenu_detaille: asStr(obj["contenu_detaille"]),   // <--- AJOUT
            compteRendu: asStr(obj["compteRendu"]),
            points_cles: asArr(obj["points_cles"]),
            risques_ou_blocages: asArr(obj["risques_ou_blocages"]),
            decisions: asArr(obj["decisions"]),
            actions: asActions(obj["actions"]),
            meta: obj["meta"] && typeof obj["meta"] === "object"
                ? { exclusions: asArr((obj["meta"] as any)["exclusions"]) }
                : { exclusions: [] },
        };


        if (s.compte_rendu_etendu && !s.compteRendu) s.compteRendu = s.compte_rendu_etendu;
        if (s.compteRendu && !s.compte_rendu_etendu) s.compte_rendu_etendu = s.compteRendu;

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
            compteRendu: "",                 // 👈
            compte_rendu_etendu: "",
            contenu_detaille: "",            // 👈 optionnel, mais propre
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
  "date": string, 
  "heure": string, 
  "participants": string[],
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
                .join(" | ")}
`
        )
        .join("\n\n");

    const user = `Titre suggéré: ${title || "Compte rendu"}\n\nSOURCES:\n${packed}`;
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
    opts?: { title?: string; minWords?: number; maxWords?: number }
): Promise<SummaryShape> {
    const title = opts?.title ?? "";
    const minWords = Math.max(opts?.minWords ?? FINAL_MIN_DEFAULT, 800);
    const maxWords = Math.max(Math.round(minWords * 1.35), minWords + 200);

    // 1) nettoyage + clamp global
    const clean = sanitizeTranscript(rawTranscript);
    const hardMaxChars = CHUNK_TARGET_TOKENS * 4 * MAX_CHUNKS;
    const transcript = clampChars(clean, hardMaxChars);

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

    // 5) si trop court, on étend le compte-rendu étendu
    const base =
        finalSummary.compte_rendu_etendu || finalSummary.compteRendu || "";
    if (countWords(base) < minWords) {
        const expandSystem = `
Tu allonges ce compte-rendu **sans inventer**. Reste entre ${minWords}-${maxWords} mots.
Style narratif professionnel, paragraphes complets, pas de listes.`;
        const expandUser = `TEXTE:\n"""${base}"""`;

        const r = await openai.chat.completions.create({
            model: MODEL_PRIMARY,
            temperature: 0.2,
            messages: [
                { role: "system", content: expandSystem.trim() },
                { role: "user", content: expandUser },
            ],
        });

        const ext = redactSensitive((r.choices[0]?.message?.content || "").trim());
        if (ext) {
            finalSummary.compte_rendu_etendu = ext;
            finalSummary.compteRendu = ext;
        }
    }

    // 6) générer / compléter le contenu détaillé si besoin
    if (!finalSummary.contenu_detaille || finalSummary.contenu_detaille.length < 500) {
        const expandSystemDetail = `
Tu réécris ce compte-rendu détaillé en 4–8 paragraphes, style professionnel,
sans inventer d'informations, avec précision chronologique.`;
        const expandUserDetail = `TEXTE:\n"""${base}"""`;

        const r2 = await openai.chat.completions.create({
            model: MODEL_PRIMARY,
            temperature: 0.2,
            messages: [
                { role: "system", content: expandSystemDetail.trim() },
                { role: "user", content: expandUserDetail },
            ],
        });

        const ext2 = redactSensitive((r2.choices[0]?.message?.content || "").trim());
        if (ext2) {
            finalSummary.contenu_detaille = ext2;
        }
    }

    return finalSummary;
}
