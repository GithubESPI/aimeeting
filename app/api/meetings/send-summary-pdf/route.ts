// app/api/meetings/send-summary-pdf/route.ts
// ✅ Version qui utilise le token délégué de l'organisateur

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDelegatedAccessToken } from "@/lib/auth/getDelegatedToken";

export const dynamic = "force-dynamic";

type Body = {
    meetingId?: string;
    to: string[];
    subject: string;
    message: string;
    filename: string;
    pdfBase64: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Body;

        if (!body.to?.length) {
            return NextResponse.json(
                { error: "Aucun destinataire spécifié" },
                { status: 400 }
            );
        }

        if (!body.pdfBase64) {
            return NextResponse.json(
                { error: "PDF manquant" },
                { status: 400 }
            );
        }

        // ✅ Obtenir le token de l'utilisateur actuellement connecté
        const accessToken = await getDelegatedAccessToken();

        if (!accessToken) {
            return NextResponse.json(
                { error: "Token d'accès manquant. Vous devez être connecté pour envoyer des emails." },
                { status: 401 }
            );
        }

        // ✅ Construire le payload pour Microsoft Graph
        const mailPayload = {
            message: {
                subject: body.subject,
                body: {
                    contentType: "Text",
                    content: body.message,
                },
                toRecipients: body.to.map((email) => ({
                    emailAddress: { address: email },
                })),
                attachments: [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: body.filename,
                        contentType: "application/pdf",
                        contentBytes: body.pdfBase64,
                    },
                ],
            },
            saveToSentItems: true,
        };

        // ✅ Utiliser /me/sendMail car on a un token délégué
        const graphUrl = "https://graph.microsoft.com/v1.0/me/sendMail";

        console.log(`📧 Envoi d'email vers ${body.to.join(", ")}`);

        const graphRes = await fetch(graphUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(mailPayload),
        });

        const success = graphRes.ok;
        let errorMessage: string | null = null;

        if (!success) {
            const errorData = await graphRes.json().catch(() => ({}));
            errorMessage = errorData?.error?.message ?? `HTTP ${graphRes.status}`;
            console.error("❌ Erreur Graph API:", errorData);
        }

        // ✅ Logger en DB
        if (body.meetingId) {
            try {
                await prisma.emailLog.create({
                    data: {
                        meetingId: body.meetingId,
                        status: success ? "SENT" : "FAILED",
                        to: body.to,
                        subject: body.subject,
                        error: errorMessage,
                    },
                });

                // Mettre à jour lastEmailSentAt si succès
                if (success) {
                    await prisma.meeting.update({
                        where: { id: body.meetingId },
                        data: { lastEmailSentAt: new Date() },
                    });
                }
            } catch (dbErr) {
                console.error("[send-summary-pdf] Failed to log email:", dbErr);
                // Ne pas bloquer l'envoi si le log échoue
            }
        }

        if (!success) {
            return NextResponse.json(
                { error: errorMessage ?? "Erreur lors de l'envoi de l'email" },
                { status: graphRes.status }
            );
        }

        console.log(`✅ Email envoyé avec succès à ${body.to.length} destinataire(s)`);

        return NextResponse.json({
            success: true,
            message: `Email envoyé à ${body.to.length} destinataire(s)`,
        });
    } catch (e: any) {
        console.error("[send-summary-pdf] Error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Erreur serveur" },
            { status: 500 }
        );
    }
}