import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";


export const dynamic = "force-dynamic";

type Body = {
    // metadata display
    titre?: string;
    date?: string; // ex: "22/01/2026"
    heure?: string; // ex: "10:30 - 11:30"
    participants?: string[];

    // NEW: liaison DB
    graphId?: string; // eventId (calendar event id)
    onlineMeetingId?: string; // onlineMeeting id (celui utilisé pour transcripts)
    participantsEmails?: string[]; // emails pour envoi

    // optionnel mais utile
    organizerEmail?: string | null;
    startDateTime?: string | null;
    endDateTime?: string | null;

    transcriptText: string;
};

function getOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY manquant");
    return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Body;

        if (!body.transcriptText || body.transcriptText.trim().length < 20) {
            return NextResponse.json({ error: "Transcript vide ou trop court" }, { status: 400 });
        }

        const openai = getOpenAI();

        const system = `
      Tu es un assistant professionnel de compte-rendu de réunion en français.

      Tu dois produire STRICTEMENT un JSON valide.
      Aucun texte hors JSON. Aucun markdown.

      RÈGLES NON NÉGOCIABLES :

      ❌ AUCUNE invention
      ❌ AUCUNE répétition
      ❌ AUCUNE paraphrase circulaire
      ❌ AUCUNE généralité
      ❌ AUCUNE information absente de la transcription

      SI UNE INFORMATION N'EST PAS DANS LA TRANSCRIPTION → "Non précisé"

      STYLE :
      - professionnel
      - factuel
      - structuré
      - clairE
      - exploitable en entreprise

      STRUCTURE OBLIGATOIRE :

      "synthese_4_5_lignes"
      - 4 à 5 lignes maximum

      "compte_rendu_10_points"
      - EXACTEMENT 10 points
      - phrases synthétiques

      "compte_rendu_10_points_developpes"
      - EXACTEMENT 10 éléments (tableau)
      - CHAQUE élément DOIT contenir :
      - EXACTEMENT 2 paragraphes
      - paragraphes séparés par "\\n\\n"
      - CHAQUE paragraphe = 5 à 6 lignes minimum
      - chaque paragraphe développe un angle DIFFERENT du point
      - interdiction ABSOLUE de répéter les mêmes idées
      - interdiction ABSOLUE de reformuler le paragraphe précédent
      - chaque paragraphe apporte une information nouvelle issue de la transcription
      - "decisions" : liste des décisions prises (si aucune : ["Aucune décision formalisée"]).
      - "taches" : liste des tâches à réaliser (si aucune : [{ "tache":"Aucune tâche formalisée", "owner":"Non précisé", "deadline": null }]).

      SI UN POINT NE PERMET PAS 2 PARAGRAPHES → développer le CONTEXTE, les CONSÉQUENCES ou les IMPLICATIONS FACTUELLES (sans inventer).

      UN POINT AVEC 1 SEUL PARAGRAPHE = RÉPONSE INVALIDE.

      IMPORTANT :
      - Ne pas inventer de décisions ni de tâches.
      - Si un owner n'est pas explicitement indiqué, mets "Non précisé".
      - Si une deadline n'est pas explicitement indiquée, mets null.
    `;

        const user = `
      METADATA:
      - titre: ${body.titre ?? "Non précisé"}
      - date: ${body.date ?? "Non précisé"}
      - heure: ${body.heure ?? "Non précisé"}
      - participants: ${(body.participants ?? []).join(", ") || "Non précisé"}

      TRANSCRIPTION:
      """${body.transcriptText}"""

      RETOURNE STRICTEMENT CE JSON :

      {
        "titre": string,
        "date": string,
        "heure": string,
        "participants": string[],
        "synthese_4_5_lignes": string,
        "compte_rendu_10_points": string[],
        "compte_rendu_10_points_developpes": string[],
        "decisions": string[],
        "taches": [ { "tache": string, "owner": string, "deadline": string | null } ]
      }

      CONTRAINTES CRITIQUES :
      - "compte_rendu_10_points_developpes" :
      - tableau de 10 strings
      - CHAQUE string contient EXACTEMENT 2 paragraphes
      - paragraphes séparés par "\\n\\n"
      - CHAQUE paragraphe fait 5 à 6 lignes minimum
      - chaque paragraphe développe un angle différent du point
      - aucun contenu inventé
      - aucune répétition entre paragraphes
      - aucun remplissage
    `;

        console.log("🤖 [AI] Génération de la synthèse...");

        const r = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system.trim() },
                { role: "user", content: user.trim() },
            ],
        });

        const content = r.choices[0]?.message?.content ?? "{}";
        const json = JSON.parse(content);

        console.log("✅ [AI] Synthèse générée");

        // ✅ Persist en DB (si on peut identifier la Meeting)
        let meetingId: string | null = null;

        try {
            const session = await getServerSession(authOptions);
            const userId = (session as any)?.user?.id ?? null;

            const participantsEmails = Array.from(new Set((body.participantsEmails ?? []).filter(Boolean)));

            const where =
                body.graphId
                    ? { graphId: body.graphId }
                    : body.onlineMeetingId
                        ? { onlineMeetingId: body.onlineMeetingId }
                        : null;

            if (where) {
                console.log("💾 [DB] Mise à jour de la réunion...");

                const updatedMeeting = await prisma.meeting.update({
                    where,
                    data: {
                        status: "SUMMARY_READY", // ✅ Utiliser une valeur valide de l'enum

                        title: (body.titre ?? json?.titre ?? "Réunion") as string,
                        summaryJson: json,
                        participantsEmails,

                        organizerEmail: body.organizerEmail ?? undefined,
                        startDateTime: body.startDateTime ? new Date(body.startDateTime) : undefined,
                        endDateTime: body.endDateTime ? new Date(body.endDateTime) : undefined,

                        // optionnel: garder un texte transcript dans fullTranscript
                        fullTranscript: body.transcriptText,

                        // si tu as ajouté userId dans Meeting dans ton schema
                        ...(userId ? ({ userId } as any) : {}),
                    },
                    select: {
                        id: true,
                    },
                });

                meetingId = updatedMeeting.id;
                console.log("✅ [DB] Réunion mise à jour, ID:", meetingId);
            } else {
                console.warn("⚠️ [DB] Aucun identifiant (graphId/onlineMeetingId) fourni, impossible de persister");
            }
        } catch (dbErr: any) {
            console.error("[ai/meeting-summary] DB persist failed:", dbErr?.message ?? dbErr);
            // on continue : on renvoie la synthèse IA quand même
        }

        // ✅ Retourner la synthèse + l'ID de la réunion
        return NextResponse.json({
            ...json,
            meetingId, // ✅ Ajouter l'ID pour la redirection
        });
    } catch (e: any) {
        console.error("[ai/meeting-summary] Error:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur serveur IA" }, { status: 500 });
    }
}